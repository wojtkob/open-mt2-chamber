import BufferWriter from '@/core/interface/networking/buffer/BufferWriter';
import PacketHeaderEnum from '@/core/enum/PacketHeaderEnum';
import { ShopSubHeaderCG } from '@/core/enum/ShopSubHeaderEnum';
import { QuickSlotTypeEnum } from '@/core/enum/QuickSlotTypeEnum';
import { ProtocolError } from '@/client/errors';

/**
 * Encoders for every packet the *client* sends to the server.
 *
 * The core `in/*` packet classes only implement `unpack()` (they exist to parse
 * what the server receives), so the client needs its own writers. Each function
 * here mirrors the matching `in/*` class exactly: same header, same declared
 * size, same field order and widths, plus the trailing sequence byte the server
 * expects for sequenced packets. `ClientPacketWriter.test.ts` round-trips every
 * writer through the corresponding core `unpack()` to guarantee that.
 */

// The original client trails one zero byte after most packets; `Packet.getFrameLength`
// on the server adds it to the declared size, so a 65 byte login request arrives as 66.
const SEQUENCE_BYTE = 0;

const sequenced = (writer: BufferWriter): Buffer => Buffer.concat([writer.getBuffer(), Buffer.from([SEQUENCE_BYTE])]);
const raw = (writer: BufferWriter): Buffer => writer.getBuffer();

export const USERNAME_MAX_LENGTH = 30;
export const TOKEN_FIELD_LENGTH = 31;
export const PASSWORD_FIELD_LENGTH = 17;
export const PRIVATE_CODE_LENGTH = 8;
export const CHARACTER_NAME_LENGTH = 25;
export const CLIENT_VERSION_FIELD_LENGTH = 33;

export type HandshakePayload = { id: number; time: number; delta: number };

export type LoginRequestPayload = { username: string; password: string; key?: number };

export type TokenPayload = { username: string; key: number; xteaKeys: number[] };

export type CharacterMovePayload = {
    movementType: number;
    arg: number;
    rotation: number;
    positionX: number;
    positionY: number;
    time: number;
};

export type AttackPayload = { skillVnum: number; victimVirtualId: number };

export type SkillUsePayload = { skillNum: number; targetVirtualId: number };

export type ItemMovePayload = {
    fromWindow: number;
    fromPosition: number;
    toWindow: number;
    toPosition: number;
    count: number;
};

export type ItemDropPayload = { window: number; position: number; gold: number; count: number };

export type CreateCharacterPayload = {
    slot: number;
    playerName: string;
    playerClass: number;
    appearance: number;
};

export type DeleteCharacterPayload = { slot: number; privateCode: string };

export type QuickSlotAddPayload = { slot: number; type: QuickSlotTypeEnum; position: number };

export type QuickSlotSwapPayload = { slotA: number; slotB: number };

export type FlyTargetingPayload = { targetVirtualId: number; positionX: number; positionY: number };

export type MyShopItemEntry = {
    /** Item vnum (proto ID). */
    vnum: number;
    /** Stack count. */
    count: number;
    /** Window type (inventory = 1). */
    windowType: number;
    /** Cell index inside the source window. */
    cellIndex: number;
    /** Price set by the seller. */
    price: number;
    /** Display position in the shop grid. */
    displayPos: number;
};

export type ShopRequest =
    | { subHeader: ShopSubHeaderCG.END }
    | { subHeader: ShopSubHeaderCG.BUY; pos: number }
    | { subHeader: ShopSubHeaderCG.SELL; pos: number }
    | { subHeader: ShopSubHeaderCG.SELL2; pos: number; count: number };

export default class ClientPacketWriter {
    /** CG_HANDSHAKE (13 bytes, not sequenced): the exact id/time/delta the server sent. */
    static handshake({ id, time, delta }: HandshakePayload): Buffer {
        const writer = new BufferWriter(PacketHeaderEnum.HANDSHAKE, 13);
        writer.writeUint32LE(id);
        writer.writeUint32LE(time);
        writer.writeUint32LE(delta);
        return raw(writer);
    }

    /** CG_LOGIN_REQUEST (65 bytes + sequence). */
    static loginRequest({ username, password, key = 0 }: LoginRequestPayload): Buffer {
        const writer = new BufferWriter(PacketHeaderEnum.LOGIN_REQUEST, 65);
        writer.writeString(username, TOKEN_FIELD_LENGTH);
        writer.writeString(password, PASSWORD_FIELD_LENGTH);
        writer.writeUint32LE(key);
        return sequenced(writer);
    }

    /** CG_SERVER_STATUS_REQUEST (header only, not sequenced). */
    static serverStatusRequest(): Buffer {
        return raw(new BufferWriter(PacketHeaderEnum.SERVER_STATUS_REQUEST, 1));
    }

    /** CG_INTERNAL_PING (5 bytes, not sequenced). */
    static internalPing(time: number): Buffer {
        const writer = new BufferWriter(PacketHeaderEnum.INTERNAL_PING, 5);
        writer.writeUint32LE(time);
        return raw(writer);
    }

    /** CG_PONG (header only, not sequenced). */
    static pong(): Buffer {
        return raw(new BufferWriter(PacketHeaderEnum.PONG, 1));
    }

    /** CG_MARK_LOGIN (9 bytes, not sequenced). */
    static markLogin(): Buffer {
        return raw(new BufferWriter(PacketHeaderEnum.MARK_LOGIN, 9));
    }

    /** CG_CLIENT_VERSION (67 bytes + sequence). */
    static clientVersion(clientName: string, timeStamp: string): Buffer {
        const writer = new BufferWriter(PacketHeaderEnum.CLIENT_VERSION, 67);
        writer.writeString(clientName, CLIENT_VERSION_FIELD_LENGTH);
        writer.writeString(timeStamp, CLIENT_VERSION_FIELD_LENGTH);
        return sequenced(writer);
    }

    /** CG_TOKEN (52 bytes + sequence). */
    static token({ username, key, xteaKeys }: TokenPayload): Buffer {
        if (xteaKeys.length !== 4) {
            throw new ProtocolError(`The token packet needs exactly 4 XTEA keys, got ${xteaKeys.length}`);
        }
        const writer = new BufferWriter(PacketHeaderEnum.TOKEN, 52);
        writer.writeString(username, TOKEN_FIELD_LENGTH);
        writer.writeUint32LE(key);
        for (const xteaKey of xteaKeys) {
            writer.writeUint32LE(xteaKey);
        }
        return sequenced(writer);
    }

    /** CG_PLAYER_CREATE (34 bytes + sequence). */
    static createCharacter({ slot, playerName, playerClass, appearance }: CreateCharacterPayload): Buffer {
        const writer = new BufferWriter(PacketHeaderEnum.CREATE_CHARACTER, 34);
        writer.writeUint8(slot);
        writer.writeString(playerName, CHARACTER_NAME_LENGTH);
        writer.writeUint16LE(playerClass);
        writer.writeUint8(appearance);
        return sequenced(writer);
    }

    /** CG_PLAYER_DELETE (10 bytes + sequence). */
    static deleteCharacter({ slot, privateCode }: DeleteCharacterPayload): Buffer {
        const writer = new BufferWriter(PacketHeaderEnum.DELETE_CHARACTER, 10);
        writer.writeUint8(slot);
        writer.writeString(privateCode, PRIVATE_CODE_LENGTH);
        return sequenced(writer);
    }

    /** CG_SELECT_CHARACTER (2 bytes + sequence). */
    static selectCharacter(slot: number): Buffer {
        const writer = new BufferWriter(PacketHeaderEnum.SELECT_CHARACTER, 2);
        writer.writeUint8(slot);
        return sequenced(writer);
    }

    /** CG_ENTER_GAME (1 byte + sequence). */
    static enterGame(): Buffer {
        return sequenced(new BufferWriter(PacketHeaderEnum.ENTER_GAME, 1));
    }

    /** CG_CHARACTER_MOVE (16 bytes + sequence). */
    static characterMove({ movementType, arg, rotation, positionX, positionY, time }: CharacterMovePayload): Buffer {
        const writer = new BufferWriter(PacketHeaderEnum.CHARACTER_MOVE, 16);
        writer.writeUint8(movementType);
        writer.writeUint8(arg);
        writer.writeUint8(rotation);
        writer.writeUint32LE(positionX);
        writer.writeUint32LE(positionY);
        writer.writeUint32LE(time);
        return sequenced(writer);
    }

    /**
     * CG_CHAT (dynamic size + sequence). The leading u16 is the whole frame size
     * excluding the sequence byte, i.e. header + u16 + type + NUL terminated text.
     */
    static chat(message: string, messageType: number): Buffer {
        if (message.includes('\0')) {
            throw new ProtocolError('Chat messages cannot contain NUL bytes');
        }
        const asciiLength = Buffer.byteLength(message, 'ascii');
        const size = 5 + asciiLength; // header + u16 + type + (text + NUL)
        const writer = new BufferWriter(PacketHeaderEnum.CHAT_IN, size);
        writer.writeUint16LE(size);
        writer.writeUint8(messageType);
        writer.writeString(message, asciiLength + 1);
        return sequenced(writer);
    }

    /** CG_ATTACK (8 bytes + sequence). */
    static attack({ skillVnum, victimVirtualId }: AttackPayload): Buffer {
        const writer = new BufferWriter(PacketHeaderEnum.ATTACK, 8);
        writer.writeUint8(skillVnum);
        writer.writeUint32LE(victimVirtualId);
        writer.writeUint16LE(0);
        return sequenced(writer);
    }

    /** CG_TARGET (5 bytes + sequence). */
    static target(targetVirtualId: number): Buffer {
        const writer = new BufferWriter(PacketHeaderEnum.TARGET, 5);
        writer.writeUint32LE(targetVirtualId);
        return sequenced(writer);
    }

    /** CG_SKILL_USE (9 bytes + sequence). */
    static skillUse({ skillNum, targetVirtualId }: SkillUsePayload): Buffer {
        const writer = new BufferWriter(PacketHeaderEnum.SKILL_USE, 9);
        writer.writeUint32LE(skillNum);
        writer.writeUint32LE(targetVirtualId);
        return sequenced(writer);
    }

    /** CG_ITEM_USE (4 bytes + sequence). */
    static itemUse(window: number, position: number): Buffer {
        const writer = new BufferWriter(PacketHeaderEnum.ITEM_USE, 4);
        writer.writeUint8(window);
        writer.writeUint16LE(position);
        return sequenced(writer);
    }

    /** CG_ITEM_MOVE (8 bytes + sequence). */
    static itemMove({ fromWindow, fromPosition, toWindow, toPosition, count }: ItemMovePayload): Buffer {
        const writer = new BufferWriter(PacketHeaderEnum.ITEM_MOVE, 8);
        writer.writeUint8(fromWindow);
        writer.writeUint16LE(fromPosition);
        writer.writeUint8(toWindow);
        writer.writeUint16LE(toPosition);
        writer.writeUint8(count);
        return sequenced(writer);
    }

    /** CG_ITEM_DROP (9 bytes + sequence). */
    static itemDrop({ window, position, gold, count }: ItemDropPayload): Buffer {
        const writer = new BufferWriter(PacketHeaderEnum.ITEM_DROP, 9);
        writer.writeUint8(window);
        writer.writeUint16LE(position);
        writer.writeUint32LE(gold);
        writer.writeUint8(count);
        return sequenced(writer);
    }

    /** CG_ITEM_PICKUP (5 bytes + sequence). */
    static itemPickup(virtualId: number): Buffer {
        const writer = new BufferWriter(PacketHeaderEnum.ITEM_PICKUP, 5);
        writer.writeUint32LE(virtualId);
        return sequenced(writer);
    }

    /** CG_ON_CLICK (5 bytes + sequence). */
    static onClick(targetVirtualId: number): Buffer {
        const writer = new BufferWriter(PacketHeaderEnum.ON_CLICK, 5);
        writer.writeUint32LE(targetVirtualId);
        return sequenced(writer);
    }

    /** CG_QUEST_ANSWER (2 bytes + sequence). */
    static questAnswer(answer: number): Buffer {
        const writer = new BufferWriter(PacketHeaderEnum.QUEST_ANSWER, 2);
        writer.writeUint8(answer);
        return sequenced(writer);
    }

    /** CG_QUEST_BUTTON (5 bytes + sequence). */
    static questButton(questId: number): Buffer {
        const writer = new BufferWriter(PacketHeaderEnum.QUEST_BUTTON, 5);
        writer.writeUint32LE(questId);
        return sequenced(writer);
    }

    /** CG_QUICKSLOT_ADD (4 bytes + sequence). */
    static quickSlotAdd({ slot, type, position }: QuickSlotAddPayload): Buffer {
        const writer = new BufferWriter(PacketHeaderEnum.QUICK_SLOT_ADD_REQUEST, 4);
        writer.writeUint8(slot);
        writer.writeUint8(type);
        writer.writeUint8(position);
        return sequenced(writer);
    }

    /** CG_QUICKSLOT_SWAP (3 bytes + sequence). */
    static quickSlotSwap({ slotA, slotB }: QuickSlotSwapPayload): Buffer {
        const writer = new BufferWriter(PacketHeaderEnum.QUICK_SLOT_SWAP_REQUEST, 3);
        writer.writeUint8(slotA);
        writer.writeUint8(slotB);
        return sequenced(writer);
    }

    /** CG_QUICKSLOT_REMOVE (2 bytes + sequence). */
    static quickSlotRemove(slot: number): Buffer {
        const writer = new BufferWriter(PacketHeaderEnum.QUICK_SLOT_REMOVE_REQUEST, 2);
        writer.writeUint8(slot);
        return sequenced(writer);
    }

    /** CG_FLY_TARGETING (13 bytes + sequence). */
    static flyTargeting({ targetVirtualId, positionX, positionY }: FlyTargetingPayload): Buffer {
        const writer = new BufferWriter(PacketHeaderEnum.FLY_TARGETING_REQUEST, 13);
        writer.writeUint32LE(targetVirtualId);
        writer.writeUint32LE(positionX);
        writer.writeUint32LE(positionY);
        return sequenced(writer);
    }

    /** CG_ADD_FLY_TARGETING (13 bytes + sequence): queues another target for the pending shot. */
    static addFlyTargeting({ targetVirtualId, positionX, positionY }: FlyTargetingPayload): Buffer {
        const writer = new BufferWriter(PacketHeaderEnum.ADD_FLY_TARGETING_REQUEST, 13);
        writer.writeUint32LE(targetVirtualId);
        writer.writeUint32LE(positionX);
        writer.writeUint32LE(positionY);
        return sequenced(writer);
    }

    /** CG_SHOOT (2 bytes + sequence). */
    static shoot(type: number): Buffer {
        const writer = new BufferWriter(PacketHeaderEnum.SHOOT, 2);
        writer.writeUint8(type);
        return sequenced(writer);
    }

    /** CG_MYSHOP_OPEN (0x37): publish a private shop. Sign is 33 bytes, then 13-byte item rows. */
    static myShop(sign: string, items: MyShopItemEntry[]): Buffer {
        const size = 35 + items.length * 13; // header + sign(33) + count(1) + rows
        if (size > 0xffff) {
            throw new ProtocolError(`Private shop too large (${items.length} items)`);
        }
        const writer = new BufferWriter(PacketHeaderEnum.PLAYER_SHOP_IN, size);
        writer.writeString(sign, 33);
        writer.writeUint8(items.length);
        for (const item of items) {
            writer.writeUint32LE(item.vnum);
            writer.writeUint8(item.count);
            writer.writeUint8(item.windowType);
            writer.writeUint16LE(item.cellIndex);
            writer.writeUint32LE(item.price);
            writer.writeUint8(item.displayPos);
        }
        return sequenced(writer);
    }

    /**
     * CG_SHOP: a subheader plus a variable body, then the sequence byte. Sizes
     * mirror `ShopPacket.getFrameLength()`: END = 3, BUY = 5, SELL = 4, SELL2 = 5.
     */
    static shop(request: ShopRequest): Buffer {
        switch (request.subHeader) {
            case ShopSubHeaderCG.END: {
                const writer = new BufferWriter(PacketHeaderEnum.SHOP_IN, 2);
                writer.writeUint8(ShopSubHeaderCG.END);
                return sequenced(writer);
            }
            case ShopSubHeaderCG.BUY: {
                const writer = new BufferWriter(PacketHeaderEnum.SHOP_IN, 4);
                writer.writeUint8(ShopSubHeaderCG.BUY);
                writer.writeUint8(0);
                writer.writeUint8(request.pos);
                return sequenced(writer);
            }
            case ShopSubHeaderCG.SELL: {
                const writer = new BufferWriter(PacketHeaderEnum.SHOP_IN, 3);
                writer.writeUint8(ShopSubHeaderCG.SELL);
                writer.writeUint8(request.pos);
                return sequenced(writer);
            }
            case ShopSubHeaderCG.SELL2: {
                const writer = new BufferWriter(PacketHeaderEnum.SHOP_IN, 4);
                writer.writeUint8(ShopSubHeaderCG.SELL2);
                writer.writeUint8(request.pos);
                writer.writeUint8(request.count);
                return sequenced(writer);
            }
            default: {
                const exhaustive: never = request;
                throw new ProtocolError(`Unsupported shop subheader: ${JSON.stringify(exhaustive)}`);
            }
        }
    }
}
