import { ConnectionStateEnum } from '@/core/enum/ConnectionStateEnum';
import TcpTransport from '@/client/transport/TcpTransport';
import TypedEventEmitter from '@/client/util/TypedEventEmitter';
import ClientPacketWriter from '@/client/protocol/ClientPacketWriter';
import { parseServerPacket, ServerPacket, ServerStatusServerPacket } from '@/client/protocol/ServerPackets';
import { ConnectionClosedError, NotConnectedError, ProtocolError, TimeoutError } from '@/client/errors';

/**
 * One protocol connection to an auth or game server.
 *
 * It owns the handshake (echoing the server's id/time/delta until the server
 * moves the connection to the next phase), the keepalive (replying `CG_PONG` to
 * every `GC_PING`) and packet decoding. Subclasses (AuthClient, GameClient) add
 * the request/response verbs; this class only models the connection itself.
 */
export type ClientConnectionEvents = {
    state: (state: ConnectionStateEnum) => void;
    packet: (packet: ServerPacket) => void;
    close: (info: { hadError: boolean }) => void;
    error: (error: Error) => void;
};

export default abstract class ClientConnection extends TypedEventEmitter<ClientConnectionEvents> {
    protected readonly transport: TcpTransport;

    private state = ConnectionStateEnum.CLOSE;
    private closed = false;
    private lastLoginFailure: { status: string } | null = null;
    private lastServerStatus: ServerStatusServerPacket | null = null;
    private readonly history: ServerPacket[] = [];

    constructor() {
        super();
        this.transport = new TcpTransport();
        this.transport.on('frame', (frame) => this.handleFrame(frame));
        this.transport.on('close', (info) => this.onTransportClose(info));
        this.transport.on('error', (error) => this.emit('error', error));
    }

    getState(): ConnectionStateEnum {
        return this.state;
    }

    get isConnected(): boolean {
        return this.transport.isConnected;
    }

    get isClosed(): boolean {
        return this.closed;
    }

    /** The last `LOGIN_FAILED` status the server sent on this connection, if any. */
    get loginFailure(): { status: string } | null {
        return this.lastLoginFailure;
    }

    /** Forget a `LOGIN_FAILED` so a later attempt is not answered from stale state. */
    protected clearLoginFailure(): void {
        this.lastLoginFailure = null;
    }

    async connect(host: string, port: number, timeoutMs = 10_000): Promise<void> {
        await this.transport.connect(host, port, timeoutMs);
    }

    async close(): Promise<void> {
        await this.transport.end();
    }

    /**
     * Ask the server for its channel list and status (CG_SERVER_STATUS_REQUEST).
     * Allowed from the handshake onward on both the auth and game connections.
     */
    async requestServerStatus(timeoutMs = 10_000): Promise<ServerStatusServerPacket> {
        this.lastServerStatus = null;
        const pending = this.waitUntil(() => this.lastServerStatus ?? undefined, {
            timeoutMs,
            timeoutMessage: 'Timed out waiting for the server status',
        });
        this.send(ClientPacketWriter.serverStatusRequest());
        return pending;
    }

    destroy(): void {
        this.transport.destroy();
    }

    protected send(frame: Buffer): void {
        if (!this.transport.isConnected) {
            throw new NotConnectedError();
        }
        this.transport.write(frame);
    }

    /** Hook for subclasses to observe every decoded packet before the `packet` event. */
    protected onServerPacket(_packet: ServerPacket): void {
        void _packet;
    }

    /**
     * Resolves with the first value `evaluate` returns (anything but `undefined`),
     * re-checking on every packet, state change and closure. It is race-free with
     * events that already happened: `evaluate` runs once immediately.
     */
    protected waitUntil<T>(
        evaluate: () => T | undefined,
        { timeoutMs, timeoutMessage }: { timeoutMs: number; timeoutMessage: string },
    ): Promise<T> {
        const immediate = evaluate();
        if (immediate !== undefined) return Promise.resolve(immediate);

        return new Promise<T>((resolve, reject) => {
            const cleanup = () => {
                clearTimeout(timer);
                this.off('packet', check);
                this.off('state', check);
                this.off('close', onClose);
            };

            const timer = setTimeout(() => {
                cleanup();
                reject(new TimeoutError(timeoutMessage));
            }, timeoutMs);

            const check = () => {
                const value = evaluate();
                if (value !== undefined) {
                    cleanup();
                    resolve(value);
                }
            };

            const onClose = () => {
                const value = evaluate();
                cleanup();
                if (value !== undefined) {
                    resolve(value);
                } else {
                    reject(new ConnectionClosedError());
                }
            };

            this.on('packet', check);
            this.on('state', check);
            this.on('close', onClose);
        });
    }

    protected waitForState(state: ConnectionStateEnum, timeoutMs = 10_000): Promise<void> {
        return this.waitUntil(() => (this.state === state ? true : undefined), {
            timeoutMs,
            timeoutMessage: `Timed out waiting for connection state ${state}`,
        }).then(() => undefined);
    }

    /** Resolves with the first packet of `type` already seen or seen next. */
    protected waitForPacket<T extends ServerPacket['type']>(
        type: T,
        timeoutMs = 10_000,
        predicate?: (packet: Extract<ServerPacket, { type: T }>) => boolean,
    ): Promise<Extract<ServerPacket, { type: T }>> {
        return this.waitUntil(
            () => {
                for (const packet of this.history) {
                    if (packet.type !== type) continue;
                    const typed = packet as Extract<ServerPacket, { type: T }>;
                    if (!predicate || predicate(typed)) return typed;
                }
                return undefined;
            },
            { timeoutMs, timeoutMessage: `Timed out waiting for server packet '${type}'` },
        );
    }

    private handleFrame(frame: Buffer): void {
        let packet: ServerPacket;
        try {
            packet = parseServerPacket(frame);
        } catch (error) {
            const protocolError =
                error instanceof ProtocolError
                    ? error
                    : new ProtocolError(`Failed to decode server frame: ${String(error)}`);
            this.emit('error', protocolError);
            this.transport.destroy();
            return;
        }

        try {
            switch (packet.type) {
                case 'handshake':
                    this.send(ClientPacketWriter.handshake({ id: packet.id, time: packet.time, delta: packet.delta }));
                    break;
                case 'connectionState':
                    this.setState(packet.state);
                    break;
                case 'ping':
                    this.send(ClientPacketWriter.pong());
                    break;
                case 'loginFailed':
                    this.lastLoginFailure = { status: packet.status };
                    break;
                case 'serverStatus':
                    this.lastServerStatus = packet;
                    break;
                default:
                    break;
            }
        } catch (error) {
            this.emit('error', error instanceof Error ? error : new Error(String(error)));
        }

        this.history.push(packet);
        if (this.history.length > 256) {
            this.history.shift();
        }

        this.onServerPacket(packet);
        this.emit('packet', packet);
    }

    private setState(state: ConnectionStateEnum): void {
        if (this.state === state) return;
        this.state = state;
        this.emit('state', state);
    }

    private onTransportClose(info: { hadError: boolean }): void {
        if (this.closed) return;
        this.closed = true;
        this.setState(ConnectionStateEnum.CLOSE);
        this.emit('close', info);
    }
}
