/**
 * Typed errors raised by the client library.
 *
 * Every failure path in `src/client` throws one of these instead of a bare
 * `Error`, so callers can branch on `error.code` (a stable, greppable value)
 * rather than on message text. Nothing is swallowed: a coded error either
 * propagates to the caller or is surfaced through the connection's `error`
 * event.
 */

export type ClientErrorCode =
    | 'NOT_CONNECTED'
    | 'ALREADY_CONNECTED'
    | 'CONNECTION_CLOSED'
    | 'TIMEOUT'
    | 'HANDSHAKE_FAILED'
    | 'AUTH_FAILED'
    | 'PROTOCOL'
    | 'INVALID_STATE'
    | 'INVALID_ARGUMENT'
    | 'SERVER_REJECTED';

/** Base class for every error this library throws. */
export class ClientError extends Error {
    readonly code: ClientErrorCode;

    constructor(message: string, code: ClientErrorCode, options?: { cause?: unknown }) {
        super(message, options);
        this.name = new.target.name;
        this.code = code;
    }
}

/** The operation needs a live socket and there is none (or it was closed). */
export class NotConnectedError extends ClientError {
    constructor(message = 'The client is not connected') {
        super(message, 'NOT_CONNECTED');
    }
}

/** `connect()` was called on an already-open connection. */
export class AlreadyConnectedError extends ClientError {
    constructor(message = 'The client is already connected') {
        super(message, 'ALREADY_CONNECTED');
    }
}

/** The socket closed before the awaited operation completed. */
export class ConnectionClosedError extends ClientError {
    constructor(message = 'The connection closed') {
        super(message, 'CONNECTION_CLOSED');
    }
}

/** An awaited server response did not arrive within the timeout. */
export class TimeoutError extends ClientError {
    constructor(message: string) {
        super(message, 'TIMEOUT');
    }
}

/** The server's handshake could not be completed. */
export class HandshakeError extends ClientError {
    constructor(message: string) {
        super(message, 'HANDSHAKE_FAILED');
    }
}

/** Authentication (auth server login, or game server token redemption) failed. */
export class AuthError extends ClientError {
    /** The server's status token when it sent one (e.g. `WRONGPWD`, `ALREADY`), else null. */
    readonly status: string | null;

    constructor(message: string, status: string | null = null, options?: { cause?: unknown }) {
        super(message, 'AUTH_FAILED', options);
        this.status = status;
    }
}

/** The server sent bytes that do not fit the known protocol. */
export class ProtocolError extends ClientError {
    constructor(message: string) {
        super(message, 'PROTOCOL');
    }
}

/** A method was called out of order (e.g. gameplay before entering the world). */
export class InvalidStateError extends ClientError {
    constructor(message: string) {
        super(message, 'INVALID_STATE');
    }
}

/** A command line argument was missing, unknown or malformed. */
export class InvalidArgumentError extends ClientError {
    constructor(message: string) {
        super(message, 'INVALID_ARGUMENT');
    }
}

/** The server refused a request but kept the connection open. */
export class ServerRejectedError extends ClientError {
    readonly reason: unknown;

    constructor(message: string, reason: unknown = null) {
        super(message, 'SERVER_REJECTED');
        this.reason = reason;
    }
}
