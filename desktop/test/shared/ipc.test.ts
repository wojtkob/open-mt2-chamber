import { expect } from 'chai';
import { parseFullscreenFlag, parseSaveSettingsAction } from '../../src/shared/ipc';

const VALID_ACTION = {
    endpoints: {
        auth: { host: 'auth.example.com', port: 11002 },
        game: { host: 'game.example.com', port: 13001 },
    },
    account: { rememberUsername: true, username: 'Hero' },
};

describe('desktop/shared/ipc', () => {
    describe('parseSaveSettingsAction', () => {
        it('accepts a well-formed action', () => {
            const parsed = parseSaveSettingsAction(VALID_ACTION);
            expect(parsed.ok).to.equal(true);
            expect(parsed.ok && parsed.value).to.deep.equal(VALID_ACTION);
        });

        it('rejects non-objects and missing endpoints', () => {
            expect(parseSaveSettingsAction(null).ok).to.equal(false);
            expect(parseSaveSettingsAction('nope').ok).to.equal(false);
            expect(parseSaveSettingsAction({}).ok).to.equal(false);
            expect(parseSaveSettingsAction({ endpoints: null }).ok).to.equal(false);
        });

        it('rejects malformed hosts and ports individually', () => {
            expect(
                parseSaveSettingsAction({
                    endpoints: { auth: { host: 'bad host', port: 1 }, game: { host: 'g', port: 2 } },
                }).ok,
            ).to.equal(false);
            expect(
                parseSaveSettingsAction({
                    endpoints: { auth: { host: 'h', port: 65536 }, game: { host: 'g', port: 2 } },
                }).ok,
            ).to.equal(false);
            expect(
                parseSaveSettingsAction({
                    endpoints: { auth: { host: 'h', port: 1 }, game: { host: 'g', port: 0 } },
                }).ok,
            ).to.equal(false);
        });

        it('requires a username when remembering it', () => {
            const action = {
                endpoints: {
                    auth: { host: 'h', port: 1 },
                    game: { host: 'g', port: 2 },
                },
                account: { rememberUsername: true, username: '  ' },
            };
            expect(parseSaveSettingsAction(action).ok).to.equal(false);
        });

        it('trims hosts and caps the remembered username length', () => {
            const parsed = parseSaveSettingsAction({
                endpoints: {
                    auth: { host: '  trimmed.example.com  ', port: 11002 },
                    game: { host: 'game.example.com', port: 13001 },
                },
                account: { rememberUsername: true, username: 'x'.repeat(500) },
            });
            expect(parsed.ok).to.equal(true);
            if (parsed.ok) {
                expect(parsed.value.endpoints.auth.host).to.equal('trimmed.example.com');
                expect(parsed.value.account.username).to.have.lengthOf(32);
            }
        });
    });

    describe('parseFullscreenFlag', () => {
        it('accepts booleans and undefined', () => {
            expect(parseFullscreenFlag(true).ok).to.equal(true);
            expect(parseFullscreenFlag(false).ok).to.equal(true);
            expect(parseFullscreenFlag(undefined).ok).to.equal(true);
        });

        it('rejects anything else', () => {
            expect(parseFullscreenFlag('yes').ok).to.equal(false);
            expect(parseFullscreenFlag(1).ok).to.equal(false);
            expect(parseFullscreenFlag(null).ok).to.equal(false);
        });
    });
});
