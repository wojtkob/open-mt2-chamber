import { ConnectionStateEnum } from '@/core/enum/ConnectionStateEnum';
import Metin2Client, { LoginOptions } from '@/client/Metin2Client';
import { AuthError, ClientError } from '@/client/errors';
import TypedEventEmitter from '@/client/util/TypedEventEmitter';
import type { ShopState } from '@/client/state/GameState';
import type { ServerPacket } from '@/client/protocol/ServerPackets';
import type {
    BridgeEndpoint,
    BridgeEvent,
    ChatRequest,
    ConnectionEventView,
    LoginRequest,
    LoginStage,
    RawPacketView,
    SelectRequest,
    SelfSummary,
    ShopGrid,
    Snapshot,
    VerbRequest,
} from '../contract';

export type VisualSessionEvents = {
    /** Every state change the session is willing to share, forwarded by the bridge to SSE observers. */
    event: (event: BridgeEvent) => void;
};

/**
 * A normalized, operation-level error the bridge turns into an HTTP response.
 * `code` is a stable string (client library code, `BUSY` or `INTERNAL`);
 * `status` carries the server's status token for auth failures.
 */
export class SessionError extends Error {
    readonly code: string;
    readonly status: string | null;

    constructor(message: string, code: string, status: string | null = null, options?: { cause?: unknown }) {
        super(message, options);
        this.name = 'SessionError';
        this.code = code;
        this.status = status;
    }
}

/** Map anything the client library throws into a `SessionError`. */
export function toSessionError(error: unknown): SessionError {
    if (error instanceof SessionError) return error;
    if (error instanceof AuthError)
        return new SessionError(error.message, 'AUTH_FAILED', error.status, { cause: error });
    if (error instanceof ClientError) return new SessionError(error.message, error.code, null, { cause: error });
    return new SessionError(error instanceof Error ? error.message : String(error), 'INTERNAL', null, { cause: error });
}

/** Codes that mean the session is no longer usable and must reconnect. */
const LETHAL_CODES = new Set([
    'AUTH_FAILED',
    'CONNECTION_CLOSED',
    'TIMEOUT',
    'NOT_CONNECTED',
    'PROTOCOL',
    'HANDSHAKE_FAILED',
]);

const MAX_RAW_PACKETS = 250;
const MAX_CONNECTION_EVENTS = 20;

type Account = { empireId: number | null; characters: ReturnType<Metin2Client['game']['getCharacters']> };

/**
 * The single live client session the bridge drives. Owns a {@link Metin2Client}
 * (which itself owns the auth socket, the game socket and the world model),
 * tracks which stage of the login flow the client is in, keeps the error/buffer
 * state the SPA renders, and re-broadcasts every realm change as a typed
 * {@link BridgeEvent} — exactly the shape `web/src` consumes.
 */
export default class VisualSession extends TypedEventEmitter<VisualSessionEvents> {
    private readonly client: Metin2Client;
    private readonly version: string;
    private readonly defaults: { auth: BridgeEndpoint; game: BridgeEndpoint };

    private stage: LoginStage = 'idle';
    private loggedInAs: string | null = null;
    private lastError: { code: string; message: string } | null = null;
    private busy = false;
    private readonly rawLog: RawPacketView[] = [];
    private readonly connectionEvents: ConnectionEventView[] = [];

    constructor(options: {
        client: Metin2Client;
        version: string;
        defaults: { auth: BridgeEndpoint; game: BridgeEndpoint };
    }) {
        super();
        this.client = options.client;
        this.version = options.version;
        this.defaults = options.defaults;

        this.client.on('authState', (state) => this.onConnectionState('auth', state));
        this.client.on('gameState', (state) => this.onConnectionState('game', state));
        this.client.on('packet', (source, packet) => this.onPacket(source, packet));
        this.client.on('error', (source, error) => this.onError(source, error));
        this.client.on('close', (source, info) => this.onClose(source, info));
        this.client.on('chat', (entry) => this.emitEvent({ type: 'chat', entry }));
        this.client.on('entityAdded', (entity) => this.emitEvent({ type: 'entityAdded', entity }));
        this.client.on('entityUpdated', (entity) => this.emitEvent({ type: 'entityUpdated', entity }));
        this.client.on('entityRemoved', (vid) => this.emitEvent({ type: 'entityRemoved', vid }));
        this.client.on('shopChanged', (shop) => this.emitEvent({ type: 'shopChanged', shop: toShopGrid(shop) }));

        this.client.state.on('pointsChanged', (points) => this.emitEvent({ type: 'points', points: [...points] }));
        this.client.state.on('skillsChanged', (skills) => this.emitEvent({ type: 'skills', skills }));
        this.client.state.on('gameTime', (time) => this.emitEvent({ type: 'gameTime', time }));
        this.client.state.on('channel', (channel) => this.emitEvent({ type: 'channel', channel }));
        this.client.state.on('itemChanged', (item) => this.emitEvent({ type: 'itemChanged', item }));
    }

    /** The current full world/session snapshot, JSON-safe for `GET /api/state`. */
    getSnapshot(): Snapshot {
        const state = this.client.state;
        const details = state.getSelf();
        const self: SelfSummary | null = details
            ? {
                  vid: details.vid,
                  playerName: details.playerName,
                  playerClass: details.playerClass,
                  level: state.getEntity(details.vid)?.level ?? 0,
                  positionX: details.positionX,
                  positionY: details.positionY,
                  positionZ: details.positionZ,
                  empireId: details.empireId,
                  skillGroup: details.skillGroup,
              }
            : null;

        const account: Account | null =
            this.loggedInAs !== null
                ? { empireId: this.client.game.getEmpireId(), characters: this.client.game.getCharacters() }
                : null;

        return {
            service: { name: 'open-mt2-web-client', version: this.version },
            stage: this.stage,
            auth: { connected: this.client.auth.isConnected, connectionState: this.client.auth.getState() },
            game: { connected: this.client.game.isConnected, connectionState: this.client.game.getState() },
            defaults: { auth: { ...this.defaults.auth }, game: { ...this.defaults.game } },
            loggedInAs: this.loggedInAs,
            account,
            selectedSlot: state.getSelectedSlot(),
            self,
            points: state.getPoints(),
            skills: state.getSkills(),
            time: state.getTime(),
            channel: state.getChannel(),
            empireId: state.getEmpire(),
            channels: state.getChannels(),
            entities: state.getEntities(),
            droppedItems: state.getDroppedItems(),
            items: state.getItems(),
            chatLog: state.getChatLog(),
            selfAffects: state.getSelfAffects(),
            shop: toShopGrid(state.getShop()),
            rawPackets: [...this.rawLog],
            connectionEvents: [...this.connectionEvents],
            lastError: this.lastError ? { ...this.lastError } : null,
            busy: this.busy,
        };
    }

    /**
     * Replace the server endpoints the login form (and API callers) pre-fill.
     *
     * The desktop client calls this when the user edits the server settings;
     * an active session keeps working and the next login uses the new
     * endpoints. Emits a `snapshot` event so SSE observers re-render.
     */
    setDefaults(defaults: { auth: BridgeEndpoint; game: BridgeEndpoint }): void {
        this.defaults.auth = { ...defaults.auth };
        this.defaults.game = { ...defaults.game };
        this.emitSnapshot();
    }

    // --- the login → select → enter flow ------------------------------------

    /**
     * Authenticate against the auth server, redeem the token on the game server
     * and move the session to the character-select stage.
     */
    async login(request: LoginRequest): Promise<Snapshot> {
        if (!request.username.trim()) {
            throw new SessionError('The account name must not be empty', 'INVALID_ARGUMENT');
        }
        if (
            this.stage === 'authenticating' ||
            this.stage === 'select' ||
            this.stage === 'loading' ||
            this.stage === 'game'
        ) {
            throw new SessionError('A game session is already active; disconnect before logging in again', 'BUSY');
        }
        if (this.stage === 'disconnected') {
            // The old sockets are gone; reset the model so a fresh login starts clean.
            this.client.destroy();
            this.connectionEvents.length = 0;
            this.rawLog.length = 0;
        }

        // The bridge's configured endpoints are the defaults and the form's
        // advanced section (or an API caller) overrides them. Without this the
        // SPA would silently ignore WEB_CLIENT_AUTH_PORT / WEB_CLIENT_GAME_PORT
        // and connect to the client library's hard-coded ports instead.
        const options: LoginOptions = {
            username: request.username.trim(),
            password: request.password,
            authHost: request.authHost ?? request.host ?? this.defaults.auth.host,
            authPort: request.authPort ?? request.port ?? this.defaults.auth.port,
            gameHost: request.gameHost ?? request.host ?? this.defaults.game.host,
            gamePort: request.gamePort ?? request.port ?? this.defaults.game.port,
            host: request.host,
            port: request.port,
            timeoutMs: request.timeoutMs,
        };

        this.busy = true;
        this.markStage('authenticating');
        try {
            await this.client.login(options);
            this.loggedInAs = options.username;
            this.lastError = null;
            this.markStage('select');
        } catch (error) {
            const sessionError = toSessionError(error);
            this.recordError(sessionError);
            this.markStage('disconnected');
            throw sessionError;
        } finally {
            this.busy = false;
            this.emitSnapshot();
        }
        return this.getSnapshot();
    }

    /** Load the character on `slot` (character-select stage only). */
    async select(request: SelectRequest): Promise<Snapshot> {
        if (this.stage !== 'select') {
            throw new SessionError('A character can only be selected from the character screen', 'INVALID_STATE');
        }
        this.busy = true;
        try {
            await this.client.selectCharacter(request.slot);
            this.lastError = null;
            this.markStage('loading');
        } catch (error) {
            const sessionError = toSessionError(error);
            this.recordError(sessionError);
            if (LETHAL_CODES.has(sessionError.code)) {
                this.markStage('disconnected');
            }
            throw sessionError;
        } finally {
            this.busy = false;
            this.emitSnapshot();
        }
        return this.getSnapshot();
    }

    /** Confirm the selected character and enter the world. */
    async enter(): Promise<Snapshot> {
        if (this.stage !== 'loading') {
            throw new SessionError('Entering the world requires a loaded character', 'INVALID_STATE');
        }
        this.busy = true;
        try {
            await this.client.enterGame();
            this.lastError = null;
            this.markStage('game');
        } catch (error) {
            const sessionError = toSessionError(error);
            this.recordError(sessionError);
            if (LETHAL_CODES.has(sessionError.code)) {
                this.markStage('disconnected');
            }
            throw sessionError;
        } finally {
            this.busy = false;
            this.emitSnapshot();
        }
        return this.getSnapshot();
    }

    /** Drop the session: destroy both sockets and reset the world model. */
    disconnect(): Snapshot {
        this.client.destroy();
        this.loggedInAs = null;
        this.lastError = null;
        this.connectionEvents.length = 0;
        this.rawLog.length = 0;
        this.busy = false;
        this.markStage('idle');
        this.emitSnapshot();
        return this.getSnapshot();
    }

    /** Ask the currently connected server for its channel status (fires once). */
    async requestServerStatus(
        timeoutMs = 10_000,
    ): Promise<{ success: boolean; channels: ReturnType<Metin2Client['state']['getChannels']> }> {
        const result = await this.client.requestServerStatus(timeoutMs);
        this.client.state.setChannels(result.channels);
        this.emitSnapshot();
        return { success: result.success, channels: result.channels };
    }

    // --- gameplay verbs ------------------------------------------------------

    /** Send one chat line (message type 0 = normal). */
    chat(request: ChatRequest): void {
        this.client.chat(request.message, request.messageType ?? 0);
    }

    /** Dispatch a validated gameplay verb to the game connection. */
    verb(request: VerbRequest): void {
        const client = this.client;
        switch (request.verb) {
            case 'move':
                client.move({
                    movementType: request.movementType,
                    arg: request.arg,
                    rotation: request.rotation,
                    positionX: request.positionX,
                    positionY: request.positionY,
                    time: request.time,
                });
                break;
            case 'target':
                client.target(request.targetVirtualId);
                break;
            case 'attack':
                client.attack({ skillVnum: request.skillVnum ?? 0, victimVirtualId: request.victimVirtualId });
                break;
            case 'useSkill':
                client.useSkill({ skillNum: request.skillNum, targetVirtualId: request.targetVirtualId });
                break;
            case 'useItem':
                client.useItem(request.window, request.position);
                break;
            case 'moveItem':
                client.moveItem({
                    fromWindow: request.fromWindow,
                    fromPosition: request.fromPosition,
                    toWindow: request.toWindow,
                    toPosition: request.toPosition,
                    count: request.count,
                });
                break;
            case 'dropItem':
                client.dropItem({
                    window: request.window,
                    position: request.position,
                    gold: request.gold,
                    count: request.count,
                });
                break;
            case 'pickUp':
                client.pickUpItem(request.virtualId);
                break;
            case 'click':
                client.click(request.targetVirtualId);
                break;
            case 'answerQuest':
                client.answerQuest(request.answer);
                break;
            case 'pressQuestButton':
                client.pressQuestButton(request.questId);
                break;
            case 'quickSlotAdd':
                client.quickSlotAdd(request.slot, request.type, request.position);
                break;
            case 'quickSlotSwap':
                client.quickSlotSwap(request.slotA, request.slotB);
                break;
            case 'quickSlotRemove':
                client.quickSlotRemove(request.slot);
                break;
            case 'aimFlyTarget':
                client.aimFlyTarget({
                    targetVirtualId: request.targetVirtualId,
                    positionX: request.positionX,
                    positionY: request.positionY,
                });
                break;
            case 'addFlyTarget':
                client.addFlyTarget({
                    targetVirtualId: request.targetVirtualId,
                    positionX: request.positionX,
                    positionY: request.positionY,
                });
                break;
            case 'shoot':
                client.shoot(request.type);
                break;
            case 'buyShopItem':
                client.buyShopItem(request.pos);
                break;
            case 'sellShopItem':
                client.sellShopItem(request.pos);
                break;
            case 'sellShopItems':
                client.sellShopItems(request.pos, request.count);
                break;
            case 'closeShop':
                client.closeShop();
                break;
        }
    }

    /** Release every listener held on the client and the state model. */
    dispose(): void {
        this.client.removeAllListeners();
        this.client.state.removeAllListeners();
        this.removeAllListeners('event');
    }

    // --- private -------------------------------------------------------------

    private onConnectionState(source: 'auth' | 'game', state: ConnectionStateEnum): void {
        this.connectionEvents.push({ source, state, connected: state !== ConnectionStateEnum.CLOSE, at: Date.now() });
        if (this.connectionEvents.length > MAX_CONNECTION_EVENTS) {
            this.connectionEvents.shift();
        }
        this.emitEvent({ type: 'connectionState', source, state, connected: state !== ConnectionStateEnum.CLOSE });
    }

    private onPacket(source: 'auth' | 'game', packet: ServerPacket): void {
        this.rawLog.push({ source, receivedAt: Date.now(), packet });
        if (this.rawLog.length > MAX_RAW_PACKETS) {
            this.rawLog.shift();
        }
        this.emitEvent({ type: 'packet', source, packet });

        // Buffs have no push event on the state model, only affectAdd/Remove
        // packets, so surface them from the packets themselves.
        if (source === 'game' && (packet.type === 'affectAdd' || packet.type === 'affectRemove')) {
            this.emitEvent({ type: 'selfAffects', affects: this.client.state.getSelfAffects() });
        }
    }

    private onError(source: 'auth' | 'game', error: Error): void {
        const code = error instanceof ClientError ? error.code : 'ERROR';
        this.lastError = { code, message: error.message };
        this.emitEvent({ type: 'error', source, code, message: error.message });
    }

    private onClose(source: 'auth' | 'game', info: { hadError: boolean }): void {
        this.emitEvent({ type: 'close', source, hadError: info.hadError });

        const active =
            this.stage === 'authenticating' ||
            this.stage === 'select' ||
            this.stage === 'loading' ||
            this.stage === 'game';
        if (source === 'game' && active && this.stage !== 'disconnected') {
            if (this.lastError === null) {
                this.lastError = {
                    code: 'CONNECTION_CLOSED',
                    message: info.hadError
                        ? 'The game server dropped the connection'
                        : 'The game server closed the connection',
                };
            }
            this.markStage('disconnected');
            this.emitEvent({ type: 'snapshot', snapshot: this.getSnapshot() });
        }
    }

    private markStage(stage: LoginStage): void {
        if (this.stage === stage) return;
        this.stage = stage;
        this.emitEvent({ type: 'stage', stage });
    }

    /**
     * Broadcast the full snapshot after a stateful transition. The SPA renders
     * account, points and world state that only exist on the snapshot (there is
     * no per-field event for them), and it must arrive on the same ordered SSE
     * stream as the granular events: an HTTP response can be older than the
     * `connectionState` events fired around it, and would otherwise clobber
     * them. Emitting here — after `busy` has settled — keeps the stream the one
     * source of truth for the view.
     */
    private emitSnapshot(): void {
        this.emitEvent({ type: 'snapshot', snapshot: this.getSnapshot() });
    }

    private recordError(error: SessionError): void {
        this.lastError = { code: error.code, message: error.message };
    }

    private emitEvent(event: BridgeEvent): void {
        this.emit('event', event);
    }
}

/** Convert the `Map`-backed shop state into the JSON-safe contract shape. */
function toShopGrid(shop: ShopState | null): ShopGrid {
    if (!shop) return null;
    return { ownerVid: shop.ownerVid, entries: [...shop.entries.values()] };
}
