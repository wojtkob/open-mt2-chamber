import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Metin2Client, { DEFAULT_AUTH_PORT, DEFAULT_GAME_PORT } from '@/client/Metin2Client';
import BridgeServer from './BridgeServer';
import VisualSession from './session/VisualSession';

/**
 * The web client bridge entry point.
 *
 *   npm run build          # compiles this file into dist/webclient/main.js
 *   npm run build:web      # builds the browser SPA into web/dist
 *   npm run web            # starts this server (serves the SPA + the API)
 *
 * Environment (see .env.example):
 *   WEB_CLIENT_HOST        listen address (default 127.0.0.1; bind 0.0.0.0 to play from other devices)
 *   WEB_CLIENT_PORT        listen port (default 8080)
 *   WEB_CLIENT_DIR         explicit directory with the built SPA
 *   WEB_CLIENT_AUTH_HOST   auth server host used when the login form omits one (default 127.0.0.1)
 *   WEB_CLIENT_AUTH_PORT   auth server port (default 11002)
 *   WEB_CLIENT_GAME_HOST   game server host used when the login form omits one (default 127.0.0.1)
 *   WEB_CLIENT_GAME_PORT   game server port (default 13001)
 */

const PROJECT_ROOT = resolve(__dirname, '..', '..');

function envString(name: string, fallback: string): string {
    const value = process.env[name];
    return value !== undefined && value.trim().length > 0 ? value.trim() : fallback;
}

function envInt(name: string, fallback: number): number {
    const value = process.env[name];
    if (value === undefined) return fallback;
    const parsed = Number.parseInt(value, 10);
    return Number.isSafeInteger(parsed) ? parsed : fallback;
}

function readVersion(): string {
    try {
        const manifest = JSON.parse(readFileSync(resolve(PROJECT_ROOT, 'package.json'), 'utf8')) as {
            version?: unknown;
        };
        return typeof manifest.version === 'string' ? manifest.version : '0.0.0';
    } catch {
        return '0.0.0';
    }
}

function resolveStaticDir(): string | null {
    const declared = process.env.WEB_CLIENT_DIR;
    if (declared !== undefined && declared.trim().length > 0) {
        const dir = resolve(declared.trim());
        if (!existsSync(resolve(dir, 'index.html'))) {
            console.warn(`[web-client] WEB_CLIENT_DIR=${dir} has no index.html; the SPA will not be served`);
        }
        return dir;
    }
    const candidates = [resolve(PROJECT_ROOT, 'web', 'dist'), resolve(__dirname, 'static')];
    for (const candidate of candidates) {
        if (existsSync(resolve(candidate, 'index.html'))) {
            return candidate;
        }
    }
    return null;
}

async function main(): Promise<void> {
    const host = envString('WEB_CLIENT_HOST', '127.0.0.1');
    const port = envInt('WEB_CLIENT_PORT', 8080);
    const defaults = {
        auth: {
            host: envString('WEB_CLIENT_AUTH_HOST', '127.0.0.1'),
            port: envInt('WEB_CLIENT_AUTH_PORT', DEFAULT_AUTH_PORT),
        },
        game: {
            host: envString('WEB_CLIENT_GAME_HOST', '127.0.0.1'),
            port: envInt('WEB_CLIENT_GAME_PORT', DEFAULT_GAME_PORT),
        },
    };

    const client = new Metin2Client();
    const session = new VisualSession({ client, version: readVersion(), defaults });
    const staticDir = resolveStaticDir();
    const bridge = new BridgeServer({ session, staticDir, version: readVersion() });

    let shuttingDown = false;
    const shutdown = async (signal: string): Promise<void> => {
        if (shuttingDown) return;
        shuttingDown = true;
        console.log(`[web-client] received ${signal}, shutting down`);
        try {
            await bridge.close();
        } catch (error) {
            console.error(
                `[web-client] error while closing: ${error instanceof Error ? error.message : String(error)}`,
            );
        }
        session.dispose();
        process.exit(0);
    };
    process.on('SIGINT', () => void shutdown('SIGINT'));
    process.on('SIGTERM', () => void shutdown('SIGTERM'));

    await bridge.listen(port, host);
    console.log(`[web-client] open-mt2 web client ${readVersion()} → http://${host}:${port}`);
    console.log(`[web-client] auth server  → ${defaults.auth.host}:${defaults.auth.port}`);
    console.log(`[web-client] game server  → ${defaults.game.host}:${defaults.game.port}`);
    if (staticDir !== null) {
        console.log(`[web-client] serving the built SPA from ${staticDir}`);
    } else {
        console.log(`[web-client] SPA not built; run 'npm run build:web' for the browser UI`);
    }
}

main().catch((error) => {
    console.error(`[web-client] failed to start: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
});
