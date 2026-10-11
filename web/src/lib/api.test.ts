import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api } from './api';
import type { Snapshot } from '@/webclient/contract';

function jsonResponse(body: unknown, status = 200): Response {
    return {
        ok: status >= 200 && status < 300,
        status,
        text: () => Promise.resolve(JSON.stringify(body)),
    } as unknown as Response;
}

function textResponse(text: string, status: number): Response {
    return {
        ok: status >= 200 && status < 300,
        status,
        text: () => Promise.resolve(text),
    } as unknown as Response;
}

const fetchMock = vi.fn();

afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
});

beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
});

function makeSnapshot(): Snapshot {
    return {
        service: { name: 'open-mt2-web-client', version: '1.0.0' },
        stage: 'idle',
        auth: { connected: false, connectionState: 0 },
        game: { connected: false, connectionState: 0 },
        defaults: { auth: { host: '127.0.0.1', port: 11002 }, game: { host: '127.0.0.1', port: 13001 } },
        loggedInAs: null,
        account: null,
        selectedSlot: null,
        self: null,
        points: [],
        skills: [],
        time: null,
        channel: null,
        empireId: null,
        channels: [],
        entities: [],
        droppedItems: [],
        items: [],
        chatLog: [],
        selfAffects: [],
        shop: null,
        rawPackets: [],
        connectionEvents: [],
        lastError: null,
        busy: false,
    };
}

describe('api', () => {
    it('GETs the snapshot from /api/state', async () => {
        fetchMock.mockResolvedValue(jsonResponse(makeSnapshot()));
        const snapshot = await api.getState();
        expect(snapshot.service.name).toBe('open-mt2-web-client');
        expect(fetchMock).toHaveBeenCalledWith('/api/state', expect.objectContaining({ method: 'GET' }));
    });

    it('unwraps the snapshot from the login envelope and posts JSON', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ snapshot: makeSnapshot() }));
        const snapshot = await api.login({ username: 'admin', password: 'admin' });
        expect(snapshot.stage).toBe('idle');
        const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(init.method).toBe('POST');
        expect(init.body).toBe(JSON.stringify({ username: 'admin', password: 'admin' }));
        expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    });

    it('posts the verb payload and resolves void', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
        await expect(api.verb({ verb: 'target', targetVirtualId: 42 })).resolves.toBeUndefined();
        const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(init.body).toBe(JSON.stringify({ verb: 'target', targetVirtualId: 42 }));
    });

    it('maps a bridge error body to an ApiError with code and status', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ error: { code: 'BUSY', message: 'session active' } }, 409));
        await expect(api.login({ username: 'admin', password: 'admin' })).rejects.toMatchObject({
            name: 'ApiError',
            code: 'BUSY',
            status: 409,
            message: 'session active',
        });
    });

    it('falls back to HTTP_ERROR when the error body is not JSON', async () => {
        fetchMock.mockResolvedValue(textResponse('<html>oops</html>', 500));
        const error = await api.getState().catch((caught: unknown) => caught);
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).code).toBe('HTTP_ERROR');
        expect((error as ApiError).status).toBe(500);
    });

    it('maps a network failure to a NETWORK error', async () => {
        fetchMock.mockRejectedValue(new Error('connection refused'));
        const error = await api.health().catch((caught: unknown) => caught);
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).code).toBe('NETWORK');
        expect((error as ApiError).message).toContain('connection refused');
    });

    it('treats an empty success body as undefined', async () => {
        fetchMock.mockResolvedValue(textResponse('', 204));
        await expect(api.chat({ message: 'hi' })).resolves.toBeUndefined();
    });
});
