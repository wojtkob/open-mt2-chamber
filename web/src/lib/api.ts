/**
 * Typed HTTP client for the web client bridge.
 *
 * Every method maps 1:1 to a bridge route and returns the contract type the
 * bridge promises. Non-2xx responses are turned into an {@link ApiError}
 * carrying the bridge's stable `code` so callers can branch on it; network
 * failures (bridge down, DNS, CORS) become `NETWORK`. Nothing is swallowed.
 */

import type {
    ApiErrorBody,
    ChatRequest,
    HealthResponse,
    LoginRequest,
    RequestServerStatusResponse,
    SelectRequest,
    Snapshot,
    VerbRequest,
} from '@/webclient/contract';

/** Where the bridge lives. Empty means "same origin" (the normal case); set
 *  `VITE_BRIDGE_BASE` at build time to point the SPA at a bridge on another
 *  host (for example when serving the SPA from a static host). */
const BRIDGE_BASE = import.meta.env.VITE_BRIDGE_BASE ?? '';

export class ApiError extends Error {
    readonly code: string;
    readonly status: number;

    constructor(message: string, code: string, status: number) {
        super(message);
        this.name = 'ApiError';
        this.code = code;
        this.status = status;
    }
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
    if (typeof value !== 'object' || value === null) return false;
    const error = (value as { error?: unknown }).error;
    if (typeof error !== 'object' || error === null) return false;
    const record = error as { code?: unknown; message?: unknown };
    return typeof record.code === 'string' && typeof record.message === 'string';
}

function parseJson(text: string): unknown {
    if (text.trim().length === 0) return undefined;
    try {
        return JSON.parse(text) as unknown;
    } catch {
        return undefined;
    }
}

async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    let response: Response;
    try {
        const init: RequestInit = { method };
        if (body !== undefined) {
            init.headers = { 'Content-Type': 'application/json' };
            init.body = JSON.stringify(body);
        }
        response = await fetch(`${BRIDGE_BASE}${path}`, init);
    } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new ApiError(`Could not reach the web client bridge (${detail})`, 'NETWORK', 0);
    }

    const parsed = parseJson(await response.text());
    if (!response.ok) {
        const error = isApiErrorBody(parsed)
            ? parsed.error
            : { code: 'HTTP_ERROR', message: `Request failed with status ${response.status}` };
        throw new ApiError(error.message, error.code, response.status);
    }
    // Trust boundary: the bridge is our own process and the response shape is
    // fixed by `contract.ts`; the generic cast is the single checkpoint here.
    return parsed as T;
}

async function unwrapSnapshot(promise: Promise<{ snapshot: Snapshot }>): Promise<Snapshot> {
    return (await promise).snapshot;
}

export const api = {
    health: (): Promise<HealthResponse> => request<HealthResponse>('GET', '/api/health'),
    getState: (): Promise<Snapshot> => request<Snapshot>('GET', '/api/state'),
    login: (input: LoginRequest): Promise<Snapshot> => unwrapSnapshot(request('POST', '/api/login', input)),
    select: (input: SelectRequest): Promise<Snapshot> => unwrapSnapshot(request('POST', '/api/select', input)),
    enter: (): Promise<Snapshot> => unwrapSnapshot(request('POST', '/api/enter', {})),
    chat: async (input: ChatRequest): Promise<void> => {
        await request('POST', '/api/chat', input);
    },
    verb: async (input: VerbRequest): Promise<void> => {
        await request('POST', '/api/verb', input);
    },
    requestServerStatus: (): Promise<RequestServerStatusResponse> => request('POST', '/api/request-status', {}),
    disconnect: (): Promise<Snapshot> => unwrapSnapshot(request('POST', '/api/disconnect', {})),
};

export type Api = typeof api;
