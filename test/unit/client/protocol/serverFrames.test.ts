import { expect } from 'chai';
import PacketHeaderEnum from '@/core/enum/PacketHeaderEnum';
import { ConnectionStateEnum } from '@/core/enum/ConnectionStateEnum';
import FrameDecoder, {
    MAX_RECEIVE_BUFFER,
    MAX_SERVER_FRAME_LENGTH,
    serverFrameLength,
} from '@/client/protocol/serverFrames';
import { ProtocolError } from '@/client/errors';
import ConnectionStatePacket from '@/core/interface/networking/packets/packet/out/ConnectionStatePacket';
import HandshakePacket from '@/core/interface/networking/packets/packet/bidirectional/handshake/HandshakePacket';
import ChatOutPacket from '@/core/interface/networking/packets/packet/out/ChatOutPacket';
import ShopStartPacket from '@/core/interface/networking/packets/packet/out/ShopStartPacket';
import SyncPositionPacket from '@/core/interface/networking/packets/packet/out/SyncPositionPacket';

describe('serverFrameLength', () => {
    it('reports the fixed length of known headers', () => {
        expect(serverFrameLength(PacketHeaderEnum.CONNECTION_STATE, Buffer.from([0xfd]))).to.equal(2);
        expect(serverFrameLength(PacketHeaderEnum.HANDSHAKE, Buffer.from([0xff]))).to.equal(13);
        expect(serverFrameLength(PacketHeaderEnum.SKILL_LEVEL, Buffer.from([0x4c]))).to.equal(1531);
        expect(serverFrameLength(PacketHeaderEnum.CHARACTERS_LIST, Buffer.from([0x20]))).to.equal(329);
    });

    it('reads the length from the leading u16 size field of dynamic packets', () => {
        const frame = new ChatOutPacket({ messageType: 0, vid: 1, empireId: 0, message: 'hello' }).pack();
        expect(serverFrameLength(PacketHeaderEnum.CHAT_OUT, frame)).to.equal(frame.byteLength);
    });

    it('returns null while a dynamic packet has too few bytes to read its size', () => {
        expect(serverFrameLength(PacketHeaderEnum.CHAT_OUT, Buffer.from([0x04]))).to.equal(null);
        expect(serverFrameLength(PacketHeaderEnum.CHAT_OUT, Buffer.from([0x04, 0x01]))).to.equal(null);
    });

    it('computes the server status length from its channel count', () => {
        const buffer = Buffer.alloc(5);
        buffer[0] = PacketHeaderEnum.SERVER_STATUS;
        buffer.writeUInt32LE(2, 1);
        expect(serverFrameLength(PacketHeaderEnum.SERVER_STATUS, buffer)).to.equal(12);
    });

    it('throws a ProtocolError for an unknown header', () => {
        expect(() => serverFrameLength(0x99, Buffer.from([0x99]))).to.throw(ProtocolError);
    });
});

describe('FrameDecoder', () => {
    const connectionStateFrame = (state: ConnectionStateEnum) => new ConnectionStatePacket({ state }).pack();

    it('emits one complete frame', () => {
        const decoder = new FrameDecoder();
        const frames = decoder.push(connectionStateFrame(ConnectionStateEnum.HANDSHAKE));
        expect(frames).to.have.lengthOf(1);
        expect(frames[0]).to.deep.equal(connectionStateFrame(ConnectionStateEnum.HANDSHAKE));
        expect(decoder.pending).to.equal(0);
    });

    it('reassembles a frame split across several chunks', () => {
        const decoder = new FrameDecoder();
        const frame = new HandshakePacket({ id: 1, time: 2, delta: 3 }).pack();

        expect(decoder.push(frame.subarray(0, 4))).to.deep.equal([]);
        expect(decoder.pending).to.equal(4);
        expect(decoder.push(frame.subarray(4, 9))).to.deep.equal([]);
        const frames = decoder.push(frame.subarray(9));
        expect(frames).to.have.lengthOf(1);
        expect(frames[0]).to.deep.equal(frame);
        expect(decoder.pending).to.equal(0);
    });

    it('splits several frames concatenated in one chunk', () => {
        const decoder = new FrameDecoder();
        const a = connectionStateFrame(ConnectionStateEnum.HANDSHAKE);
        const b = connectionStateFrame(ConnectionStateEnum.AUTH);
        const c = connectionStateFrame(ConnectionStateEnum.GAME);

        const frames = decoder.push(Buffer.concat([a, b, c]));
        expect(frames).to.have.lengthOf(3);
        expect(frames[0]).to.deep.equal(a);
        expect(frames[1]).to.deep.equal(b);
        expect(frames[2]).to.deep.equal(c);
    });

    it('holds a complete frame back until the following partial frame completes', () => {
        const decoder = new FrameDecoder();
        const complete = connectionStateFrame(ConnectionStateEnum.SELECT);
        const partial = new HandshakePacket({ id: 1, time: 2, delta: 3 }).pack().subarray(0, 5);

        const frames = decoder.push(Buffer.concat([complete, partial]));
        expect(frames).to.have.lengthOf(1);
        expect(frames[0]).to.deep.equal(complete);
        expect(decoder.pending).to.equal(5);
    });

    it('reads a dynamic frame (chat) by its own size field', () => {
        const decoder = new FrameDecoder();
        const frame = new ChatOutPacket({ messageType: 6, vid: 9, empireId: 1, message: 'dynamic' }).pack();
        const frames = decoder.push(frame);
        expect(frames).to.have.lengthOf(1);
        expect(frames[0]).to.deep.equal(frame);
    });

    it('reads a large fixed frame (shop start) in full', () => {
        const decoder = new FrameDecoder();
        const frame = new ShopStartPacket({ ownerVid: 1, items: [] }).pack();
        const frames = decoder.push(frame);
        expect(frames).to.have.lengthOf(1);
        expect(frames[0]).to.deep.equal(frame);
        expect(frame.byteLength).to.equal(1728);
    });

    it('rejects a frame length below one', () => {
        const decoder = new FrameDecoder();
        const buffer = Buffer.from([PacketHeaderEnum.CHAT_OUT, 0x00, 0x00]);
        expect(() => decoder.push(buffer)).to.throw(ProtocolError);
    });

    it('rejects a frame longer than the maximum', () => {
        const decoder = new FrameDecoder();
        const buffer = Buffer.alloc(3);
        buffer[0] = PacketHeaderEnum.SYNC_POSITION;
        buffer.writeUInt16LE(MAX_SERVER_FRAME_LENGTH + 1, 1);
        expect(() => decoder.push(buffer)).to.throw(ProtocolError);
    });

    it('rejects an unknown header', () => {
        const decoder = new FrameDecoder();
        expect(() => decoder.push(Buffer.from([0x99, 0x00]))).to.throw(ProtocolError);
    });

    it('resets the buffered remainder', () => {
        const decoder = new FrameDecoder();
        decoder.push(new SyncPositionPacket({ virtualId: 1, positionX: 2, positionY: 3 }).pack().subarray(0, 3));
        expect(decoder.pending).to.be.greaterThan(0);
        decoder.reset();
        expect(decoder.pending).to.equal(0);
    });

    it('exposes sane safety limits', () => {
        expect(MAX_SERVER_FRAME_LENGTH).to.be.greaterThan(1728);
        expect(MAX_RECEIVE_BUFFER).to.be.greaterThan(MAX_SERVER_FRAME_LENGTH);
    });
});
