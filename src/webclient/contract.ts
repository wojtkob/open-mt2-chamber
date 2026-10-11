/**
 * Wire contract shared by the web client bridge (Node, `src/webclient/`) and
 * the browser SPA (`web/`).
 *
 * The browser cannot speak raw TCP, so the bridge re-implements the client
 * flow over HTTP/SSE. Every payload that crosses that boundary is one of the
 * types below — the SPA imports them *type-only* from this single source of
 * truth (`@/webclient/contract` through the Vite `@` alias), so the shapes the
 * UI renders and the shapes the bridge produces can never drift apart by
 * construction.
 *
 * Types reused from the client library (`ServerPackets`, `GameState`) are plain
 * data and JSON-serialisable; the `Map`-based `ShopState` is reduced to a plain
 * array (`ShopGrid`), and every numeric enum the browser needs (connection
 * state, chat message type, ...) is documented below instead of forcing the SPA
 * to bundle core modules.
 */

import type {
    ChannelStatus,
    CharacterDetailsServerPacket,
    CharacterSummary,
    ItemSnapshot,
    ServerPacket,
    ShopEntry,
    SkillInfo,
} from '@/client/protocol/ServerPackets';
import type { ChatEntry, DroppedItem, EntityState, SelfAffect } from '@/client/state/GameState';

export type {
    ChannelStatus,
    CharacterDetailsServerPacket,
    CharacterSummary,
    ChatEntry,
    DroppedItem,
    EntityState,
    ItemSnapshot,
    SelfAffect,
    ServerPacket,
    ShopEntry,
    SkillInfo,
};

export const SERVICE_NAME = 'open-mt2-web-client' as const;

/** Which step of the login → select → enter flow the session is in. */
export type LoginStage = 'idle' | 'authenticating' | 'select' | 'loading' | 'game' | 'disconnected';

export type BridgeEndpoint = { host: string; port: number };

/** Reduced, JSON-safe form of `GameState.ShopState` (a `Map` cannot round-trip). */
export type ShopGrid = { ownerVid: number; entries: (ShopEntry & { pos: number })[] } | null;

/** What the profile screen renders; derived from `CharacterDetailsServerPacket`. */
export type SelfSummary = {
    vid: number;
    playerName: string;
    playerClass: number;
    level: number;
    positionX: number;
    positionY: number;
    positionZ: number;
    empireId: number;
    skillGroup: number;
};

export type AccountInfo = {
    empireId: number | null;
    characters: CharacterSummary[];
};

/** One raw decoded server packet, as pushed to SSE observers (best effort). */
export type RawPacketView = {
    source: 'auth' | 'game';
    receivedAt: number;
    packet: ServerPacket;
};

export type ConnectionEventView = {
    source: 'auth' | 'game';
    state: number;
    connected: boolean;
    at: number;
};

/**
 * A full, JSON-safe snapshot of the session. The SPA fetches one on connect
 * (and on SSE reconnect); every subsequent change arrives as a `BridgeEvent`.
 */
export type Snapshot = {
    service: { name: typeof SERVICE_NAME; version: string };
    stage: LoginStage;
    auth: { connected: boolean; connectionState: number };
    game: { connected: boolean; connectionState: number };
    defaults: { auth: BridgeEndpoint; game: BridgeEndpoint };
    loggedInAs: string | null;
    account: AccountInfo | null;
    selectedSlot: number | null;
    self: SelfSummary | null;
    points: number[];
    skills: SkillInfo[];
    time: number | null;
    channel: number | null;
    empireId: number | null;
    channels: ChannelStatus[];
    entities: EntityState[];
    droppedItems: DroppedItem[];
    items: ItemSnapshot[];
    chatLog: ChatEntry[];
    selfAffects: SelfAffect[];
    shop: ShopGrid;
    rawPackets: RawPacketView[];
    connectionEvents: ConnectionEventView[];
    lastError: { code: string; message: string } | null;
    busy: boolean;
};

/**
 * Every live update the bridge pushes over the SSE stream (and, from the SPA's
 * point of view, the state-diff actions of its reducer — the stream *is* the
 * UI state feed).
 */
export type BridgeEvent =
    | { type: 'stage'; stage: LoginStage }
    | { type: 'connectionState'; source: 'auth' | 'game'; state: number; connected: boolean }
    | { type: 'packet'; source: 'auth' | 'game'; packet: ServerPacket }
    | { type: 'chat'; entry: ChatEntry }
    | { type: 'entityAdded'; entity: EntityState }
    | { type: 'entityUpdated'; entity: EntityState }
    | { type: 'entityRemoved'; vid: number }
    | { type: 'shopChanged'; shop: ShopGrid }
    | { type: 'points'; points: number[] }
    | { type: 'skills'; skills: SkillInfo[] }
    | { type: 'gameTime'; time: number }
    | { type: 'channel'; channel: number }
    | { type: 'itemChanged'; item: ItemSnapshot }
    | { type: 'selfAffects'; affects: SelfAffect[] }
    | { type: 'error'; source: 'auth' | 'game'; code: string; message: string }
    | { type: 'close'; source: 'auth' | 'game'; hadError: boolean }
    | { type: 'snapshot'; snapshot: Snapshot };

// ---------------------------------------------------------------------------
// REST requests (all bodies are JSON)
// ---------------------------------------------------------------------------

export type LoginRequest = {
    username: string;
    password: string;
    authHost?: string;
    authPort?: number;
    gameHost?: string;
    gamePort?: number;
    host?: string;
    port?: number;
    timeoutMs?: number;
};

export type SelectRequest = { slot: number };

export type ChatRequest = { message: string; messageType?: number };

export type MoveVerbRequest = {
    verb: 'move';
    movementType: number;
    arg: number;
    rotation: number;
    positionX: number;
    positionY: number;
    time: number;
};
export type TargetVerbRequest = { verb: 'target'; targetVirtualId: number };
export type AttackVerbRequest = { verb: 'attack'; skillVnum?: number; victimVirtualId: number };
export type UseSkillVerbRequest = { verb: 'useSkill'; skillNum: number; targetVirtualId: number };
export type UseItemVerbRequest = { verb: 'useItem'; window: number; position: number };
export type MoveItemVerbRequest = {
    verb: 'moveItem';
    fromWindow: number;
    fromPosition: number;
    toWindow: number;
    toPosition: number;
    count: number;
};
export type DropItemVerbRequest = { verb: 'dropItem'; window: number; position: number; gold: number; count: number };
export type PickUpVerbRequest = { verb: 'pickUp'; virtualId: number };
export type ClickVerbRequest = { verb: 'click'; targetVirtualId: number };
export type AnswerQuestVerbRequest = { verb: 'answerQuest'; answer: number };
export type PressQuestButtonVerbRequest = { verb: 'pressQuestButton'; questId: number };
export type QuickSlotAddVerbRequest = { verb: 'quickSlotAdd'; slot: number; type: number; position: number };
export type QuickSlotSwapVerbRequest = { verb: 'quickSlotSwap'; slotA: number; slotB: number };
export type QuickSlotRemoveVerbRequest = { verb: 'quickSlotRemove'; slot: number };
export type AimFlyTargetVerbRequest = {
    verb: 'aimFlyTarget';
    targetVirtualId: number;
    positionX: number;
    positionY: number;
};
export type AddFlyTargetVerbRequest = {
    verb: 'addFlyTarget';
    targetVirtualId: number;
    positionX: number;
    positionY: number;
};
export type ShootVerbRequest = { verb: 'shoot'; type: number };
export type BuyShopItemVerbRequest = { verb: 'buyShopItem'; pos: number };
export type SellShopItemVerbRequest = { verb: 'sellShopItem'; pos: number };
export type SellShopItemsVerbRequest = { verb: 'sellShopItems'; pos: number; count: number };
export type CloseShopVerbRequest = { verb: 'closeShop' };

export type VerbRequest =
    | MoveVerbRequest
    | TargetVerbRequest
    | AttackVerbRequest
    | UseSkillVerbRequest
    | UseItemVerbRequest
    | MoveItemVerbRequest
    | DropItemVerbRequest
    | PickUpVerbRequest
    | ClickVerbRequest
    | AnswerQuestVerbRequest
    | PressQuestButtonVerbRequest
    | QuickSlotAddVerbRequest
    | QuickSlotSwapVerbRequest
    | QuickSlotRemoveVerbRequest
    | AimFlyTargetVerbRequest
    | AddFlyTargetVerbRequest
    | ShootVerbRequest
    | BuyShopItemVerbRequest
    | SellShopItemVerbRequest
    | SellShopItemsVerbRequest
    | CloseShopVerbRequest;

export type RequestServerStatusResponse = { success: boolean; channels: ChannelStatus[] };

export type HealthResponse = {
    ok: true;
    name: typeof SERVICE_NAME;
    version: string;
    server: { engine: string; node: string; uptimeSeconds: number };
    defaults: { auth: BridgeEndpoint; game: BridgeEndpoint };
};

/** Uniform error body every non-2xx API response carries. */
export type ApiErrorBody = { error: { code: string; message: string } };

/** Reference implementation of the numeric connection states the protocol uses. */
export const CONNECTION_STATE_NAMES: Record<number, string> = {
    0: 'closed',
    1: 'handshake',
    2: 'login',
    3: 'select',
    4: 'loading',
    5: 'game',
    6: 'dead',
    10: 'auth',
};
