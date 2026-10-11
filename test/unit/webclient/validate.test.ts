import { expect } from 'chai';
import { SessionError } from '@/webclient/session/VisualSession';
import { parseChatRequest, parseLoginRequest, parseSelectRequest, parseVerbRequest } from '@/webclient/validate';

function expectInvalid(fn: () => unknown, fragment: string): void {
    try {
        fn();
        expect.fail('expected the parser to reject the body');
    } catch (error) {
        expect(error).to.be.instanceOf(SessionError);
        expect((error as SessionError).code).to.equal('INVALID_ARGUMENT');
        expect((error as SessionError).message).to.contain(fragment);
    }
}

describe('webclient validate', () => {
    describe('parseLoginRequest', () => {
        it('accepts a minimal body and leaves the optional endpoints undefined', () => {
            const request = parseLoginRequest({ username: 'admin', password: 'admin' });
            expect(request).to.deep.equal({
                username: 'admin',
                password: 'admin',
                authHost: undefined,
                authPort: undefined,
                gameHost: undefined,
                gamePort: undefined,
                host: undefined,
                port: undefined,
                timeoutMs: undefined,
            });
        });

        it('accepts overrides and validates the port range', () => {
            const request = parseLoginRequest({
                username: 'admin',
                password: '',
                authPort: 11002,
                gamePort: 13001,
                timeoutMs: 500,
            });
            expect(request.authPort).to.equal(11002);
            expect(request.gamePort).to.equal(13001);
            expect(request.timeoutMs).to.equal(500);
        });

        it('rejects a non-object body', () => {
            expectInvalid(() => parseLoginRequest([]), 'JSON object');
            expectInvalid(() => parseLoginRequest(null), 'JSON object');
            expectInvalid(() => parseLoginRequest('admin'), 'JSON object');
        });

        it('rejects a missing or blank username', () => {
            expectInvalid(() => parseLoginRequest({ password: 'admin' }), 'username');
            expectInvalid(() => parseLoginRequest({ username: '   ', password: 'admin' }), 'not be blank');
        });

        it('rejects a non-string password', () => {
            expectInvalid(() => parseLoginRequest({ username: 'admin', password: 42 }), 'password');
        });

        it('rejects an out-of-range port', () => {
            expectInvalid(() => parseLoginRequest({ username: 'admin', password: 'x', authPort: 0 }), 'valid TCP port');
            expectInvalid(
                () => parseLoginRequest({ username: 'admin', password: 'x', gamePort: 70_000 }),
                'valid TCP port',
            );
        });

        it('rejects a non-integer timeout', () => {
            expectInvalid(() => parseLoginRequest({ username: 'admin', password: 'x', timeoutMs: 1.5 }), 'integer');
        });
    });

    describe('parseSelectRequest', () => {
        it('accepts slots 0..3', () => {
            expect(parseSelectRequest({ slot: 0 })).to.deep.equal({ slot: 0 });
            expect(parseSelectRequest({ slot: 3 })).to.deep.equal({ slot: 3 });
        });

        it('rejects out-of-range and non-integer slots', () => {
            expectInvalid(() => parseSelectRequest({ slot: 4 }), 'between 0 and 3');
            expectInvalid(() => parseSelectRequest({ slot: -1 }), 'between 0 and 3');
            expectInvalid(() => parseSelectRequest({ slot: '0' }), 'integer');
        });
    });

    describe('parseChatRequest', () => {
        it('trims the message and keeps the optional type', () => {
            expect(parseChatRequest({ message: '  hello  ' })).to.deep.equal({
                message: 'hello',
                messageType: undefined,
            });
            expect(parseChatRequest({ message: 'hi', messageType: 1 })).to.deep.equal({
                message: 'hi',
                messageType: 1,
            });
        });

        it('rejects a blank message', () => {
            expectInvalid(() => parseChatRequest({ message: '   ' }), 'not be blank');
            expectInvalid(() => parseChatRequest({}), 'message');
        });
    });

    describe('parseVerbRequest', () => {
        it('parses a move verb', () => {
            expect(
                parseVerbRequest({
                    verb: 'move',
                    movementType: 1,
                    arg: 2,
                    rotation: 3,
                    positionX: 10,
                    positionY: 20,
                    time: 99,
                }),
            ).to.deep.equal({
                verb: 'move',
                movementType: 1,
                arg: 2,
                rotation: 3,
                positionX: 10,
                positionY: 20,
                time: 99,
            });
        });

        it('parses a target verb', () => {
            expect(parseVerbRequest({ verb: 'target', targetVirtualId: 42 })).to.deep.equal({
                verb: 'target',
                targetVirtualId: 42,
            });
        });

        it('parses an attack verb with and without the skill vnum', () => {
            expect(parseVerbRequest({ verb: 'attack', victimVirtualId: 7 })).to.deep.equal({
                verb: 'attack',
                skillVnum: undefined,
                victimVirtualId: 7,
            });
            expect(parseVerbRequest({ verb: 'attack', skillVnum: 4, victimVirtualId: 7 })).to.deep.equal({
                verb: 'attack',
                skillVnum: 4,
                victimVirtualId: 7,
            });
        });

        it('parses a closeShop verb with no fields', () => {
            expect(parseVerbRequest({ verb: 'closeShop' })).to.deep.equal({ verb: 'closeShop' });
        });

        it('rejects an unknown verb', () => {
            expectInvalid(() => parseVerbRequest({ verb: 'teleport' }), "Unknown verb 'teleport'");
        });

        it('rejects a missing required field', () => {
            expectInvalid(() => parseVerbRequest({ verb: 'target' }), 'targetVirtualId');
        });
    });
});
