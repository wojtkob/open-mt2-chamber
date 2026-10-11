import { AddressInfo, Server as NetServer, Socket, createServer } from 'node:net';
import PacketHeaderEnum from '@/core/enum/PacketHeaderEnum';
import { ConnectionStateEnum } from '@/core/enum/ConnectionStateEnum';
import HandshakePacket from '@/core/interface/networking/packets/packet/bidirectional/handshake/HandshakePacket';
import EmpirePacket from '@/core/interface/networking/packets/packet/bidirectional/empire/EmpirePacket';
import ConnectionStatePacket from '@/core/interface/networking/packets/packet/out/ConnectionStatePacket';
import LoginSuccessPacket from '@/core/interface/networking/packets/packet/out/LoginSuccessPacket';
import LoginFailedPacket from '@/core/interface/networking/packets/packet/out/LoginFailedPacket';
import ServerStatusPacket from '@/core/interface/networking/packets/packet/out/ServerStatusPacket';
import CharactersInfoPacket from '@/core/interface/networking/packets/packet/out/CharactersInfoPacket';
import CharacterDetailsPacket from '@/core/interface/networking/packets/packet/out/CharacterDetailsPacket';
import CharacterPointsPacket from '@/core/interface/networking/packets/packet/out/CharacterPointsPacket';
import SkillLevelPacket from '@/core/interface/networking/packets/packet/out/SkillLevelPacket';
import GameTimePacket from '@/core/interface/networking/packets/packet/out/GameTimePacket';
import ChannelPacket from '@/core/interface/networking/packets/packet/out/ChannelPacket';
import LoginRequestPacket from '@/core/interface/networking/packets/packet/in/loginRequest/LoginRequestPacket';
import AuthTokenPacket from '@/core/interface/networking/packets/packet/in/authToken/AuthTokenPacket';

/**
 * Minimal in-process TCP server that speaks the real client->server framing.
 *
 * The client sends frames with no length prefix, so the harness needs the same
 * header->length knowledge the real server has. It only models the packets the
 * client tests actually send; anything else destroys the socket (which the
 * tests assert on). Each `FakeServer` records the frames it received and lets
 * the test answer per frame, so the protocol flow stays visible in the test.
 */
export type FrameHandler = (socket: Socket, header: number, frame: Buffer) => void;
export type ConnectHandler = (socket: Socket) => void;

const FIXED_CLIENT_FRAME_LENGTH: Readonly<Record<number, number>> = {
    [PacketHeaderEnum.HANDSHAKE]: 13,
    [PacketHeaderEnum.LOGIN_REQUEST]: 66,
    [PacketHeaderEnum.TOKEN]: 53,
    [PacketHeaderEnum.SELECT_CHARACTER]: 3,
    [PacketHeaderEnum.ENTER_GAME]: 2,
    [PacketHeaderEnum.PONG]: 1,
    [PacketHeaderEnum.SERVER_STATUS_REQUEST]: 1,
    [PacketHeaderEnum.MARK_LOGIN]: 9,
    [PacketHeaderEnum.INTERNAL_PING]: 5,
    [PacketHeaderEnum.CLIENT_VERSION]: 68,
};

/** `number` = length, `null` = need more bytes, `undefined` = unknown header. */
export function clientFrameLength(header: number, buffer: Buffer): number | null | undefined {
    if (header === PacketHeaderEnum.CHAT_IN) {
        return buffer.byteLength < 3 ? null : buffer.readUInt16LE(1) + 1;
    }
    return FIXED_CLIENT_FRAME_LENGTH[header];
}

export default class FakeServer {
    port = 0;
    readonly received: Array<{ header: number; frame: Buffer }> = [];

    private readonly server: NetServer;
    private readonly sockets = new Set<Socket>();
    private readonly buffers = new Map<Socket, Buffer>();
    private readonly frameHandlers: FrameHandler[] = [];
    private connectHandler: ConnectHandler | null = null;

    constructor() {
        this.server = createServer((socket) => {
            this.sockets.add(socket);
            this.buffers.set(socket, Buffer.alloc(0));
            socket.on('data', (chunk) => this.feed(socket, chunk));
            socket.on('error', () => undefined);
            socket.on('close', () => {
                this.sockets.delete(socket);
                this.buffers.delete(socket);
            });
            this.connectHandler?.(socket);
        });
    }

    onConnect(handler: ConnectHandler): this {
        this.connectHandler = handler;
        return this;
    }

    onFrame(handler: FrameHandler): this {
        this.frameHandlers.push(handler);
        return this;
    }

    listen(): Promise<number> {
        return new Promise((resolve) => {
            this.server.listen(0, '127.0.0.1', () => {
                this.port = (this.server.address() as AddressInfo).port;
                resolve(this.port);
            });
        });
    }

    close(): Promise<void> {
        return new Promise((resolve) => {
            for (const socket of this.sockets) socket.destroy();
            this.server.close(() => resolve());
        });
    }

    send(socket: Socket, frame: Buffer): void {
        socket.write(frame);
    }

    private feed(socket: Socket, chunk: Buffer): void {
        const buffer = Buffer.concat([this.buffers.get(socket) ?? Buffer.alloc(0), chunk]);
        let offset = 0;

        while (offset < buffer.byteLength) {
            const header = buffer[offset];
            const length = clientFrameLength(header, buffer.subarray(offset));
            if (length === undefined) {
                socket.destroy();
                return;
            }
            if (length === null || buffer.byteLength - offset < length) break;

            const frame = buffer.subarray(offset, offset + length);
            offset += length;
            this.received.push({ header, frame });
            for (const handler of this.frameHandlers) handler(socket, header, frame);
        }

        this.buffers.set(socket, buffer.subarray(offset));
    }
}

/** Sends the phase-1 handshake and, once echoed, moves the client to `nextState`. */
function sendHandshake(server: FakeServer, socket: Socket, nextState: ConnectionStateEnum): void {
    server.send(socket, new ConnectionStatePacket({ state: ConnectionStateEnum.HANDSHAKE }).pack());
    server.send(socket, new HandshakePacket({ id: 1, time: 2, delta: 0 }).pack());
    server.onFrame((sock, header) => {
        if (sock !== socket) return;
        if (header === PacketHeaderEnum.HANDSHAKE) {
            server.send(sock, new ConnectionStatePacket({ state: nextState }).pack());
        }
    });
}

export type AuthServerOptions = { username: string; password: string; key?: number };

/** Wires the auth server protocol: handshake -> AUTH -> login request -> success/failure. */
export function wireAuthServer(server: FakeServer, options: AuthServerOptions): FakeServer {
    server.onConnect((socket) => sendHandshake(server, socket, ConnectionStateEnum.AUTH));

    server.onFrame((socket, header, frame) => {
        switch (header) {
            case PacketHeaderEnum.LOGIN_REQUEST: {
                const request = new LoginRequestPacket({ username: '', password: '', key: 0 }).unpack(frame);
                if (request.getUsername() === options.username && request.getPassword() === options.password) {
                    server.send(socket, new LoginSuccessPacket({ key: options.key ?? 0xabcdef, result: 1 }).pack());
                } else {
                    server.send(socket, new LoginFailedPacket({ status: 'WRONGPWD' }).pack());
                }
                break;
            }
            case PacketHeaderEnum.SERVER_STATUS_REQUEST:
                server.send(
                    socket,
                    new ServerStatusPacket({ status: [{ port: 13001, status: 1 }], isSuccess: true }).pack(),
                );
                break;
            default:
                break;
        }
    });

    return server;
}

export type GameCharacter = {
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
    skillGroup: number;
    guildId?: number;
    guildName?: string;
};

export type GameServerOptions = {
    key: number;
    empireId: number;
    characters: GameCharacter[];
    /** When false the server accepts the token request and then ignores it (timeout test). */
    answerToken?: boolean;
    gameTime?: number;
    channel?: number;
};

/** Wires the game server protocol: handshake -> LOGIN -> token -> SELECT -> LOADING -> GAME. */
export function wireGameServer(server: FakeServer, options: GameServerOptions): FakeServer {
    server.onConnect((socket) => sendHandshake(server, socket, ConnectionStateEnum.LOGIN));

    server.onFrame((socket, header, frame) => {
        switch (header) {
            case PacketHeaderEnum.TOKEN: {
                if (options.answerToken === false) break;

                const token = new AuthTokenPacket({ username: '', key: 0, xteaKeys: [] }).unpack(frame);
                if (token.getKey() !== options.key) {
                    // Invalid/expired token: the real server closes without a reply.
                    socket.destroy();
                    break;
                }

                const characters = new CharactersInfoPacket();
                options.characters.slice(0, 4).forEach((character, slot) => {
                    characters.addCharacter(
                        slot,
                        {
                            id: character.id,
                            name: character.name,
                            playerClass: character.playerClass,
                            level: character.level,
                            playTime: character.playTime,
                            st: character.st,
                            ht: character.ht,
                            dx: character.dx,
                            iq: character.iq,
                            bodyPart: character.bodyPart,
                            nameChange: character.nameChange,
                            hairPart: character.hairPart,
                            positionX: character.positionX,
                            positionY: character.positionY,
                            ip: 0,
                            port: 0,
                            skillGroup: character.skillGroup,
                        },
                        character.guildId ?? 0,
                        character.guildName ?? '',
                    );
                });

                server.send(socket, new EmpirePacket({ empireId: options.empireId }).pack());
                server.send(socket, characters.pack());
                server.send(socket, new ConnectionStatePacket({ state: ConnectionStateEnum.SELECT }).pack());
                break;
            }
            case PacketHeaderEnum.SELECT_CHARACTER: {
                server.send(socket, new ConnectionStatePacket({ state: ConnectionStateEnum.LOADING }).pack());
                server.send(
                    socket,
                    new CharacterDetailsPacket({
                        vid: 1,
                        playerClass: 2,
                        playerName: 'Hero',
                        positionX: 10,
                        positionY: 20,
                        positionZ: 0,
                        empireId: options.empireId,
                        skillGroup: 1,
                    }).pack(),
                );
                const points = new CharacterPointsPacket();
                points.addPoint(5, 100);
                server.send(socket, points.pack());
                const skills = Array.from({ length: 255 }, () => ({ rank: 0, level: 0, timeToNextRead: 0 }));
                server.send(socket, new SkillLevelPacket({ skills }).pack());
                break;
            }
            case PacketHeaderEnum.ENTER_GAME: {
                server.send(socket, new ConnectionStatePacket({ state: ConnectionStateEnum.GAME }).pack());
                server.send(socket, new GameTimePacket({ time: options.gameTime ?? 1_700_000_000 }).pack());
                server.send(socket, new ChannelPacket({ channel: options.channel ?? 3 }).pack());
                break;
            }
            case PacketHeaderEnum.SERVER_STATUS_REQUEST:
                server.send(
                    socket,
                    new ServerStatusPacket({ status: [{ port: 13001, status: 1 }], isSuccess: true }).pack(),
                );
                break;
            default:
                break;
        }
    });

    return server;
}

export const TEST_CHARACTER: GameCharacter = {
    id: 100,
    name: 'Hero',
    playerClass: 2,
    level: 30,
    playTime: 120,
    st: 5,
    ht: 6,
    dx: 7,
    iq: 8,
    bodyPart: 1,
    nameChange: 0,
    hairPart: 2,
    positionX: 1000,
    positionY: 2000,
    skillGroup: 1,
    guildId: 9,
    guildName: 'Guild',
};
