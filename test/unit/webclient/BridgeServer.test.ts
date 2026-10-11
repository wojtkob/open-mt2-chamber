import { expect } from 'chai';
import Metin2Client from '@/client/Metin2Client';
import PacketHeaderEnum from '@/core/enum/PacketHeaderEnum';
import BridgeServer from '@/webclient/BridgeServer';
import VisualSession from '@/webclient/session/VisualSession';
import type { HealthResponse, LoginStage, Snapshot } from '@/webclient/contract';
import FakeServer, { TEST_CHARACTER, wireAuthServer, wireGameServer } from '../client/support/FakeMetin2Servers';

const AUTH_KEY = 0xabcdef;
const TIMEOUT_MS = 3_000;

type HttpResponse = { status: number; body: unknown; text: string };

async function readUntil(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    predicate: (accumulated: string) => boolean,
    timeoutMs = 3_000,
): Promise<string> {
    const decoder = new TextDecoder();
    let accumulated = '';
    const deadline = Date.now() + timeoutMs;
    while (!predicate(accumulated)) {
        if (Date.now() > deadline) throw new Error(`Timed out reading SSE; got: ${accumulated}`);
        const { value, done } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
    }
    return accumulated;
}

describe('BridgeServer', () => {
    let authServer: FakeServer;
    let gameServer: FakeServer;
    let client: Metin2Client;
    let session: VisualSession;
    let bridge: BridgeServer;
    let base: string;

    beforeEach(async () => {
        authServer = wireAuthServer(new FakeServer(), { username: 'admin', password: 'admin', key: AUTH_KEY });
        gameServer = wireGameServer(new FakeServer(), { key: AUTH_KEY, empireId: 2, characters: [TEST_CHARACTER] });
        await authServer.listen();
        await gameServer.listen();

        client = new Metin2Client();
        client.on('error', () => undefined);
        session = new VisualSession({
            client,
            version: '9.9.9',
            defaults: {
                auth: { host: '127.0.0.1', port: authServer.port },
                game: { host: '127.0.0.1', port: gameServer.port },
            },
        });
        bridge = new BridgeServer({ session, staticDir: null, version: '9.9.9' });
        await bridge.listen(0);
        base = `http://127.0.0.1:${bridge.address().port}`;
    });

    afterEach(async () => {
        await bridge.close();
        session.dispose();
        client.destroy();
        await authServer.close();
        await gameServer.close();
    });

    async function request(path: string, init?: RequestInit): Promise<HttpResponse> {
        const response = await fetch(`${base}${path}`, init);
        const text = await response.text();
        let body: unknown = null;
        if (text.length > 0) {
            try {
                body = JSON.parse(text);
            } catch {
                body = null;
            }
        }
        return { status: response.status, body, text };
    }

    function post(path: string, body: unknown): Promise<HttpResponse> {
        return request(path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
    }

    const loginBody = () => ({
        username: 'admin',
        password: 'admin',
        authHost: '127.0.0.1',
        authPort: authServer.port,
        gameHost: '127.0.0.1',
        gamePort: gameServer.port,
        timeoutMs: TIMEOUT_MS,
    });

    it('serves /api/health with the service identity and endpoints', async () => {
        const { status, body } = await request('/api/health');
        expect(status).to.equal(200);
        const health = body as HealthResponse;
        expect(health.ok).to.equal(true);
        expect(health.name).to.equal('open-mt2-web-client');
        expect(health.version).to.equal('9.9.9');
        expect(health.defaults.auth.port).to.equal(authServer.port);
        expect(health.defaults.game.port).to.equal(gameServer.port);
        expect(health.server.node).to.be.a('string');
    });

    it('serves the initial snapshot from /api/state', async () => {
        const { status, body } = await request('/api/state');
        expect(status).to.equal(200);
        const snapshot = body as Snapshot;
        expect(snapshot.stage).to.equal('idle');
        expect(snapshot.service.name).to.equal('open-mt2-web-client');
    });

    it('runs the whole lifecycle over HTTP', async () => {
        const login = await post('/api/login', loginBody());
        expect(login.status).to.equal(200);
        expect((login.body as { snapshot: Snapshot }).snapshot.stage).to.equal('select');

        const select = await post('/api/select', { slot: 0 });
        expect(select.status).to.equal(200);
        expect((select.body as { snapshot: Snapshot }).snapshot.stage).to.equal('loading');

        const enter = await post('/api/enter', {});
        expect(enter.status).to.equal(200);
        const entered = (enter.body as { snapshot: Snapshot }).snapshot;
        expect(entered.stage).to.equal('game');
        expect(entered.channel).to.equal(3);

        const chat = await post('/api/chat', { message: 'hi there' });
        expect(chat.status).to.equal(200);
        expect(chat.body).to.deep.equal({ ok: true });
        expect(gameServer.received.some((entry) => entry.header === PacketHeaderEnum.CHAT_IN)).to.equal(true);

        const verb = await post('/api/verb', { verb: 'target', targetVirtualId: 3 });
        expect(verb.status).to.equal(200);
        expect(gameServer.received.some((entry) => entry.header === PacketHeaderEnum.TARGET)).to.equal(true);

        const disconnect = await post('/api/disconnect', {});
        expect(disconnect.status).to.equal(200);
        expect((disconnect.body as { snapshot: Snapshot }).snapshot.stage).to.equal('idle');
    });

    it('maps a malformed body to a 400 INVALID_ARGUMENT', async () => {
        const missing = await post('/api/login', {});
        expect(missing.status).to.equal(400);
        expect((missing.body as { error: { code: string } }).error.code).to.equal('INVALID_ARGUMENT');

        const notJson = await request('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: 'not json',
        });
        expect(notJson.status).to.equal(400);
        expect((notJson.body as { error: { code: string } }).error.code).to.equal('INVALID_ARGUMENT');
    });

    it('maps an unknown verb to a 400 and a wrong password to a 401', async () => {
        const badVerb = await post('/api/verb', { verb: 'teleport' });
        expect(badVerb.status).to.equal(400);

        const badLogin = await post('/api/login', { ...loginBody(), password: 'nope' });
        expect(badLogin.status).to.equal(401);
        const error = (badLogin.body as { error: { code: string; message: string } }).error;
        expect(error.code).to.equal('AUTH_FAILED');
        expect(error.message).to.be.a('string');
    });

    it('returns 404 for an unknown API route', async () => {
        const { status, body } = await request('/api/nope');
        expect(status).to.equal(404);
        expect((body as { error: { code: string } }).error.code).to.equal('NOT_FOUND');
    });

    it('returns 405 for an unsupported method on a static path', async () => {
        const { status } = await post('/whatever', {});
        expect(status).to.equal(405);
    });

    it('explains how to build the SPA when no static directory is configured', async () => {
        const { status, text } = await request('/');
        expect(status).to.equal(200);
        expect(text).to.contain('Web client not built');
    });

    it('streams live events over SSE', async () => {
        const controller = new AbortController();
        const response = await fetch(`${base}/api/events`, { signal: controller.signal });
        expect(response.status).to.equal(200);
        expect(response.headers.get('content-type')).to.contain('text/event-stream');
        const reader = response.body!.getReader();
        try {
            const hello = await readUntil(reader, (accumulated) => accumulated.includes('connected'));
            expect(hello).to.contain(': connected');

            await post('/api/login', loginBody());
            const update = await readUntil(reader, (accumulated) => accumulated.includes('event: update'));
            expect(update).to.contain('event: update');
            expect(update).to.contain('"type":"stage"');
        } finally {
            controller.abort();
        }
    });

    it('confirms a reconnect snapshot reports the live stage', async () => {
        await post('/api/login', loginBody());
        const { body } = await request('/api/state');
        expect((body as Snapshot).stage).to.equal('select' as LoginStage);
    });
});
