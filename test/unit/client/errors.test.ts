import { expect } from 'chai';
import {
    AlreadyConnectedError,
    AuthError,
    ClientError,
    ConnectionClosedError,
    HandshakeError,
    InvalidArgumentError,
    InvalidStateError,
    NotConnectedError,
    ProtocolError,
    ServerRejectedError,
    TimeoutError,
} from '@/client/errors';

describe('client errors', () => {
    it('gives every error a stable code and class name', () => {
        expect(new NotConnectedError().code).to.equal('NOT_CONNECTED');
        expect(new AlreadyConnectedError().code).to.equal('ALREADY_CONNECTED');
        expect(new ConnectionClosedError().code).to.equal('CONNECTION_CLOSED');
        expect(new TimeoutError('late').code).to.equal('TIMEOUT');
        expect(new HandshakeError('bad').code).to.equal('HANDSHAKE_FAILED');
        expect(new AuthError('no').code).to.equal('AUTH_FAILED');
        expect(new ProtocolError('bad bytes').code).to.equal('PROTOCOL');
        expect(new InvalidStateError('out of order').code).to.equal('INVALID_STATE');
        expect(new InvalidArgumentError('bad flag').code).to.equal('INVALID_ARGUMENT');
        expect(new ServerRejectedError('nope').code).to.equal('SERVER_REJECTED');
    });

    it('sets the name from the concrete class, not the base', () => {
        expect(new NotConnectedError().name).to.equal('NotConnectedError');
        expect(new TimeoutError('late').name).to.equal('TimeoutError');
        expect(new AuthError('no').name).to.equal('AuthError');
    });

    it('keeps the message and is an instanceof ClientError and Error', () => {
        const error = new ProtocolError('bad bytes');
        expect(error.message).to.equal('bad bytes');
        expect(error).to.be.instanceOf(ClientError);
        expect(error).to.be.instanceOf(Error);
    });

    it('carries the auth status when the server sent one', () => {
        expect(new AuthError('rejected', 'WRONGPWD').status).to.equal('WRONGPWD');
        expect(new AuthError('closed').status).to.equal(null);
    });

    it('carries the rejection reason', () => {
        expect(new ServerRejectedError('nope', { reason: 3 }).reason).to.deep.equal({ reason: 3 });
        expect(new ServerRejectedError('nope').reason).to.equal(null);
    });

    it('preserves the cause option', () => {
        const cause = new Error('root');
        const error = new ClientError('wrapped', 'PROTOCOL', { cause });
        expect(error.cause).to.equal(cause);
    });
});
