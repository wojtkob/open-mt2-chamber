import { describe, expect, it } from 'vitest';
import type { BridgeEvent, ChatEntry, EntityState, ItemSnapshot, ServerPacket, Snapshot } from '@/webclient/contract';
import { applyBridgeEvent, viewReducer, type ViewAction } from './reducer';
import { createInitialView, emptySnapshot, type ViewState } from './viewState';

function makeEntity(overrides: Partial<EntityState> = {}): EntityState {
    return {
        vid: 1001,
        entityType: 0,
        name: 'Wild Dog',
        positionX: 10,
        positionY: 20,
        positionZ: 0,
        rotation: 0,
        playerClass: 0,
        movementSpeed: 100,
        attackSpeed: 100,
        state: 0,
        affects: [],
        parts: [],
        level: 5,
        empireId: 0,
        guildId: 0,
        rankPoints: 0,
        pkMode: 0,
        mountId: 0,
        dead: false,
        updatedAt: 0,
        ...overrides,
    };
}

function makeChat(overrides: Partial<ChatEntry> = {}): ChatEntry {
    return { messageType: 0, vid: 7, empireId: 1, message: 'hello', receivedAt: 1000, ...overrides };
}

function makeItem(overrides: Partial<ItemSnapshot> = {}): ItemSnapshot {
    return { window: 1, position: 0, id: 27987, count: 10, sockets: [], bonuses: [], ...overrides };
}

function rawPacket(): ServerPacket {
    return { type: 'raw', header: 0x99, payload: Buffer.from([1, 2, 3]) };
}

function makeSnapshot(overrides: Partial<Snapshot> = {}): Snapshot {
    return { ...emptySnapshot(), ...overrides };
}

describe('viewReducer', () => {
    it('applies a snapshot onto the current view', () => {
        const next = viewReducer(createInitialView(), {
            type: 'snapshot',
            snapshot: makeSnapshot({ stage: 'game', loggedInAs: 'admin' }),
        });
        expect(next.stage).toBe('game');
        expect(next.loggedInAs).toBe('admin');
    });

    it('marks the stream offline and online', () => {
        const offline = viewReducer(createInitialView(), { type: 'stream', online: false });
        expect(offline.streamOnline).toBe(false);
        const online = viewReducer(offline, { type: 'stream', online: true });
        expect(online.streamOnline).toBe(true);
    });

    it('appends a toast and dismisses it by id', () => {
        const withToast = viewReducer(createInitialView(), { type: 'toast', kind: 'error', message: 'boom' });
        expect(withToast.toasts).toHaveLength(1);
        expect(withToast.toasts[0]?.message).toBe('boom');
        const id = withToast.toasts[0]?.id;
        if (id === undefined) throw new Error('expected a toast id');
        const dismissed = viewReducer(withToast, { type: 'dismiss-toast', id });
        expect(dismissed.toasts).toHaveLength(0);
    });

    it('keeps at most five toasts', () => {
        let state = createInitialView();
        for (let index = 0; index < 8; index += 1) {
            state = viewReducer(state, { type: 'toast', kind: 'info', message: `m${index}` });
        }
        expect(state.toasts).toHaveLength(5);
        expect(state.toasts[4]?.message).toBe('m7');
    });

    it('collapses an identical toast raised twice (SSE error + failed request)', () => {
        let state = viewReducer(createInitialView(), { type: 'toast', kind: 'error', message: 'ECONNREFUSED' });
        state = viewReducer(state, { type: 'toast', kind: 'error', message: 'ECONNREFUSED' });
        expect(state.toasts).toHaveLength(1);

        // A same-text toast of a different kind is still distinct.
        state = viewReducer(state, { type: 'toast', kind: 'info', message: 'ECONNREFUSED' });
        expect(state.toasts).toHaveLength(2);
    });
});

describe('applyBridgeEvent', () => {
    it('moves the stage', () => {
        const next = applyBridgeEvent(createInitialView(), { type: 'stage', stage: 'select' });
        expect(next.stage).toBe('select');
    });

    it('routes connection state to the right connection', () => {
        const state = createInitialView();
        const auth = applyBridgeEvent(state, { type: 'connectionState', source: 'auth', state: 3, connected: true });
        expect(auth.auth).toEqual({ connected: true, connectionState: 3 });
        expect(auth.game).toEqual(state.game);

        const game = applyBridgeEvent(auth, { type: 'connectionState', source: 'game', state: 6, connected: true });
        expect(game.game).toEqual({ connected: true, connectionState: 6 });
    });

    it('buffers raw packets and caps the ring at 250', () => {
        let state = createInitialView();
        for (let index = 0; index < 260; index += 1) {
            state = applyBridgeEvent(state, { type: 'packet', source: 'game', packet: rawPacket() });
        }
        expect(state.rawPackets).toHaveLength(250);
        expect(state.rawPackets[0]?.packet.header).toBe(0x99);
    });

    it('appends chat lines and caps the log at 500', () => {
        let state = createInitialView();
        for (let index = 0; index < 520; index += 1) {
            state = applyBridgeEvent(state, {
                type: 'chat',
                entry: makeChat({ message: `m${index}`, receivedAt: index }),
            });
        }
        expect(state.chatLog).toHaveLength(500);
        expect(state.chatLog[499]?.message).toBe('m519');
    });

    it('adds, updates and removes entities', () => {
        let state = createInitialView();
        const spawned = makeEntity({ vid: 5, name: 'Dog' });
        state = applyBridgeEvent(state, { type: 'entityAdded', entity: spawned });
        expect(state.entities).toHaveLength(1);

        const moved = makeEntity({ vid: 5, name: 'Dog', positionX: 999 });
        state = applyBridgeEvent(state, { type: 'entityUpdated', entity: moved });
        expect(state.entities).toHaveLength(1);
        expect(state.entities[0]?.positionX).toBe(999);

        state = applyBridgeEvent(state, { type: 'entityRemoved', vid: 5 });
        expect(state.entities).toHaveLength(0);
    });

    it('keeps entity order stable across unrelated updates', () => {
        let state = createInitialView();
        state = applyBridgeEvent(state, { type: 'entityAdded', entity: makeEntity({ vid: 1 }) });
        state = applyBridgeEvent(state, { type: 'entityAdded', entity: makeEntity({ vid: 2 }) });
        state = applyBridgeEvent(state, { type: 'entityUpdated', entity: makeEntity({ vid: 1, name: 'updated' }) });
        expect(state.entities.map((entity) => entity.vid)).toEqual([1, 2]);
    });

    it('upserts inventory items by window and position', () => {
        let state = createInitialView();
        state = applyBridgeEvent(state, { type: 'itemChanged', item: makeItem({ window: 1, position: 0, count: 5 }) });
        state = applyBridgeEvent(state, { type: 'itemChanged', item: makeItem({ window: 1, position: 1, count: 2 }) });
        state = applyBridgeEvent(state, { type: 'itemChanged', item: makeItem({ window: 1, position: 0, count: 9 }) });
        expect(state.items).toHaveLength(2);
        expect(state.items.find((item) => item.position === 0)?.count).toBe(9);
    });

    it('applies scalar world updates', () => {
        const state = createInitialView();
        expect(applyBridgeEvent(state, { type: 'points', points: [0, 1, 2] }).points).toEqual([0, 1, 2]);
        expect(
            applyBridgeEvent(state, { type: 'skills', skills: [{ rank: 0, level: 5, timeToNextRead: 0 }] }).skills,
        ).toHaveLength(1);
        expect(applyBridgeEvent(state, { type: 'gameTime', time: 42 }).time).toBe(42);
        expect(applyBridgeEvent(state, { type: 'channel', channel: 2 }).channel).toBe(2);
        expect(
            applyBridgeEvent(state, {
                type: 'selfAffects',
                affects: [{ affectType: 4, apply: 0, value: 0, flag: 0, duration: 30, manaCost: 0, addedAt: 0 }],
            }).selfAffects,
        ).toHaveLength(1);
    });

    it('records the last error and raises a toast', () => {
        const next = applyBridgeEvent(createInitialView(), {
            type: 'error',
            source: 'game',
            code: 'TIMEOUT',
            message: 'timed out',
        });
        expect(next.lastError).toEqual({ code: 'TIMEOUT', message: 'timed out' });
        expect(next.toasts).toHaveLength(1);
        expect(next.toasts[0]?.kind).toBe('error');
    });

    it('drops to disconnected when the game closes mid-session', () => {
        const playing = applyBridgeEvent(createInitialView(), { type: 'stage', stage: 'game' });
        const closed = applyBridgeEvent(playing, { type: 'close', source: 'game', hadError: true });
        expect(closed.stage).toBe('disconnected');
        expect(closed.toasts).toHaveLength(1);
    });

    it('ignores a game close when already idle', () => {
        const state = createInitialView();
        const next = applyBridgeEvent(state, { type: 'close', source: 'game', hadError: false });
        expect(next).toBe(state);
    });

    it('replaces the whole view from a snapshot event while keeping toasts', () => {
        const withToast = viewReducer(createInitialView(), { type: 'toast', kind: 'info', message: 'keep me' });
        const next = applyBridgeEvent(withToast, {
            type: 'snapshot',
            snapshot: makeSnapshot({ stage: 'game', loggedInAs: 'admin' }),
        });
        expect(next.stage).toBe('game');
        expect(next.toasts).toHaveLength(1);
    });

    it('is exhaustive over the event union', () => {
        const events: ViewAction[] = [
            { type: 'event', event: { type: 'stage', stage: 'idle' } as BridgeEvent },
            { type: 'event', event: { type: 'connectionState', source: 'auth', state: 0, connected: false } },
            { type: 'event', event: { type: 'packet', source: 'auth', packet: rawPacket() } },
            { type: 'event', event: { type: 'chat', entry: makeChat() } },
            { type: 'event', event: { type: 'entityAdded', entity: makeEntity() } },
            { type: 'event', event: { type: 'entityUpdated', entity: makeEntity() } },
            { type: 'event', event: { type: 'entityRemoved', vid: 1 } },
            { type: 'event', event: { type: 'shopChanged', shop: null } },
            { type: 'event', event: { type: 'points', points: [] } },
            { type: 'event', event: { type: 'skills', skills: [] } },
            { type: 'event', event: { type: 'gameTime', time: 0 } },
            { type: 'event', event: { type: 'channel', channel: 0 } },
            { type: 'event', event: { type: 'itemChanged', item: makeItem() } },
            { type: 'event', event: { type: 'selfAffects', affects: [] } },
            { type: 'event', event: { type: 'error', source: 'game', code: 'X', message: 'x' } },
            { type: 'event', event: { type: 'close', source: 'auth', hadError: false } },
            { type: 'event', event: { type: 'snapshot', snapshot: makeSnapshot() } },
        ];
        let state: ViewState = createInitialView();
        for (const action of events) {
            state = viewReducer(state, action);
        }
        expect(state).toBeDefined();
    });
});
