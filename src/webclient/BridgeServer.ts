import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, isAbsolute, join, relative, resolve } from 'node:path';
import VisualSession, { SessionError } from './session/VisualSession';
import { parseChatRequest, parseLoginRequest, parseSelectRequest, parseVerbRequest } from './validate';
import { SERVICE_NAME, type BridgeEvent, type HealthResponse } from './contract';

export type BridgeServerOptions = {
    session: VisualSession;
    /** Directory with the built SPA (`index.html`); `null` when the web client has not been built. */
    staticDir: string | null;
    /** Version string reported by `/api/health`. */
    version: string;
};

const MAX_BODY_BYTES = 64 * 1024;

const STATUS_BY_CODE: Readonly<Record<string, number>> = {
    INVALID_ARGUMENT: 400,
    AUTH_FAILED: 401,
    BUSY: 409,
    INVALID_STATE: 409,
    ALREADY_CONNECTED: 409,
    SERVER_REJECTED: 409,
    NOT_CONNECTED: 502,
    CONNECTION_CLOSED: 502,
    TIMEOUT: 504,
    PROTOCOL: 502,
    HANDSHAKE_FAILED: 502,
};
const DEFAULT_ERROR_STATUS = 500;

const CONTENT_TYPES: Readonly<Record<string, string>> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.txt': 'text/plain; charset=utf-8',
    '.map': 'application/json; charset=utf-8',
};

/**
 * The HTTP/SSE surface of the web client.
 *
 * The browser SPA is same-origin with this server: REST calls for the session
 * lifecycle and gameplay verbs, an SSE stream (`/api/events`) for every realm
 * change, and the built SPA itself served from `staticDir`. The server is
 * deliberately dependency-free (`node:http` only) so the compiled `dist/` keeps
 * the repository's zero-runtime-dependency property.
 */
export default class BridgeServer {
    private readonly session: VisualSession;
    private readonly staticDir: string | null;
    private readonly version: string;
    private readonly server: Server;
    private readonly startedAt = Date.now();

    constructor(options: BridgeServerOptions) {
        this.session = options.session;
        this.staticDir = options.staticDir;
        this.version = options.version;
        this.server = createServer(
            (req, res) => void this.handle(req, res).catch((error) => this.sendUnexpectedError(res, error)),
        );
    }

    /** Start listening; resolves once the socket is bound. */
    listen(port: number, host = '127.0.0.1'): Promise<void> {
        return new Promise((resolveListen) => {
            this.server.listen(port, host, () => resolveListen());
        });
    }

    /** The bound address (use `port` 0 in tests to get an ephemeral port). */
    address(): { host: string; port: number } {
        const info = this.server.address();
        if (info === null || typeof info === 'string') {
            throw new Error('The bridge server is not listening');
        }
        return { host: info.address, port: info.port };
    }

    close(): Promise<void> {
        return new Promise((resolveClose, reject) => {
            this.server.close((error) => (error ? reject(error) : resolveClose()));
        });
    }

    // --- request handler ----------------------------------------------------

    private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const url = new URL(req.url ?? '/', 'http://localhost');
        const pathname = url.pathname;

        if (req.method === 'GET' && pathname === '/api/health') {
            const health: HealthResponse = {
                ok: true,
                name: SERVICE_NAME,
                version: this.version,
                server: {
                    engine: `node ${process.versions.node}`,
                    node: process.versions.node,
                    uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
                },
                defaults: {
                    auth: { ...this.session.getSnapshot().defaults.auth },
                    game: { ...this.session.getSnapshot().defaults.game },
                },
            };
            this.sendJson(res, 200, health);
            return;
        }

        if (req.method === 'GET' && pathname === '/api/state') {
            this.sendJson(res, 200, this.session.getSnapshot());
            return;
        }

        if (req.method === 'GET' && pathname === '/api/events') {
            this.openEventStream(req, res);
            return;
        }

        if (req.method === 'POST' && pathname === '/api/login') {
            const request = parseLoginRequest(await this.readBody(req));
            const snapshot = await this.session.login(request);
            this.sendJson(res, 200, { snapshot });
            return;
        }

        if (req.method === 'POST' && pathname === '/api/select') {
            const request = parseSelectRequest(await this.readBody(req));
            const snapshot = await this.session.select(request);
            this.sendJson(res, 200, { snapshot });
            return;
        }

        if (req.method === 'POST' && pathname === '/api/enter') {
            const snapshot = await this.session.enter();
            this.sendJson(res, 200, { snapshot });
            return;
        }

        if (req.method === 'POST' && pathname === '/api/chat') {
            const request = parseChatRequest(await this.readBody(req));
            this.session.chat(request);
            this.sendJson(res, 200, { ok: true });
            return;
        }

        if (req.method === 'POST' && pathname === '/api/verb') {
            const request = parseVerbRequest(await this.readBody(req));
            this.session.verb(request);
            this.sendJson(res, 200, { ok: true });
            return;
        }

        if (req.method === 'POST' && pathname === '/api/request-status') {
            const result = await this.session.requestServerStatus();
            this.sendJson(res, 200, result);
            return;
        }

        if (req.method === 'POST' && pathname === '/api/disconnect') {
            const snapshot = this.session.disconnect();
            this.sendJson(res, 200, { snapshot });
            return;
        }

        if (pathname.startsWith('/api/')) {
            this.sendJson(res, 404, {
                error: { code: 'NOT_FOUND', message: `Unknown API route ${req.method} ${pathname}` },
            });
            return;
        }

        if (req.method === 'GET' || req.method === 'HEAD') {
            await this.serveStatic(req, res, pathname);
            return;
        }

        this.sendJson(res, 405, {
            error: { code: 'METHOD_NOT_ALLOWED', message: `Method ${req.method ?? '?'} is not allowed on ${pathname}` },
        });
    }

    // --- static SPA ---------------------------------------------------------

    private async serveStatic(req: IncomingMessage, res: ServerResponse, pathname: string): Promise<void> {
        const staticDir = this.staticDir;
        if (staticDir === null) {
            const body =
                '<!doctype html><html><head><meta charset="utf-8"><title>open-mt2 web client</title></head>' +
                '<body style="font-family:system-ui;background:#0b0e14;color:#d8dee9;max-width:36rem;margin:4rem auto;padding:0 1rem">' +
                '<h1>Web client not built</h1>' +
                '<p>The browser UI has not been compiled yet. On the server you are running it from:</p>' +
                '<pre>npm install --prefix web\nnpm run build:web\nnpm run web</pre>' +
                '<p>Or, while developing, run <code>npm --prefix web run dev</code> and keep this bridge running.</p>' +
                '</body></html>';
            res.writeHead(200, {
                'Content-Type': 'text/html; charset=utf-8',
                'Content-Length': Buffer.byteLength(body),
            });
            res.end(body);
            return;
        }

        const candidate = pathname === '/' ? 'index.html' : pathname.slice(1);
        const filePath = resolve(staticDir, candidate);
        const rel = relative(staticDir, filePath);
        const traverses = rel.startsWith('..') || isAbsolute(rel);
        if (traverses) {
            this.sendJson(res, 404, { error: { code: 'NOT_FOUND', message: `No such asset: ${pathname}` } });
            return;
        }

        const fallbackToIndex = (): Promise<void> =>
            this.serveRaw(res, join(staticDir, 'index.html'), 'text/html; charset=utf-8', 'no-cache');

        try {
            const content = await readFile(filePath);
            const type = CONTENT_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
            const cache = candidate === 'index.html' ? 'no-cache' : 'public, max-age=3600';
            this.sendRaw(res, content, type, cache);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                throw error;
            }
            // SPA fallback: unknown paths are client-side routes served index.html.
            await fallbackToIndex();
        }
    }

    private async serveRaw(res: ServerResponse, file: string, type: string, cache: string): Promise<void> {
        const content = await readFile(file);
        this.sendRaw(res, content, type, cache);
    }

    private sendRaw(res: ServerResponse, content: Buffer, type: string, cache: string): void {
        res.writeHead(200, {
            'Content-Type': type,
            'Content-Length': content.byteLength,
            'Cache-Control': cache,
        });
        res.end(content);
    }

    // --- SSE event stream ---------------------------------------------------

    private openEventStream(req: IncomingMessage, res: ServerResponse): void {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no',
        });
        res.write(': connected\n\n');

        let sequence = 0;
        const onEvent = (event: BridgeEvent): void => {
            sequence += 1;
            res.write(`id: ${sequence}\nevent: update\ndata: ${JSON.stringify(event)}\n\n`);
        };
        const keepAlive = setInterval(() => res.write(': ping\n\n'), 15_000);
        keepAlive.unref();

        this.session.on('event', onEvent);
        req.on('close', () => {
            clearInterval(keepAlive);
            this.session.off('event', onEvent);
        });
    }

    // --- helpers ------------------------------------------------------------

    private readBody(req: IncomingMessage): Promise<unknown> {
        return new Promise<unknown>((resolveBody, reject) => {
            const chunks: Buffer[] = [];
            let size = 0;
            let settled = false;
            const settle = (fn: () => void): void => {
                if (settled) return;
                settled = true;
                fn();
            };

            req.on('data', (chunk: Buffer) => {
                size += chunk.byteLength;
                if (size > MAX_BODY_BYTES) {
                    settle(() => reject(new SessionError('Request body too large', 'INVALID_ARGUMENT')));
                    req.destroy();
                    return;
                }
                chunks.push(chunk);
            });
            req.on('end', () => {
                settle(() => {
                    if (chunks.length === 0) {
                        resolveBody({});
                        return;
                    }
                    const text = Buffer.concat(chunks).toString('utf8');
                    try {
                        resolveBody(JSON.parse(text));
                    } catch {
                        reject(new SessionError('Request body is not valid JSON', 'INVALID_ARGUMENT'));
                    }
                });
            });
            req.on('error', (error) => settle(() => reject(error)));
        });
    }

    private sendJson(res: ServerResponse, status: number, body: unknown): void {
        const text = JSON.stringify(body);
        res.writeHead(status, {
            'Content-Type': 'application/json; charset=utf-8',
            'Content-Length': Buffer.byteLength(text),
            'Cache-Control': 'no-store',
        });
        res.end(text);
    }

    private sendUnexpectedError(res: ServerResponse, error: unknown): void {
        if (res.headersSent) {
            res.destroy();
            return;
        }
        const sessionError = error instanceof SessionError ? error : undefined;
        if (sessionError) {
            this.sendJson(res, STATUS_BY_CODE[sessionError.code] ?? DEFAULT_ERROR_STATUS, {
                error: { code: sessionError.code, message: sessionError.message },
            });
            return;
        }
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[web-client] Unhandled error: ${message}`);
        this.sendJson(res, DEFAULT_ERROR_STATUS, {
            error: { code: 'INTERNAL', message: 'The web client bridge failed' },
        });
    }
}
