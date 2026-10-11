import PacketHeaderEnum from '@/core/enum/PacketHeaderEnum';
import { QuestFlagEnum } from '@/core/enum/QuestSendFlagEnum';
import { ShopSubHeaderGC } from '@/core/enum/ShopSubHeaderEnum';
import { ProtocolError } from '@/client/errors';

/**
 * Decoders for every packet the *server* sends to the client.
 *
 * The core `out/*` classes only implement `pack()`, so the client needs its own
 * readers. Each branch here mirrors the matching `out/*` class field for field;
 * `ServerPackets.test.ts` proves that by packing a core out-packet and parsing
 * it back. Anything the client doesn't model yet still comes through as a
 * `raw` packet carrying the exact payload, so no server frame is ever dropped.
 */

export type ChannelStatus = { port: number; status: number };

export type CharacterSummary = {
    /** Account slot (0..3) this character occupies. */
    slot: number;
    id: number;
    name: string;
    playerClass: number;
    level: number;
    playTime: number;
    st: number;
    ht: number;
    dx: number;
    iq: number;
    bodyPart: number;
    nameChange: number;
    hairPart: number;
    positionX: number;
    positionY: number;
    ip: number;
    port: number;
    skillGroup: number;
    guildId: number;
    guildName: string;
};

export type SkillInfo = { rank: number; level: number; timeToNextRead: number };

export type ItemBonus = { id: number; value: number };

export type ItemSnapshot = {
    window: number;
    position: number;
    id: number;
    count: number;
    sockets: number[];
    bonuses: ItemBonus[];
};

export type ShopEntry = {
    /** Grid slot this entry belongs to. */
    pos: number;
    vnum: number;
    price: number;
    count: number;
    displayPos: number;
    sockets: number[];
    bonuses: ItemBonus[];
};

type WithHeader = { header: number };

export type RawServerPacket = WithHeader & { type: 'raw'; payload: Buffer };

export type ConnectionStateServerPacket = WithHeader & { type: 'connectionState'; state: number };
export type HandshakeServerPacket = WithHeader & { type: 'handshake'; id: number; time: number; delta: number };
export type PingServerPacket = WithHeader & { type: 'ping' };
export type InternalPongServerPacket = WithHeader & { type: 'internalPong'; time: number };
export type LoginSuccessServerPacket = WithHeader & { type: 'loginSuccess'; key: number; result: number };
export type LoginFailedServerPacket = WithHeader & { type: 'loginFailed'; status: string };
export type ServerStatusServerPacket = WithHeader & {
    type: 'serverStatus';
    success: boolean;
    channels: ChannelStatus[];
};
export type EmpireServerPacket = WithHeader & { type: 'empire'; empireId: number };
export type CharactersListServerPacket = WithHeader & { type: 'charactersList'; characters: CharacterSummary[] };
export type CharacterDetailsServerPacket = WithHeader & {
    type: 'characterDetails';
    vid: number;
    playerClass: number;
    playerName: string;
    positionX: number;
    positionY: number;
    positionZ: number;
    empireId: number;
    skillGroup: number;
};
export type CharacterPointsServerPacket = WithHeader & { type: 'characterPoints'; points: number[] };
export type CharacterPointChangeServerPacket = WithHeader & {
    type: 'characterPointChange';
    vid: number;
    pointType: number;
    amount: number;
    value: number;
};
export type SkillLevelServerPacket = WithHeader & { type: 'skillLevel'; skills: SkillInfo[] };
export type GameTimeServerPacket = WithHeader & { type: 'gameTime'; time: number };
export type ChannelServerPacket = WithHeader & { type: 'channel'; channel: number };
export type SetSkillGroupServerPacket = WithHeader & { type: 'setSkillGroup'; skillGroup: number };
export type CreateCharacterSuccessServerPacket = WithHeader & {
    type: 'createCharacterSuccess';
    slot: number;
    character: CharacterSummary;
};
export type CreateCharacterFailureServerPacket = WithHeader & { type: 'createCharacterFailure'; reason: number };
export type DeleteCharacterSuccessServerPacket = WithHeader & { type: 'deleteCharacterSuccess'; slot: number };
export type DeleteCharacterFailureServerPacket = WithHeader & { type: 'deleteCharacterFailure' };
export type CharacterSpawnServerPacket = WithHeader & {
    type: 'characterSpawn';
    vid: number;
    rotation: number;
    positionX: number;
    positionY: number;
    positionZ: number;
    entityType: number;
    playerClass: number;
    movementSpeed: number;
    attackSpeed: number;
    state: number;
    affects: number[];
};
export type CharacterInfoServerPacket = WithHeader & {
    type: 'characterInfo';
    vid: number;
    playerName: string;
    parts: number[];
    empireId: number;
    guildId: number;
    level: number;
    rankPoints: number;
    pkMode: number;
    mountId: number;
};
export type CharacterUpdateServerPacket = WithHeader & {
    type: 'characterUpdate';
    vid: number;
    parts: number[];
    moveSpeed: number;
    attackSpeed: number;
    state: number;
    affects: number[];
    guildId: number;
    rankPoints: number;
    pkMode: number;
    mountVnum: number;
};
export type CharacterMoveServerPacket = WithHeader & {
    type: 'characterMove';
    movementType: number;
    arg: number;
    rotation: number;
    vid: number;
    positionX: number;
    positionY: number;
    time: number;
    duration: number;
};
export type SyncPositionServerPacket = WithHeader & {
    type: 'syncPosition';
    positions: Array<{ vid: number; positionX: number; positionY: number }>;
};
export type RemoveCharacterServerPacket = WithHeader & { type: 'removeCharacter'; vid: number };
export type ChatServerPacket = WithHeader & {
    type: 'chat';
    messageType: number;
    vid: number;
    empireId: number;
    message: string;
};
export type CharacterDiedServerPacket = WithHeader & { type: 'characterDied'; vid: number };
export type TargetUpdatedServerPacket = WithHeader & { type: 'targetUpdated'; vid: number; healthPercentage: number };
export type DamageServerPacket = WithHeader & { type: 'damage'; vid: number; damageFlags: number; damage: number };
export type TeleportServerPacket = WithHeader & {
    type: 'teleport';
    positionX: number;
    positionY: number;
    address: number;
    port: number;
};
export type ItemServerPacket = WithHeader & { type: 'item'; item: ItemSnapshot };
export type ItemUpdateServerPacket = WithHeader & {
    type: 'itemUpdate';
    window: number;
    position: number;
    count: number;
    sockets: number[];
    bonuses: ItemBonus[];
};
export type ItemDroppedServerPacket = WithHeader & {
    type: 'itemDropped';
    positionX: number;
    positionY: number;
    positionZ: number;
    vid: number;
    id: number;
};
export type ItemDroppedHideServerPacket = WithHeader & { type: 'itemDroppedHide'; vid: number };
export type SetItemOwnershipServerPacket = WithHeader & { type: 'setItemOwnership'; vid: number; ownerName: string };
export type AffectAddServerPacket = WithHeader & {
    type: 'affectAdd';
    affectType: number;
    apply: number;
    value: number;
    flag: number;
    duration: number;
    manaCost: number;
};
export type AffectRemoveServerPacket = WithHeader & { type: 'affectRemove'; affectType: number; apply: number };
export type SpecialEffectServerPacket = WithHeader & { type: 'specialEffect'; effectType: number; vid: number };
export type FlyServerPacket = WithHeader & { type: 'fly'; flyType: number; fromVid: number; toVid: number };
export type FlyTargetingServerPacket = WithHeader & {
    type: 'flyTargeting';
    isAdd: boolean;
    shooterVid: number;
    targetVid: number;
    positionX: number;
    positionY: number;
};
export type QuickSlotAddResponseServerPacket = WithHeader & {
    type: 'quickSlotAddResponse';
    slot: number;
    slotType: number;
    position: number;
};
export type QuickSlotRemoveResponseServerPacket = WithHeader & { type: 'quickSlotRemoveResponse'; slot: number };
export type QuickSlotSwapResponseServerPacket = WithHeader & {
    type: 'quickSlotSwapResponse';
    slotA: number;
    slotB: number;
};
export type ShopServerPacket = WithHeader & {
    type: 'shop';
    subHeader: number;
    ownerVid: number;
    entries: ShopEntry[];
    pos: number;
};
export type ShopSignServerPacket = WithHeader & { type: 'shopSign'; ownerVid: number; sign: string };
export type QuestScriptServerPacket = WithHeader & { type: 'questScript'; skin: number; src: string };
export type QuestInfoServerPacket = WithHeader & {
    type: 'questInfo';
    id: number;
    flags: number;
    wasStarted: number | null;
    title: string | null;
    clockName: string | null;
    clockValue: number | null;
    counterName: string | null;
    counterValue: number | null;
    iconFile: string | null;
};
export type QuestTargetCreateServerPacket = WithHeader & {
    type: 'questTargetCreate';
    id: number;
    targetName: string;
    targetVid: number;
    targetType: number;
};
export type QuestTargetRemoveServerPacket = WithHeader & { type: 'questTargetRemove'; id: number };

export type ServerPacket =
    | RawServerPacket
    | ConnectionStateServerPacket
    | HandshakeServerPacket
    | PingServerPacket
    | InternalPongServerPacket
    | LoginSuccessServerPacket
    | LoginFailedServerPacket
    | ServerStatusServerPacket
    | EmpireServerPacket
    | CharactersListServerPacket
    | CharacterDetailsServerPacket
    | CharacterPointsServerPacket
    | CharacterPointChangeServerPacket
    | SkillLevelServerPacket
    | GameTimeServerPacket
    | ChannelServerPacket
    | SetSkillGroupServerPacket
    | CreateCharacterSuccessServerPacket
    | CreateCharacterFailureServerPacket
    | DeleteCharacterSuccessServerPacket
    | DeleteCharacterFailureServerPacket
    | CharacterSpawnServerPacket
    | CharacterInfoServerPacket
    | CharacterUpdateServerPacket
    | CharacterMoveServerPacket
    | SyncPositionServerPacket
    | RemoveCharacterServerPacket
    | ChatServerPacket
    | CharacterDiedServerPacket
    | TargetUpdatedServerPacket
    | DamageServerPacket
    | TeleportServerPacket
    | ItemServerPacket
    | ItemUpdateServerPacket
    | ItemDroppedServerPacket
    | ItemDroppedHideServerPacket
    | SetItemOwnershipServerPacket
    | AffectAddServerPacket
    | AffectRemoveServerPacket
    | SpecialEffectServerPacket
    | FlyServerPacket
    | FlyTargetingServerPacket
    | QuickSlotAddResponseServerPacket
    | QuickSlotRemoveResponseServerPacket
    | QuickSlotSwapResponseServerPacket
    | ShopServerPacket
    | ShopSignServerPacket
    | QuestScriptServerPacket
    | QuestInfoServerPacket
    | QuestTargetCreateServerPacket
    | QuestTargetRemoveServerPacket;

const GUILD_NAME_SIZE = 13;
/** Number of item rows in a shop grid (see ShopStartPacket). */
const SHOP_GRID_SIZE = 40;
/** Bytes of one shop grid row: vnum(4) + price(4) + count(1) + pos(1) + 3 sockets(12) + 7 bonuses(21). */
const SHOP_ENTRY_SIZE = 43;

/** Bounds-checked little-endian cursor that starts just after the header byte. */
class Cursor {
    private offset: number;

    constructor(
        private readonly buffer: Buffer,
        start = 1,
    ) {
        this.offset = start;
    }

    get position(): number {
        return this.offset;
    }

    get remaining(): number {
        return this.buffer.byteLength - this.offset;
    }

    u8(): number {
        this.ensure(1);
        return this.buffer.readUInt8(this.offset++);
    }

    u16(): number {
        this.ensure(2);
        const value = this.buffer.readUInt16LE(this.offset);
        this.offset += 2;
        return value;
    }

    u32(): number {
        this.ensure(4);
        const value = this.buffer.readUInt32LE(this.offset);
        this.offset += 4;
        return value;
    }

    i32(): number {
        this.ensure(4);
        const value = this.buffer.readInt32LE(this.offset);
        this.offset += 4;
        return value;
    }

    f32(): number {
        this.ensure(4);
        const value = this.buffer.readFloatLE(this.offset);
        this.offset += 4;
        return value;
    }

    ascii(size: number): string {
        this.ensure(size);
        const slice = this.buffer.subarray(this.offset, this.offset + size);
        this.offset += size;
        const nullIndex = slice.indexOf(0);
        return (nullIndex === -1 ? slice : slice.subarray(0, nullIndex)).toString('ascii');
    }

    skip(size: number): void {
        this.ensure(size);
        this.offset += size;
    }

    private ensure(size: number): void {
        if (this.offset + size > this.buffer.byteLength) {
            throw new ProtocolError(
                `Server packet truncated: need ${size} byte(s) at offset ${this.offset}, have ${this.buffer.byteLength}`,
            );
        }
    }
}

const readBonuses = (cursor: Cursor, count = 7): ItemBonus[] => {
    const bonuses: ItemBonus[] = [];
    for (let i = 0; i < count; i++) {
        bonuses.push({ id: cursor.u8(), value: cursor.u16() });
    }
    return bonuses;
};

const readSockets = (cursor: Cursor, count = 3): number[] => {
    const sockets: number[] = [];
    for (let i = 0; i < count; i++) {
        sockets.push(cursor.u32());
    }
    return sockets;
};

const readU16List = (cursor: Cursor, count: number): number[] => {
    const values: number[] = [];
    for (let i = 0; i < count; i++) {
        values.push(cursor.u16());
    }
    return values;
};

const readShopEntry = (cursor: Cursor, pos: number): ShopEntry => ({
    pos,
    vnum: cursor.u32(),
    price: cursor.u32(),
    count: cursor.u8(),
    displayPos: cursor.u8(),
    sockets: readSockets(cursor),
    bonuses: readBonuses(cursor),
});

const readCharacterBlock = (cursor: Cursor, slot: number, guildId: number, guildName: string): CharacterSummary => {
    const id = cursor.u32();
    const name = cursor.ascii(25);
    const playerClass = cursor.u8();
    const level = cursor.u8();
    const playTime = cursor.u32();
    const st = cursor.u8();
    const ht = cursor.u8();
    const dx = cursor.u8();
    const iq = cursor.u8();
    const bodyPart = cursor.u16();
    const nameChange = cursor.u8();
    const hairPart = cursor.u16();
    cursor.skip(4); // reserved
    const positionX = cursor.u32();
    const positionY = cursor.u32();
    const ip = cursor.u32();
    const port = cursor.u16();
    const skillGroup = cursor.u8();

    return {
        slot,
        id,
        name,
        playerClass,
        level,
        playTime,
        st,
        ht,
        dx,
        iq,
        bodyPart,
        nameChange,
        hairPart,
        positionX,
        positionY,
        ip,
        port,
        skillGroup,
        guildId,
        guildName,
    };
};

const raw = (frame: Buffer): RawServerPacket => ({
    type: 'raw',
    header: frame[0],
    payload: frame.subarray(1),
});

/**
 * Decode one complete server frame. The frame must already be delimited (see
 * {@link FrameDecoder}); its header byte is the first byte.
 *
 * Unknown headers are returned verbatim as `raw` so the caller can still log or
 * forward them, and no decoded field is ever invented.
 */
export function parseServerPacket(frame: Buffer): ServerPacket {
    if (frame.byteLength < 1) {
        throw new ProtocolError('Cannot parse an empty server frame');
    }

    const header = frame[0];
    const cursor = new Cursor(frame);

    switch (header) {
        case PacketHeaderEnum.CONNECTION_STATE:
            return { type: 'connectionState', header, state: cursor.u8() };

        case PacketHeaderEnum.HANDSHAKE:
            return { type: 'handshake', header, id: cursor.u32(), time: cursor.u32(), delta: cursor.u32() };

        case PacketHeaderEnum.PING:
            return { type: 'ping', header };

        case PacketHeaderEnum.INTERNAL_PONG:
            return { type: 'internalPong', header, time: cursor.u32() };

        case PacketHeaderEnum.LOGIN_SUCCESS:
            return { type: 'loginSuccess', header, key: cursor.u32(), result: cursor.u8() };

        case PacketHeaderEnum.LOGIN_FAILED:
            return { type: 'loginFailed', header, status: cursor.ascii(9) };

        case PacketHeaderEnum.SERVER_STATUS: {
            const count = cursor.u32();
            const channels: ChannelStatus[] = [];
            for (let i = 0; i < count; i++) {
                channels.push({ port: cursor.u16(), status: cursor.u8() });
            }
            const success = cursor.u8() === 1;
            return { type: 'serverStatus', header, success, channels };
        }

        case PacketHeaderEnum.EMPIRE:
            return { type: 'empire', header, empireId: cursor.u8() };

        case PacketHeaderEnum.CHARACTERS_LIST: {
            const characters: CharacterSummary[] = [];
            for (let slot = 0; slot < 4; slot++) {
                characters.push(readCharacterBlock(cursor, slot, 0, ''));
            }
            const guildIds: number[] = [];
            for (let i = 0; i < 4; i++) {
                guildIds.push(cursor.u32());
            }
            const guildNames: string[] = [];
            for (let i = 0; i < 4; i++) {
                guildNames.push(cursor.ascii(GUILD_NAME_SIZE));
            }
            for (let i = 0; i < 4; i++) {
                characters[i].guildId = guildIds[i];
                characters[i].guildName = guildNames[i];
            }
            return { type: 'charactersList', header, characters };
        }

        case PacketHeaderEnum.CHARACTER_DETAILS:
            return {
                type: 'characterDetails',
                header,
                vid: cursor.u32(),
                playerClass: cursor.u16(),
                playerName: cursor.ascii(25),
                positionX: cursor.u32(),
                positionY: cursor.u32(),
                positionZ: cursor.u32(),
                empireId: cursor.u8(),
                skillGroup: cursor.u8(),
            };

        case PacketHeaderEnum.CHARACTER_POINTS: {
            const points: number[] = [];
            for (let i = 0; i < 255; i++) {
                points.push(cursor.u32());
            }
            return { type: 'characterPoints', header, points };
        }

        case PacketHeaderEnum.CHARACTER_POINT_CHANGE:
            cursor.skip(3); // the client struct declares the header as a 4-byte int
            return {
                type: 'characterPointChange',
                header,
                vid: cursor.u32(),
                pointType: cursor.u8(),
                amount: cursor.i32(),
                value: cursor.i32(),
            };

        case PacketHeaderEnum.SKILL_LEVEL: {
            const skills: SkillInfo[] = [];
            for (let i = 0; i < 255; i++) {
                skills.push({ rank: cursor.u8(), level: cursor.u8(), timeToNextRead: cursor.i32() });
            }
            return { type: 'skillLevel', header, skills };
        }

        case PacketHeaderEnum.GAME_TIME:
            return { type: 'gameTime', header, time: cursor.u32() };

        case PacketHeaderEnum.CHANNEL:
            return { type: 'channel', header, channel: cursor.u8() };

        case PacketHeaderEnum.SET_SKILL_GROUP:
            return { type: 'setSkillGroup', header, skillGroup: cursor.u8() };

        case PacketHeaderEnum.CREATE_CHARACTER_SUCCESS: {
            const slot = cursor.u8();
            const character = readCharacterBlock(cursor, slot, 0, '');
            return { type: 'createCharacterSuccess', header, slot, character };
        }

        case PacketHeaderEnum.CREATE_CHARACTER_FAILURE:
            return { type: 'createCharacterFailure', header, reason: cursor.u8() };

        case PacketHeaderEnum.DELETE_CHARACTER_SUCCESS:
            return { type: 'deleteCharacterSuccess', header, slot: cursor.u8() };

        case PacketHeaderEnum.DELETE_CHARACTER_FAILURE:
            return { type: 'deleteCharacterFailure', header };

        case PacketHeaderEnum.CHARACTER_SPAWN:
            return {
                type: 'characterSpawn',
                header,
                vid: cursor.u32(),
                rotation: cursor.f32(),
                positionX: cursor.u32(),
                positionY: cursor.u32(),
                positionZ: cursor.u32(),
                entityType: cursor.u8(),
                playerClass: cursor.u16(),
                movementSpeed: cursor.u8(),
                attackSpeed: cursor.u8(),
                state: cursor.u8(),
                affects: [cursor.u32(), cursor.u32()],
            };

        case PacketHeaderEnum.CHARACTER_INFO:
            return {
                type: 'characterInfo',
                header,
                vid: cursor.u32(),
                playerName: cursor.ascii(25),
                parts: readU16List(cursor, 4),
                empireId: cursor.u8(),
                guildId: cursor.u32(),
                level: cursor.u32(),
                rankPoints: cursor.u16(),
                pkMode: cursor.u8(),
                mountId: cursor.u32(),
            };

        case PacketHeaderEnum.CHARACTER_UPDATE:
            return {
                type: 'characterUpdate',
                header,
                vid: cursor.u32(),
                parts: readU16List(cursor, 4),
                moveSpeed: cursor.u8(),
                attackSpeed: cursor.u8(),
                state: cursor.u8(),
                affects: [cursor.u32(), cursor.u32()],
                guildId: cursor.u32(),
                rankPoints: cursor.u16(),
                pkMode: cursor.u8(),
                mountVnum: cursor.u32(),
            };

        case PacketHeaderEnum.CHARACTER_MOVE_OUT:
            return {
                type: 'characterMove',
                header,
                movementType: cursor.u8(),
                arg: cursor.u8(),
                rotation: cursor.u8(),
                vid: cursor.u32(),
                positionX: cursor.u32(),
                positionY: cursor.u32(),
                time: cursor.u32(),
                duration: cursor.u32(),
            };

        case PacketHeaderEnum.SYNC_POSITION: {
            const total = cursor.u16();
            const positions: SyncPositionServerPacket['positions'] = [];
            const elementBytes = Math.max(0, total - 3);
            const elements = Math.floor(elementBytes / 12);
            for (let i = 0; i < elements; i++) {
                positions.push({ vid: cursor.u32(), positionX: cursor.u32(), positionY: cursor.u32() });
            }
            return { type: 'syncPosition', header, positions };
        }

        case PacketHeaderEnum.CHARACTER_REMOVE:
            return { type: 'removeCharacter', header, vid: cursor.u32() };

        case PacketHeaderEnum.CHAT_OUT: {
            // TPacketGCChat: header, wSize (2), then bType.
            cursor.skip(2);
            return {
                type: 'chat',
                header,
                messageType: cursor.u8(),
                vid: cursor.u32(),
                empireId: cursor.u8(),
                message: cursor.ascii(cursor.remaining),
            };
        }

        case PacketHeaderEnum.CHARACTER_DIED:
            return { type: 'characterDied', header, vid: cursor.u32() };

        case PacketHeaderEnum.TARGET_UPDATED:
            return { type: 'targetUpdated', header, vid: cursor.u32(), healthPercentage: cursor.u8() };

        case PacketHeaderEnum.DAMAGE:
            return {
                type: 'damage',
                header,
                vid: cursor.u32(),
                damageFlags: cursor.u8(),
                damage: cursor.u32(),
            };

        case PacketHeaderEnum.TELEPORT:
            return {
                type: 'teleport',
                header,
                positionX: cursor.u32(),
                positionY: cursor.u32(),
                address: cursor.u32(),
                port: cursor.u16(),
            };

        case PacketHeaderEnum.ITEM: {
            const window = cursor.u8();
            const position = cursor.u16();
            const id = cursor.u32();
            const count = cursor.u8();
            // TPacketGCItemSet: flags(int), antiFlags(int), highlight(byte)
            // sit between the count and the socket block.
            cursor.skip(9);
            return {
                type: 'item',
                header,
                item: { window, position, id, count, sockets: readSockets(cursor), bonuses: readBonuses(cursor) },
            };
        }

        case PacketHeaderEnum.ITEM_UPDATE:
            return {
                type: 'itemUpdate',
                header,
                window: cursor.u8(),
                position: cursor.u16(),
                count: cursor.u8(),
                sockets: readSockets(cursor),
                bonuses: readBonuses(cursor),
            };

        case PacketHeaderEnum.ITEM_DROPPED:
            return {
                type: 'itemDropped',
                header,
                positionX: cursor.u32(),
                positionY: cursor.u32(),
                positionZ: cursor.u32(),
                vid: cursor.u32(),
                id: cursor.u32(),
            };

        case PacketHeaderEnum.ITEM_DROPPED_HIDE:
            return { type: 'itemDroppedHide', header, vid: cursor.u32() };

        case PacketHeaderEnum.SET_ITEM_OWNERSHIP:
            return { type: 'setItemOwnership', header, vid: cursor.u32(), ownerName: cursor.ascii(25) };

        case PacketHeaderEnum.AFFECT_ADD:
            return {
                type: 'affectAdd',
                header,
                affectType: cursor.u32(),
                apply: cursor.u8(),
                value: cursor.u32(),
                flag: cursor.u32(),
                duration: cursor.u32(),
                manaCost: cursor.u32(),
            };

        case PacketHeaderEnum.AFFECT_REMOVE:
            return { type: 'affectRemove', header, affectType: cursor.u32(), apply: cursor.u8() };

        case PacketHeaderEnum.SPECIAL_EFFECT:
            return { type: 'specialEffect', header, effectType: cursor.u8(), vid: cursor.u32() };

        case PacketHeaderEnum.FLY:
            return { type: 'fly', header, flyType: cursor.u8(), fromVid: cursor.u32(), toVid: cursor.u32() };

        case PacketHeaderEnum.FLY_TARGETING:
        case PacketHeaderEnum.ADD_FLY_TARGETING:
            return {
                type: 'flyTargeting',
                header,
                isAdd: header === PacketHeaderEnum.ADD_FLY_TARGETING,
                shooterVid: cursor.u32(),
                targetVid: cursor.u32(),
                positionX: cursor.u32(),
                positionY: cursor.u32(),
            };

        case PacketHeaderEnum.QUICK_SLOT_ADD_RESPONSE:
            return {
                type: 'quickSlotAddResponse',
                header,
                slot: cursor.u8(),
                slotType: cursor.u8(),
                position: cursor.u8(),
            };

        case PacketHeaderEnum.QUICK_SLOT_REMOVE_RESPONSE:
            return { type: 'quickSlotRemoveResponse', header, slot: cursor.u8() };

        case PacketHeaderEnum.QUICK_SLOT_SWAP_RESPONSE:
            return { type: 'quickSlotSwapResponse', header, slotA: cursor.u8(), slotB: cursor.u8() };

        case PacketHeaderEnum.SHOP_OUT: {
            cursor.skip(2); // leading size
            const subHeader = cursor.u8();

            if (subHeader === ShopSubHeaderGC.START) {
                const ownerVid = cursor.u32();
                const entries: ShopEntry[] = [];
                for (let pos = 0; pos < SHOP_GRID_SIZE; pos++) {
                    const entry = readShopEntry(cursor, pos);
                    if (entry.vnum !== 0) entries.push(entry);
                }
                return { type: 'shop', header, subHeader, ownerVid, entries, pos: 0 };
            }

            if (subHeader === ShopSubHeaderGC.UPDATE_ITEM) {
                const pos = cursor.u8();
                return { type: 'shop', header, subHeader, ownerVid: 0, entries: [readShopEntry(cursor, pos)], pos };
            }

            return { type: 'shop', header, subHeader, ownerVid: 0, entries: [], pos: 0 };
        }

        case PacketHeaderEnum.PLAYER_SHOP_OUT:
            return { type: 'shopSign', header, ownerVid: cursor.u32(), sign: cursor.ascii(33) };

        case PacketHeaderEnum.QUEST_SCRIPT: {
            cursor.skip(2); // leading size
            const skin = cursor.u8();
            const srcSize = cursor.u16();
            const available = Math.max(0, cursor.remaining);
            const src = cursor.ascii(Math.min(srcSize, available));
            return { type: 'questScript', header, skin, src };
        }

        case PacketHeaderEnum.QUEST_INFO: {
            cursor.skip(2); // leading size
            const id = cursor.u16();
            const flags = cursor.u8();
            const wasStarted = flags & QuestFlagEnum.ISBEGIN ? cursor.u8() : null;
            const title = flags & QuestFlagEnum.TITLE ? cursor.ascii(31) : null;
            const clockName = flags & QuestFlagEnum.CLOCK_NAME ? cursor.ascii(17) : null;
            const clockValue = flags & QuestFlagEnum.CLOCK_VALUE ? cursor.u32() : null;
            const counterName = flags & QuestFlagEnum.COUNTER_NAME ? cursor.ascii(17) : null;
            const counterValue = flags & QuestFlagEnum.COUNTER_VALUE ? cursor.u32() : null;
            const iconFile = flags & QuestFlagEnum.ICON_FILE ? cursor.ascii(25) : null;
            return {
                type: 'questInfo',
                header,
                id,
                flags,
                wasStarted,
                title,
                clockName,
                clockValue,
                counterName,
                counterValue,
                iconFile,
            };
        }

        case PacketHeaderEnum.QUEST_TARGET_CREATE:
            return {
                type: 'questTargetCreate',
                header,
                id: cursor.u32(),
                targetName: cursor.ascii(33),
                targetVid: cursor.u32(),
                targetType: cursor.u8(),
            };

        case PacketHeaderEnum.QUEST_TARGET_REMOVE:
            return { type: 'questTargetRemove', header, id: cursor.u32() };

        default:
            return raw(frame);
    }
}

export { SHOP_ENTRY_SIZE, SHOP_GRID_SIZE };
