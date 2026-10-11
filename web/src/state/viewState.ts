import type { Snapshot } from '@/webclient/contract';

export type ToastKind = 'error' | 'success' | 'info';

export type Toast = {
    id: string;
    kind: ToastKind;
    message: string;
    at: number;
};

/**
 * The SPA's whole view model: the bridge {@link Snapshot} plus two pieces of
 * purely client-side state (stream health and transient toasts).
 */
export type ViewState = Snapshot & {
    streamOnline: boolean;
    toasts: Toast[];
};

/** A blank snapshot, used before the first `GET /api/state` resolves (and in tests). */
export function emptySnapshot(): Snapshot {
    return {
        service: { name: 'open-mt2-web-client', version: '' },
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

export function createInitialView(): ViewState {
    return { ...emptySnapshot(), streamOnline: true, toasts: [] };
}

export function createToast(kind: ToastKind, message: string): Toast {
    return { id: `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, kind, message, at: Date.now() };
}
