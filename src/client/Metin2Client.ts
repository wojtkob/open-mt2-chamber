import { ConnectionStateEnum } from '@/core/enum/ConnectionStateEnum';
import AuthClient, { LoginResult } from '@/client/auth/AuthClient';
import GameClient, { GameAuthentication, SelectedCharacter, EnteredGame } from '@/client/game/GameClient';
import GameState, { ChatEntry, EntityState, ShopState } from '@/client/state/GameState';
import TypedEventEmitter from '@/client/util/TypedEventEmitter';
import ClientPacketWriter, {
    AttackPayload,
    CharacterMovePayload,
    CreateCharacterPayload,
    DeleteCharacterPayload,
    FlyTargetingPayload,
    ItemDropPayload,
    ItemMovePayload,
    MyShopItemEntry,
    SkillUsePayload,
} from '@/client/protocol/ClientPacketWriter';
import { ChannelStatus, ServerPacket, ServerStatusServerPacket } from '@/client/protocol/ServerPackets';
import { QuickSlotTypeEnum } from '@/core/enum/QuickSlotTypeEnum';

export type Metin2ClientEvents = {
    authState: (state: ConnectionStateEnum) => void;
    gameState: (state: ConnectionStateEnum) => void;
    packet: (source: 'auth' | 'game', packet: ServerPacket) => void;
    error: (source: 'auth' | 'game', error: Error) => void;
    close: (source: 'auth' | 'game', info: { hadError: boolean }) => void;
    chat: (entry: ChatEntry) => void;
    entityAdded: (entity: EntityState) => void;
    entityUpdated: (entity: EntityState) => void;
    entityRemoved: (vid: number) => void;
    shopChanged: (shop: ShopState | null) => void;
};

/**
 * High-level Metin2 client facade.
 *
 * It owns the auth connection, the game connection and the world-state model,
 * and exposes the whole flow as a few async calls:
 *
 * ```ts
 * const client = new Metin2Client();
 * const account = await client.login({ username: 'admin', password: 'admin' });
 * await client.selectCharacter(account.characters[0].slot);
 * await client.enterGame();
 * client.chat('hello world');
 * ```
 *
 * Every server packet the game connection receives is also fed to
 * {@link state} (a {@link GameState}), and the underlying connections' events
 * are forwarded on this class with a `auth`/`game` source tag.
 */
export default class Metin2Client extends TypedEventEmitter<Metin2ClientEvents> {
    readonly auth: AuthClient;
    readonly game: GameClient;
    readonly state: GameState;

    constructor() {
        super();
        this.auth = new AuthClient();
        this.game = new GameClient();
        this.state = new GameState();

        this.auth.on('state', (state) => this.emit('authState', state));
        this.auth.on('packet', (packet) => this.emit('packet', 'auth', packet));
        this.auth.on('error', (error) => this.emit('error', 'auth', error));
        this.auth.on('close', (info) => this.emit('close', 'auth', info));

        this.game.on('state', (state) => this.emit('gameState', state));
        this.game.on('packet', (packet) => {
            this.state.consume(packet);
            this.emit('packet', 'game', packet);
        });
        this.game.on('error', (error) => this.emit('error', 'game', error));
        this.game.on('close', (info) => this.emit('close', 'game', info));

        this.state.on('chat', (entry) => this.emit('chat', entry));
        this.state.on('entityAdded', (entity) => this.emit('entityAdded', entity));
        this.state.on('entityUpdated', (entity) => this.emit('entityUpdated', entity));
        this.state.on('entityRemoved', (vid) => this.emit('entityRemoved', vid));
        this.state.on('shopChanged', (shop) => this.emit('shopChanged', shop));
    }

    // --- the login/select/enter flow -----------------------------------------

    /**
     * Authenticate against the auth server, redeem the key on the game server,
     * then close the (no longer needed) auth connection. Resolves with the
     * account data once the game connection reaches the character select state.
     */
    async login(options: LoginOptions): Promise<GameAuthentication> {
        const { key } = await this.authenticateAuth(options);
        try {
            return await this.authenticateGame({ ...options, key });
        } finally {
            await this.auth.close();
        }
    }

    /** Only contact the auth server: handshake + credential exchange. */
    async authenticateAuth(options: LoginOptions): Promise<LoginResult> {
        const authHost = options.authHost ?? options.host ?? '127.0.0.1';
        const authPort = options.authPort ?? options.port ?? DEFAULT_AUTH_PORT;
        const timeoutMs = options.timeoutMs;
        if (this.auth.isConnected) {
            await this.auth.close();
        }
        await this.auth.connect(authHost, authPort, timeoutMs);
        return this.auth.login(options.username, options.password, timeoutMs);
    }

    /** Only contact the game server: token redeemed with an existing auth key. */
    authenticateGame(options: LoginOptions & { key: number; xteaKeys?: number[] }): Promise<GameAuthentication> {
        return this.game.authenticate({
            host: options.gameHost ?? options.host ?? '127.0.0.1',
            port: options.gamePort ?? options.port ?? DEFAULT_GAME_PORT,
            username: options.username,
            key: options.key,
            xteaKeys: options.xteaKeys,
            timeoutMs: options.timeoutMs,
        });
    }

    /** Select a character slot and wait for its full data set. */
    async selectCharacter(slot: number, timeoutMs = 10_000): Promise<SelectedCharacter> {
        const selected = await this.game.selectCharacter(slot, timeoutMs);
        this.state.setSelectedSlot(slot);
        return selected;
    }

    /** Enter the world with the selected character. */
    enterGame(timeoutMs = 10_000): Promise<EnteredGame> {
        return this.game.enterGame(timeoutMs);
    }

    /** Ask the currently connected server for its channel status. */
    requestServerStatus(timeoutMs = 10_000): Promise<ServerStatusServerPacket> {
        const source = this.game.isConnected ? this.game : this.auth;
        return source.requestServerStatus(timeoutMs);
    }

    // --- gameplay verbs (delegated to the game connection) -------------------

    move(payload: CharacterMovePayload): void {
        this.game.move(payload);
    }

    chat(message: string, messageType = 0): void {
        this.game.chat(message, messageType);
    }

    attack(payload: AttackPayload): void {
        this.game.attack(payload);
    }

    target(targetVirtualId: number): void {
        this.game.target(targetVirtualId);
    }

    useSkill(payload: SkillUsePayload): void {
        this.game.useSkill(payload);
    }

    useItem(window: number, position: number): void {
        this.game.useItem(window, position);
    }

    moveItem(payload: ItemMovePayload): void {
        this.game.moveItem(payload);
    }

    dropItem(payload: ItemDropPayload): void {
        this.game.dropItem(payload);
    }

    pickUpItem(virtualId: number): void {
        this.game.pickUpItem(virtualId);
    }

    click(targetVirtualId: number): void {
        this.game.click(targetVirtualId);
    }

    answerQuest(answer: number): void {
        this.game.answerQuest(answer);
    }

    pressQuestButton(questId: number): void {
        this.game.pressQuestButton(questId);
    }

    quickSlotAdd(slot: number, type: QuickSlotTypeEnum, position: number): void {
        this.game.quickSlotAdd(slot, type, position);
    }

    quickSlotSwap(slotA: number, slotB: number): void {
        this.game.quickSlotSwap(slotA, slotB);
    }

    quickSlotRemove(slot: number): void {
        this.game.quickSlotRemove(slot);
    }

    aimFlyTarget(payload: FlyTargetingPayload): void {
        this.game.aimFlyTarget(payload);
    }

    addFlyTarget(payload: FlyTargetingPayload): void {
        this.game.addFlyTarget(payload);
    }

    shoot(type: number): void {
        this.game.shoot(type);
    }

    buyShopItem(pos: number): void {
        this.game.buyShopItem(pos);
    }

    sellShopItem(pos: number): void {
        this.game.sellShopItem(pos);
    }

    sellShopItems(pos: number, count: number): void {
        this.game.sellShopItems(pos, count);
    }

    closeShop(): void {
        this.game.closeShop();
    }

    openPrivateShop(sign: string, items: MyShopItemEntry[]): void {
        this.game.openPrivateShop(sign, items);
    }

    createCharacter(payload: CreateCharacterPayload): void {
        this.game.createCharacter(payload);
    }

    deleteCharacter(payload: DeleteCharacterPayload): void {
        this.game.deleteCharacter(payload);
    }

    reportClientVersion(clientName: string, timeStamp: string): void {
        this.game.reportClientVersion(clientName, timeStamp);
    }

    markLogin(): void {
        this.game.markLogin();
    }

    /** Destroy both underlying sockets immediately and drop all buffered state. */
    destroy(): void {
        this.auth.destroy();
        this.game.destroy();
        this.state.reset();
    }
}

export type LoginOptions = {
    username: string;
    password: string;
    /** Auth server host. Falls back to `host`. */
    authHost?: string;
    /** Auth server port (default 11002). Falls back to `port`. */
    authPort?: number;
    /** Game server host. Falls back to `host`. */
    gameHost?: string;
    /** Game server port (default 13001). Falls back to `port`. */
    gamePort?: number;
    /** Host used when neither `authHost` nor `gameHost` is given. */
    host?: string;
    /** Port used when neither `authPort` nor `gamePort` is given. */
    port?: number;
    timeoutMs?: number;
};

export const DEFAULT_AUTH_PORT = 11002;
export const DEFAULT_GAME_PORT = 13001;

export { ClientPacketWriter };
export type { ChannelStatus }; // re-exported for convenience
