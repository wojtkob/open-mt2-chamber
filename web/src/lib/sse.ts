/**
 * SSE subscription to the bridge's live event stream (`GET /api/events`).
 *
 * The browser reconnects an `EventSource` automatically; we only surface the
 * online/offline status so the hook can refetch a fresh snapshot on every
 * (re)connect. Parsing is defensive: a malformed frame is dropped, never thrown
 * into the render tree.
 */

import type { BridgeEvent } from '@/webclient/contract';

export type BridgeStreamHandlers = {
    onEvent: (event: BridgeEvent) => void;
    /** `true` when the stream is open, `false` when the browser lost it. */
    onStatus: (online: boolean) => void;
};

function isBridgeEvent(value: unknown): value is BridgeEvent {
    return typeof value === 'object' && value !== null && typeof (value as { type?: unknown }).type === 'string';
}

function parseBridgeEvent(data: string): BridgeEvent | null {
    try {
        const parsed: unknown = JSON.parse(data);
        return isBridgeEvent(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

/**
 * Open the event stream. Returns a disposer that closes it and detaches every
 * listener.
 */
export function listenBridgeEvents(handlers: BridgeStreamHandlers): () => void {
    let closed = false;
    let source: EventSource | null = null;

    source = new EventSource('/api/events');

    source.addEventListener('open', () => {
        if (!closed) handlers.onStatus(true);
    });
    source.addEventListener('error', () => {
        if (!closed) handlers.onStatus(false);
    });
    source.addEventListener('update', (event) => {
        if (closed) return;
        const message = event as MessageEvent<string>;
        const parsed = parseBridgeEvent(message.data);
        if (parsed !== null) handlers.onEvent(parsed);
    });

    return () => {
        closed = true;
        source?.close();
        source = null;
    };
}
