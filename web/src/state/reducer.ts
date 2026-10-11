import type { BridgeEvent, EntityState, ItemSnapshot, Snapshot } from '@/webclient/contract';
import { createToast, type ToastKind, type ViewState } from './viewState';

const MAX_CHAT_LINES = 500;
const MAX_RAW_PACKETS = 250;
const MAX_TOASTS = 5;

export type ViewAction =
    | { type: 'snapshot'; snapshot: Snapshot }
    | { type: 'event'; event: BridgeEvent }
    | { type: 'stream'; online: boolean }
    | { type: 'toast'; kind: ToastKind; message: string }
    | { type: 'dismiss-toast'; id: string };

/**
 * The single reducer behind the whole UI. It is pure: every SSE event the hook
 * receives is replayed here as a diff against the current view, so the SPA has
 * exactly one place where server truth turns into screen state.
 */
export function viewReducer(state: ViewState, action: ViewAction): ViewState {
    switch (action.type) {
        case 'snapshot':
            return { ...state, ...action.snapshot };
        case 'stream':
            return { ...state, streamOnline: action.online };
        case 'toast':
            return addToast(state, action.kind, action.message);
        case 'dismiss-toast':
            return { ...state, toasts: state.toasts.filter((toast) => toast.id !== action.id) };
        case 'event':
            return applyBridgeEvent(state, action.event);
    }
}

/** Fold one bridge event into the view. Exported separately so it is unit-tested in isolation. */
export function applyBridgeEvent(state: ViewState, event: BridgeEvent): ViewState {
    switch (event.type) {
        case 'stage':
            return { ...state, stage: event.stage };
        case 'connectionState':
            return event.source === 'auth'
                ? { ...state, auth: { connected: event.connected, connectionState: event.state } }
                : { ...state, game: { connected: event.connected, connectionState: event.state } };
        case 'packet':
            return {
                ...state,
                rawPackets: [
                    ...state.rawPackets,
                    { source: event.source, receivedAt: Date.now(), packet: event.packet },
                ].slice(-MAX_RAW_PACKETS),
            };
        case 'chat':
            return { ...state, chatLog: [...state.chatLog, event.entry].slice(-MAX_CHAT_LINES) };
        case 'entityAdded':
        case 'entityUpdated':
            return { ...state, entities: upsertEntity(state.entities, event.entity) };
        case 'entityRemoved':
            return { ...state, entities: state.entities.filter((entity) => entity.vid !== event.vid) };
        case 'shopChanged':
            return { ...state, shop: event.shop };
        case 'points':
            return { ...state, points: event.points };
        case 'skills':
            return { ...state, skills: event.skills };
        case 'gameTime':
            return { ...state, time: event.time };
        case 'channel':
            return { ...state, channel: event.channel };
        case 'itemChanged':
            return { ...state, items: upsertItem(state.items, event.item) };
        case 'selfAffects':
            return { ...state, selfAffects: event.affects };
        case 'error':
            return addToast(
                { ...state, lastError: { code: event.code, message: event.message } },
                'error',
                event.message,
            );
        case 'close':
            if (event.source === 'game' && isActiveStage(state.stage)) {
                return addToast({ ...state, stage: 'disconnected' }, 'info', 'The game server closed the connection');
            }
            return state;
        case 'snapshot':
            return { ...state, ...event.snapshot };
    }
}

function isActiveStage(stage: ViewState['stage']): boolean {
    return stage === 'authenticating' || stage === 'select' || stage === 'loading' || stage === 'game';
}

function addToast(state: ViewState, kind: ToastKind, message: string): ViewState {
    // A connection failure reaches the UI twice: once as the SSE `error` event
    // and once as the rejected HTTP request. Collapse identical toasts so the
    // user sees one report per failure, not a stack of them.
    if (state.toasts.some((toast) => toast.kind === kind && toast.message === message)) {
        return state;
    }
    return { ...state, toasts: [...state.toasts, createToast(kind, message)].slice(-MAX_TOASTS) };
}

function upsertEntity(entities: EntityState[], entity: EntityState): EntityState[] {
    const index = entities.findIndex((candidate) => candidate.vid === entity.vid);
    if (index === -1) return [...entities, entity];
    const next = [...entities];
    next[index] = entity;
    return next;
}

function upsertItem(items: ItemSnapshot[], item: ItemSnapshot): ItemSnapshot[] {
    const index = items.findIndex(
        (candidate) => candidate.window === item.window && candidate.position === item.position,
    );
    if (index === -1) return [...items, item];
    const next = [...items];
    next[index] = item;
    return next;
}
