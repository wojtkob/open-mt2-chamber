import { createConnection, Socket } from 'node:net';
import TypedEventEmitter from '@/client/util/TypedEventEmitter';
import FrameDecoder from '@/client/protocol/serverFrames';
import { AlreadyConnectedError, NotConnectedError, ProtocolError } from '@/client/errors';

/**
 * A thin, framing TCP transport.
 *
 * It owns one `net.Socket`, splits the incoming byte stream into complete
 * server frames (see {@link FrameDecoder}) and re-emits them. Everything above
 * this class works with frames, never with partial chunks.
 */
export type TcpTransportEvents = {
    connect: () => void;
    frame: (frame: Buffer) => void;
    close: (info: { hadError: boolean }) => void;
    error: (error: Error) => void;
};

export default class TcpTransport extends TypedEventEmitter<TcpTransportEvents> {
    private socket: Socket | null = null;
    private readonly decoder = new FrameDecoder();
    private connected = false;

    get isConnected(): boolean {
        return this.connected && this.socket !== null && !this.socket.destroyed;
    }

    get remoteAddress(): string | null {
        if (!this.socket) return null;
        const address = this.socket.remoteAddress;
        const port = this.socket.remotePort;
        return address && port ? `${address}:${port}` : null;
    }

    connect(host: string, port: number, timeoutMs = 10_000): Promise<void> {
        if (this.socket) {
            return Promise.reject(new AlreadyConnectedError());
        }

        return new Promise<void>((resolve, reject) => {
            let settled = false;
            const socket = createConnection({ host, port });
            this.socket = socket;
            socket.setNoDelay(true);

            const timer =
                timeoutMs > 0
                    ? setTimeout(() => {
                          if (settled) return;
                          settled = true;
                          socket.destroy();
                          this.socket = null;
                          reject(new Error(`Timed out connecting to ${host}:${port}`));
                      }, timeoutMs)
                    : null;

            const settle = (action: () => void) => {
                if (settled) return;
                settled = true;
                if (timer) clearTimeout(timer);
                action();
            };

            socket.once('connect', () => {
                this.connected = true;
                settle(() => {
                    this.emit('connect');
                    resolve();
                });
            });

            socket.once('error', (error: Error) => {
                // A pre-connect error is the connect() failure; after that we are
                // already connected and the same event is a runtime error.
                settle(() => reject(error));
                if (this.socket === socket) {
                    this.connected = false;
                }
                this.emit('error', error);
            });

            socket.on('data', (chunk: Buffer) => {
                let frames: Buffer[];
                try {
                    frames = this.decoder.push(chunk);
                } catch (error) {
                    const protocolError =
                        error instanceof ProtocolError
                            ? error
                            : new ProtocolError(`Failed to frame data: ${String(error)}`);
                    this.emit('error', protocolError);
                    socket.destroy();
                    return;
                }
                for (const frame of frames) {
                    this.emit('frame', frame);
                }
            });

            socket.on('close', (hadError: boolean) => {
                this.connected = false;
                if (this.socket === socket) {
                    this.socket = null;
                }
                this.decoder.reset();
                this.emit('close', { hadError });
            });
        });
    }

    write(buffer: Buffer): void {
        if (!this.socket || this.socket.destroyed) {
            throw new NotConnectedError();
        }
        this.socket.write(buffer);
    }

    /** Flush pending writes and close, waiting for the FIN handshake. */
    end(): Promise<void> {
        const socket = this.socket;
        if (!socket || socket.destroyed) {
            return Promise.resolve();
        }
        return new Promise<void>((resolve) => {
            socket.end(() => resolve());
        });
    }

    /** Drop the connection immediately. */
    destroy(): void {
        this.socket?.destroy();
    }
}
