import PacketHeaderEnum from '@/core/enum/PacketHeaderEnum';
import { ProtocolError } from '@/client/errors';

/**
 * Frame lengths of every packet the *server* sends to the client.
 *
 * The server writes each `PacketOut.pack()` straight to the socket with no
 * length prefix, so the only way for a client to delimit frames is a
 * header -> length table. The lengths below are the declared `size` of each
 * out-packet (see `src/core/interface/networking/packets/packet/out`); for the
 * handful of packets whose size lives in a leading `size` field we read that
 * field instead. This table is the client-side mirror of the server's
 * `Packets.getFrameLength()`, which covers the opposite direction.
 */
const FIXED_FRAME_LENGTH: Readonly<Record<number, number>> = {
    [PacketHeaderEnum.CHARACTER_SPAWN]: 35,
    [PacketHeaderEnum.CHARACTER_REMOVE]: 5,
    [PacketHeaderEnum.CHARACTER_MOVE_OUT]: 24,
    [PacketHeaderEnum.LOGIN_FAILED]: 10,
    [PacketHeaderEnum.CREATE_CHARACTER_SUCCESS]: 65,
    [PacketHeaderEnum.CREATE_CHARACTER_FAILURE]: 2,
    [PacketHeaderEnum.DELETE_CHARACTER_SUCCESS]: 2,
    [PacketHeaderEnum.DELETE_CHARACTER_FAILURE]: 1,
    [PacketHeaderEnum.CHARACTER_DIED]: 5,
    [PacketHeaderEnum.CHARACTER_POINTS]: 1021,
    [PacketHeaderEnum.CHARACTER_POINT_CHANGE]: 17,
    [PacketHeaderEnum.CHARACTER_UPDATE]: 35,
    [PacketHeaderEnum.ITEM]: 51,
    [PacketHeaderEnum.ITEM_UPDATE]: 38,
    [PacketHeaderEnum.ITEM_DROPPED]: 21,
    [PacketHeaderEnum.ITEM_DROPPED_HIDE]: 21,
    [PacketHeaderEnum.QUICK_SLOT_ADD_RESPONSE]: 4,
    [PacketHeaderEnum.QUICK_SLOT_REMOVE_RESPONSE]: 2,
    [PacketHeaderEnum.QUICK_SLOT_SWAP_RESPONSE]: 3,
    [PacketHeaderEnum.SET_ITEM_OWNERSHIP]: 30,
    [PacketHeaderEnum.CHARACTERS_LIST]: 329,
    [PacketHeaderEnum.PLAYER_SHOP_OUT]: 38,
    [PacketHeaderEnum.PING]: 1,
    [PacketHeaderEnum.TARGET_UPDATED]: 6,
    [PacketHeaderEnum.TELEPORT]: 15,
    [PacketHeaderEnum.ADD_FLY_TARGETING]: 17,
    [PacketHeaderEnum.FLY]: 10,
    [PacketHeaderEnum.FLY_TARGETING]: 17,
    [PacketHeaderEnum.SKILL_LEVEL]: 1531,
    [PacketHeaderEnum.EMPIRE]: 2,
    [PacketHeaderEnum.GAME_TIME]: 5,
    [PacketHeaderEnum.SET_SKILL_GROUP]: 2,
    [PacketHeaderEnum.CHARACTER_DETAILS]: 46,
    [PacketHeaderEnum.SPECIAL_EFFECT]: 6,
    [PacketHeaderEnum.CHANNEL]: 2,
    [PacketHeaderEnum.QUEST_TARGET_REMOVE]: 5,
    [PacketHeaderEnum.QUEST_TARGET_CREATE]: 51,
    [PacketHeaderEnum.AFFECT_ADD]: 22,
    [PacketHeaderEnum.AFFECT_REMOVE]: 6,
    [PacketHeaderEnum.DAMAGE]: 10,
    [PacketHeaderEnum.CHARACTER_INFO]: 54,
    [PacketHeaderEnum.LOGIN_SUCCESS]: 6,
    [PacketHeaderEnum.INTERNAL_PONG]: 5,
    [PacketHeaderEnum.CONNECTION_STATE]: 2,
    [PacketHeaderEnum.HANDSHAKE]: 13,
};

/** Length-in-first-field packets: the u16 size at offset 1 is the whole frame. */
const READ_U16_SIZE_HEADERS: ReadonlySet<number> = new Set([
    PacketHeaderEnum.CHAT_OUT,
    PacketHeaderEnum.SYNC_POSITION,
    PacketHeaderEnum.QUEST_SCRIPT,
    PacketHeaderEnum.QUEST_INFO,
    PacketHeaderEnum.SHOP_OUT,
]);

/** Largest frame we will buffer. The biggest real packet is the 1728 byte shop. */
export const MAX_SERVER_FRAME_LENGTH = 8192;

/** How many unparsed bytes may accumulate before the stream is considered corrupt. */
export const MAX_RECEIVE_BUFFER = 16_384;

/**
 * The total on-wire length of the frame that starts at `buffer[0]`, or `null`
 * while the buffer does not yet hold enough bytes to tell.
 *
 * @throws ProtocolError when the header is not a known server packet.
 */
export function serverFrameLength(header: number, buffer: Buffer): number | null {
    const fixed = FIXED_FRAME_LENGTH[header];
    if (fixed !== undefined) {
        return fixed;
    }

    if (READ_U16_SIZE_HEADERS.has(header)) {
        if (buffer.byteLength < 3) return null;
        return buffer.readUInt16LE(1);
    }

    if (header === PacketHeaderEnum.SERVER_STATUS) {
        if (buffer.byteLength < 5) return null;
        return 6 + buffer.readUInt32LE(1) * 3;
    }

    throw new ProtocolError(`Unknown server packet header: 0x${header.toString(16).padStart(2, '0')}`);
}

/**
 * Splits a byte stream into complete server frames.
 *
 * Feed it each socket chunk with {@link push}; it returns whichever frames are
 * now complete and retains the partial remainder. It never allocates per
 * packet beyond the returned subarrays, and it refuses to grow without bound
 * so a desynchronised stream fails fast instead of exhausting memory.
 */
export default class FrameDecoder {
    private buffer: Buffer = Buffer.alloc(0);

    /** Bytes held back awaiting the rest of their frame. */
    get pending(): number {
        return this.buffer.byteLength;
    }

    reset(): void {
        this.buffer = Buffer.alloc(0);
    }

    push(chunk: Buffer): Buffer[] {
        if (chunk.byteLength === 0) return [];

        this.buffer = this.buffer.byteLength === 0 ? chunk : Buffer.concat([this.buffer, chunk]);

        const frames: Buffer[] = [];

        while (this.buffer.byteLength > 0) {
            const header = this.buffer[0];
            const length = serverFrameLength(header, this.buffer);

            if (length === null) break;

            if (length < 1 || length > MAX_SERVER_FRAME_LENGTH) {
                throw new ProtocolError(
                    `Invalid frame length ${length} for header 0x${header.toString(16).padStart(2, '0')}`,
                );
            }

            if (this.buffer.byteLength < length) break;

            frames.push(this.buffer.subarray(0, length));
            this.buffer = this.buffer.subarray(length);
        }

        if (this.buffer.byteLength > MAX_RECEIVE_BUFFER) {
            throw new ProtocolError(`Receive buffer overflow (${this.buffer.byteLength} buffered bytes)`);
        }

        return frames;
    }
}
