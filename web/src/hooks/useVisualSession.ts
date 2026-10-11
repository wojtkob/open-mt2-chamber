import { useCallback, useEffect, useReducer, useState } from 'react';
import { api } from '../lib/api';
import { listenBridgeEvents } from '../lib/sse';
import { viewReducer } from '../state/reducer';
import { createInitialView, type ViewState } from '../state/viewState';
import type { HealthResponse, LoginRequest, VerbRequest } from '@/webclient/contract';

export type SessionActions = {
    /** Authenticate and land on the character screen. */
    login: (input: LoginRequest) => Promise<void>;
    /** Load the character on `slot` and immediately enter the world. */
    enterWorld: (slot: number) => Promise<void>;
    chat: (message: string) => Promise<void>;
    verb: (request: VerbRequest) => Promise<void>;
    requestStatus: () => Promise<void>;
    /** Drop the session and return to the login screen. */
    disconnect: () => Promise<void>;
    /** Raise an error toast (used by screens for local validation failures). */
    notifyError: (message: string) => void;
    dismissToast: (id: string) => void;
};

export type SessionController = {
    view: ViewState;
    health: HealthResponse | null;
    actions: SessionActions;
};

/**
 * The SPA's data layer: opens the SSE stream, keeps a snapshot in sync, and
 * exposes promise-returning actions that surface every failure as a toast.
 * Components stay presentational and read state from `view`.
 */
export function useVisualSession(): SessionController {
    const [view, dispatch] = useReducer(viewReducer, createInitialView());
    const [health, setHealth] = useState<HealthResponse | null>(null);

    const refresh = useCallback(async (): Promise<void> => {
        try {
            dispatch({ type: 'snapshot', snapshot: await api.getState() });
        } catch {
            // The stream status badge already reports an unreachable bridge.
        }
    }, []);

    useEffect(() => {
        let active = true;
        api.health()
            .then((result) => {
                if (active) setHealth(result);
            })
            .catch(() => {
                if (active) setHealth(null);
            });
        void refresh();

        const dispose = listenBridgeEvents({
            onEvent: (event) => dispatch({ type: 'event', event }),
            onStatus: (online) => {
                dispatch({ type: 'stream', online });
                if (online) void refresh();
            },
        });

        return () => {
            active = false;
            dispose();
        };
    }, [refresh]);

    const guard = useCallback(async <T>(operation: () => Promise<T>): Promise<void> => {
        try {
            await operation();
        } catch (error) {
            dispatch({ type: 'toast', kind: 'error', message: error instanceof Error ? error.message : String(error) });
        }
    }, []);

    const actions: SessionActions = {
        // The bridge broadcasts a `snapshot` event on the SSE stream after every
        // stateful call, so these only await the result to surface failures; the
        // view is updated from the ordered stream, never from the (possibly
        // older) HTTP response.
        login: (input) => guard(() => api.login(input)),
        enterWorld: (slot) =>
            guard(async () => {
                await api.select({ slot });
                await api.enter();
            }),
        chat: (message) => guard(() => api.chat({ message })),
        verb: (request) => guard(() => api.verb(request)),
        requestStatus: () =>
            guard(async () => {
                const result = await api.requestServerStatus();
                if (!result.success) {
                    dispatch({ type: 'toast', kind: 'info', message: 'The server reported no available channels' });
                }
            }),
        disconnect: () => guard(() => api.disconnect()),
        notifyError: (message) => dispatch({ type: 'toast', kind: 'error', message }),
        dismissToast: (id) => dispatch({ type: 'dismiss-toast', id }),
    };

    return { view, health, actions };
}
