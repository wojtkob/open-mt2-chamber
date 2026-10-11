import { ConnectionStateEnum } from '@/core/enum/ConnectionStateEnum';
import { QuickSlotTypeEnum } from '@/core/enum/QuickSlotTypeEnum';
import ClientConnection from '@/client/ClientConnection';
import ClientPacketWriter from '@/client/protocol/ClientPacketWriter';
import {
    CharacterDetailsServerPacket,
    CharacterPointsServerPacket,
    ChannelServerPacket,
    CharacterSummary,
    GameTimeServerPacket,
    ServerPacket,
    SkillInfo,
    SkillLevelServerPacket,
} from '@/client/protocol/ServerPackets';
import { AuthError, InvalidStateError } from '@/client/errors';
import {
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

/** Outcome of redeeming an auth key on the game server. */
export type GameAuthentication = {
    empireId: number | null;
    characters: CharacterSummary[];
};

/** Full data the game server sends once a character slot is selected. */
export type SelectedCharacter = {
    details: CharacterDetailsServerPacket;
    points: number[];
    skills: SkillInfo[];
};

/** Data sent when the character actually enters the world. */
export type EnteredGame = {
    time: number;
    channel: number;
};

export type GameEndpoint = { host: string; port: number; timeoutMs?: number };

/**
 * Client for the *game* server (port `GAME_SERVER_PORT`, default 13001).
 *
 * The full login flow is {@link authenticate} -> {@link selectCharacter} ->
 * {@link enterGame}; after that the gameplay verbs can be used. The class is
 * deliberately thin: it validates the connection state, encodes the packet and
 * writes it. World modelling lives in `state/GameState`.
 */
export default class GameClient extends ClientConnection {
    private empireId: number | null = null;
    private characters: CharacterSummary[] = [];
    private details: CharacterDetailsServerPacket | null = null;
    private points: CharacterPointsServerPacket | null = null;
    private skills: SkillLevelServerPacket | null = null;
    private gameTime: GameTimeServerPacket | null = null;
    private channel: ChannelServerPacket | null = null;

    protected onServerPacket(packet: ServerPacket): void {
        switch (packet.type) {
            case 'empire':
                this.empireId = packet.empireId;
                break;
            case 'charactersList':
                this.characters = packet.characters.filter((character) => character.id !== 0);
                break;
            case 'characterDetails':
                this.details = packet;
                break;
            case 'characterPoints':
                this.points = packet;
                break;
            case 'skillLevel':
                this.skills = packet;
                break;
            case 'gameTime':
                this.gameTime = packet;
                break;
            case 'channel':
                this.channel = packet;
                break;
            default:
                break;
        }
    }

    getEmpireId(): number | null {
        return this.empireId;
    }

    /** Occupied character slots on the logged-in account, as last sent by the server. */
    getCharacters(): CharacterSummary[] {
        return this.characters;
    }

    /**
     * Open the game socket, complete the handshake and redeem the auth key with
     * `CG_TOKEN` (this is the game server's equivalent of a login).
     *
     * @throws AuthError when the server rejects the token (a `LOGIN_FAILED` or a
     *   silent close, which is what an invalid/expired key produces).
     */
    async authenticate({
        host,
        port,
        username,
        key,
        xteaKeys = [0, 0, 0, 0],
        timeoutMs = 10_000,
    }: GameEndpoint & { username: string; key: number; xteaKeys?: number[] }): Promise<GameAuthentication> {
        this.clearLoginFailure();
        this.empireId = null;
        this.characters = [];

        await super.connect(host, port, timeoutMs);
        await this.waitForState(ConnectionStateEnum.LOGIN, timeoutMs);

        const outcome = this.waitUntil(
            () => {
                if (this.loginFailure) return { kind: 'failed' as const, status: this.loginFailure.status };
                if (this.isClosed) return { kind: 'failed' as const, status: 'CLOSED' };
                if (this.getState() === ConnectionStateEnum.SELECT) return { kind: 'ok' as const };
                return undefined;
            },
            { timeoutMs, timeoutMessage: 'Timed out waiting for the game server to accept the token' },
        );

        this.send(ClientPacketWriter.token({ username, key, xteaKeys }));

        const answer = await outcome;
        if (answer.kind === 'failed') {
            throw new AuthError(`The game server rejected the token (${answer.status})`, answer.status);
        }

        return { empireId: this.empireId, characters: this.characters };
    }

    /**
     * Select a character slot and collect everything the server sends while it
     * loads (details, points, skill levels).
     */
    async selectCharacter(slot: number, timeoutMs = 10_000): Promise<SelectedCharacter> {
        this.requireState(ConnectionStateEnum.SELECT, 'select a character');
        this.details = null;
        this.points = null;
        this.skills = null;

        const outcome = this.waitUntil(
            () => {
                if (this.details && this.points && this.skills) {
                    return {
                        kind: 'ok' as const,
                        value: { details: this.details, points: this.points.points, skills: this.skills.skills },
                    };
                }
                if (this.isClosed) return { kind: 'failed' as const };
                return undefined;
            },
            { timeoutMs, timeoutMessage: 'Timed out waiting for the character data' },
        );

        this.send(ClientPacketWriter.selectCharacter(slot));

        const answer = await outcome;
        if (answer.kind === 'failed') {
            throw new AuthError('The game server closed the connection while selecting the character');
        }
        await this.waitForState(ConnectionStateEnum.LOADING, timeoutMs);
        return answer.value;
    }

    /** Confirm the selected character and enter the world. */
    async enterGame(timeoutMs = 10_000): Promise<EnteredGame> {
        this.requireState(ConnectionStateEnum.LOADING, 'enter the game');
        this.gameTime = null;
        this.channel = null;

        const outcome = this.waitUntil(
            () => {
                if (this.gameTime && this.channel) {
                    return { kind: 'ok' as const, value: { time: this.gameTime.time, channel: this.channel.channel } };
                }
                if (this.isClosed) return { kind: 'failed' as const };
                return undefined;
            },
            { timeoutMs, timeoutMessage: 'Timed out waiting for the game time and channel' },
        );

        this.send(ClientPacketWriter.enterGame());

        const answer = await outcome;
        if (answer.kind === 'failed') {
            throw new AuthError('The game server closed the connection while entering the game');
        }
        await this.waitForState(ConnectionStateEnum.GAME, timeoutMs);
        return answer.value;
    }

    // --- character selection -------------------------------------------------

    /** Create a new character on `slot`. */
    createCharacter(payload: CreateCharacterPayload): void {
        this.requireState(ConnectionStateEnum.SELECT, 'create a character');
        this.send(ClientPacketWriter.createCharacter(payload));
    }

    /** Delete the character on `slot` using its private delete code. */
    deleteCharacter(payload: DeleteCharacterPayload): void {
        this.requireState(ConnectionStateEnum.SELECT, 'delete a character');
        this.send(ClientPacketWriter.deleteCharacter(payload));
    }

    // --- connection-level actions -------------------------------------------

    /** Report the local client version to the server. */
    reportClientVersion(clientName: string, timeStamp: string): void {
        this.send(ClientPacketWriter.clientVersion(clientName, timeStamp));
    }

    /** Tell the server the client finished loading the login/character screen. */
    markLogin(): void {
        this.send(ClientPacketWriter.markLogin());
    }

    /** Send a `CG_INTERNAL_PING` with the given timestamp (not sequenced). */
    internalPing(time: number): void {
        this.send(ClientPacketWriter.internalPing(time));
    }

    // --- gameplay ------------------------------------------------------------

    /** Report a position/heading update while moving. */
    move(payload: CharacterMovePayload): void {
        this.requireGameplay('move');
        this.send(ClientPacketWriter.characterMove(payload));
    }

    /** Attack `victimVirtualId`; `skillVnum` is 0 for a basic hit. */
    attack(payload: AttackPayload): void {
        this.requireGameplay('attack');
        this.send(ClientPacketWriter.attack(payload));
    }

    /** Set the currently targeted entity. */
    target(targetVirtualId: number): void {
        this.requireGameplay('target');
        this.send(ClientPacketWriter.target(targetVirtualId));
    }

    /** Cast a skill on a target. */
    useSkill(payload: SkillUsePayload): void {
        this.requireGameplay('use a skill');
        this.send(ClientPacketWriter.skillUse(payload));
    }

    /** Send a chat line. `messageType` defaults to `ChatMessageTypeEnum.NORMAL` (0). */
    chat(message: string, messageType = 0): void {
        this.requireGameplay('chat');
        this.send(ClientPacketWriter.chat(message, messageType));
    }

    /** Use the item in `window`/`position` (double click / right click). */
    useItem(window: number, position: number): void {
        this.requireGameplay('use an item');
        this.send(ClientPacketWriter.itemUse(window, position));
    }

    /** Move a stack between inventory cells, the equipment window or the ground. */
    moveItem(payload: ItemMovePayload): void {
        this.requireGameplay('move an item');
        this.send(ClientPacketWriter.itemMove(payload));
    }

    /** Drop gold or an item stack on the ground. */
    dropItem(payload: ItemDropPayload): void {
        this.requireGameplay('drop an item');
        this.send(ClientPacketWriter.itemDrop(payload));
    }

    /** Pick up the ground item with the given virtual id. */
    pickUpItem(virtualId: number): void {
        this.requireGameplay('pick up an item');
        this.send(ClientPacketWriter.itemPickup(virtualId));
    }

    /** Click an entity (npc, metin, ground item) — the server decides the action. */
    click(targetVirtualId: number): void {
        this.requireGameplay('click an entity');
        this.send(ClientPacketWriter.onClick(targetVirtualId));
    }

    /** Answer the currently open quest dialog. */
    answerQuest(answer: number): void {
        this.requireGameplay('answer a quest');
        this.send(ClientPacketWriter.questAnswer(answer));
    }

    /** Press a button of the currently open quest window. */
    pressQuestButton(questId: number): void {
        this.requireGameplay('press a quest button');
        this.send(ClientPacketWriter.questButton(questId));
    }

    /** Register a quick-slot entry. */
    quickSlotAdd(slot: number, type: QuickSlotTypeEnum, position: number): void {
        this.requireGameplay('edit the quick slots');
        this.send(ClientPacketWriter.quickSlotAdd({ slot, type, position }));
    }

    /** Swap two quick-slot entries. */
    quickSlotSwap(slotA: number, slotB: number): void {
        this.requireGameplay('edit the quick slots');
        this.send(ClientPacketWriter.quickSlotSwap({ slotA, slotB }));
    }

    /** Clear a quick-slot entry. */
    quickSlotRemove(slot: number): void {
        this.requireGameplay('edit the quick slots');
        this.send(ClientPacketWriter.quickSlotRemove(slot));
    }

    /** Stage (or replace) the target of an aimed ranged attack. */
    aimFlyTarget(payload: FlyTargetingPayload): void {
        this.requireGameplay('aim a ranged attack');
        this.send(ClientPacketWriter.flyTargeting(payload));
    }

    /** Append a target to the pending ranged shot queue. */
    addFlyTarget(payload: FlyTargetingPayload): void {
        this.requireGameplay('aim a ranged attack');
        this.send(ClientPacketWriter.addFlyTargeting(payload));
    }

    /** Release a ranged shot; `type` is 0 for a plain bow shot. */
    shoot(type: number): void {
        this.requireGameplay('shoot');
        this.send(ClientPacketWriter.shoot(type));
    }

    // --- shops ---------------------------------------------------------------

    /** Buy the item at `pos` from the open shop. */
    buyShopItem(pos: number): void {
        this.requireGameplay('buy from a shop');
        this.send(ClientPacketWriter.shop({ subHeader: 1, pos }));
    }

    /** Sell one unit of the item at `pos`. */
    sellShopItem(pos: number): void {
        this.requireGameplay('sell to a shop');
        this.send(ClientPacketWriter.shop({ subHeader: 2, pos }));
    }

    /** Sell `count` units of the item at `pos`. */
    sellShopItems(pos: number, count: number): void {
        this.requireGameplay('sell to a shop');
        this.send(ClientPacketWriter.shop({ subHeader: 3, pos, count }));
    }

    /** Close the currently open shop. */
    closeShop(): void {
        this.requireGameplay('close a shop');
        this.send(ClientPacketWriter.shop({ subHeader: 0 }));
    }

    /** Open a private player shop with the given sign and stock. */
    openPrivateShop(sign: string, items: MyShopItemEntry[]): void {
        this.requireGameplay('open a private shop');
        this.send(ClientPacketWriter.myShop(sign, items));
    }

    private requireState(state: ConnectionStateEnum, action: string): void {
        if (this.getState() !== state) {
            throw new InvalidStateError(
                `Cannot ${action} while the connection is in state ${this.getState()} (expected ${state})`,
            );
        }
    }

    private requireGameplay(action: string): void {
        const state = this.getState();
        if (state !== ConnectionStateEnum.GAME && state !== ConnectionStateEnum.DEAD) {
            throw new InvalidStateError(`Cannot ${action} before entering the game (state ${state})`);
        }
    }
}
