import { ConnectionStateEnum } from '@/core/enum/ConnectionStateEnum';
import ClientConnection from '@/client/ClientConnection';
import ClientPacketWriter from '@/client/protocol/ClientPacketWriter';
import { AuthError } from '@/client/errors';
import { LoginSuccessServerPacket, ServerPacket } from '@/client/protocol/ServerPackets';

/** The auth server's reply to a successful `CG_LOGIN_REQUEST`. */
export type LoginResult = {
    /** Token the client echoes back to the game server on `CG_TOKEN`. */
    key: number;
    /** The server's result byte; 1 means success. */
    result: number;
};

export type AuthEndpoint = { host: string; port: number; timeoutMs?: number };

/**
 * Client for the *auth* server (port `AUTH_SERVER_PORT`, default 11002).
 *
 * Lifecycle: {@link connect} completes the handshake and leaves the connection
 * in the `AUTH` state, then {@link login} exchanges credentials for a one-time
 * key the game server accepts. The same connection can retry `login` after a
 * wrong password because the auth server keeps it open on `LOGIN_FAILED`.
 */
export default class AuthClient extends ClientConnection {
    private loginSuccess: LoginSuccessServerPacket | null = null;

    protected onServerPacket(packet: ServerPacket): void {
        if (packet.type === 'loginSuccess') {
            this.loginSuccess = packet;
        }
    }

    /** Open the socket and complete the handshake (leaves the state at `AUTH`). */
    async connect(host: string, port: number, timeoutMs = 10_000): Promise<void> {
        await super.connect(host, port, timeoutMs);
        await this.waitForState(ConnectionStateEnum.AUTH, timeoutMs);
    }

    /**
     * Exchange credentials for a login key.
     *
     * @throws AuthError when the server answers `LOGIN_FAILED` (its `status` is
     *   on the error) or closes the connection before answering.
     */
    async login(username: string, password: string, timeoutMs = 10_000): Promise<LoginResult> {
        this.loginSuccess = null;
        this.clearLoginFailure();

        const outcome = this.waitUntil(
            () => {
                if (this.loginSuccess) return { kind: 'ok' as const, packet: this.loginSuccess };
                if (this.loginFailure) return { kind: 'failed' as const, status: this.loginFailure.status };
                return undefined;
            },
            { timeoutMs, timeoutMessage: 'Timed out waiting for the auth server to answer the login request' },
        );

        this.send(ClientPacketWriter.loginRequest({ username, password }));

        const answer = await outcome;
        if (answer.kind === 'failed') {
            throw new AuthError(`The auth server rejected the login (${answer.status})`, answer.status);
        }

        return { key: answer.packet.key, result: answer.packet.result };
    }
}
