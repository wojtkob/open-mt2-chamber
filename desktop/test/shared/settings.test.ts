import { expect } from 'chai';
import {
    cloneSettings,
    DEFAULT_SETTINGS,
    endpointsEqual,
    isValidHost,
    isValidPort,
    normalizeEndpoint,
    normalizeSettings,
} from '../../src/shared/settings';

describe('desktop/shared/settings', () => {
    describe('Settings validation gates', () => {
        it('accepts plain host names and bare IPv4/IPv6', () => {
            expect(isValidHost('127.0.0.1')).to.equal(true);
            expect(isValidHost('localhost')).to.equal(true);
            expect(isValidHost('play.example.com')).to.equal(true);
            expect(isValidHost('  play.example.com ')).to.equal(true);
        });

        it('rejects anything that is not a connectable host', () => {
            expect(isValidHost('')).to.equal(false);
            expect(isValidHost('   ')).to.equal(false);
            expect(isValidHost(null)).to.equal(false);
            expect(isValidHost(42)).to.equal(false);
            expect(isValidHost('host:11002')).to.equal(false);
            expect(isValidHost('host with space')).to.equal(false);
            expect(isValidHost('/etc/passwd')).to.equal(false);
            expect(isValidHost('a'.repeat(254))).to.equal(false);
        });

        it('accepts only whole TCP ports inside 1..65535', () => {
            expect(isValidPort(1)).to.equal(true);
            expect(isValidPort(11002)).to.equal(true);
            expect(isValidPort(65535)).to.equal(true);
            expect(isValidPort(0)).to.equal(false);
            expect(isValidPort(65536)).to.equal(false);
            expect(isValidPort(1.5)).to.equal(false);
            expect(isValidPort('11002')).to.equal(false);
            expect(isValidPort(null)).to.equal(false);
        });
    });

    describe('normalizeEndpoint', () => {
        it('falls back to the fallback endpoint for non-objects', () => {
            expect(normalizeEndpoint(null, { host: 'h', port: 1 })).to.deep.equal({ host: 'h', port: 1 });
            expect(normalizeEndpoint('nope', { host: 'h', port: 1 })).to.deep.equal({ host: 'h', port: 1 });
        });

        it('keeps valid fields and repairs invalid ones individually', () => {
            expect(normalizeEndpoint({ host: 'new.host', port: 999 }, { host: 'old', port: 1 })).to.deep.equal({
                host: 'new.host',
                port: 999,
            });
            expect(normalizeEndpoint({ host: '  trimmed.host  ', port: 0 }, { host: 'old', port: 7 })).to.deep.equal({
                host: 'trimmed.host',
                port: 7,
            });
        });
    });

    describe('normalizeSettings', () => {
        it('produces complete settings from a null / junk input', () => {
            expect(normalizeSettings(null)).to.deep.equal(DEFAULT_SETTINGS);
            expect(normalizeSettings('junk')).to.deep.equal(DEFAULT_SETTINGS);
            expect(normalizeSettings(undefined)).to.deep.equal(DEFAULT_SETTINGS);
        });

        it('drops unknown keys and repairs malformed fields', () => {
            const normalized = normalizeSettings({
                tampered: true,
                endpoints: {
                    auth: { host: 'auth.example.com', port: 11002 },
                    game: { host: 'game.example.com', port: 13001 },
                },
                account: { rememberUsername: true, username: 'Hero' },
                window: { x: 10, y: 20, width: 1280, height: 800, maximized: false, fullscreen: false },
            });
            expect(normalized).to.deep.equal({
                endpoints: {
                    auth: { host: 'auth.example.com', port: 11002 },
                    game: { host: 'game.example.com', port: 13001 },
                },
                account: { rememberUsername: true, username: 'Hero' },
                window: { x: 10, y: 20, width: 1280, height: 800, maximized: false, fullscreen: false },
                logLevel: 'info',
            });
            expect(Object.keys(normalized).sort()).to.deep.equal(['account', 'endpoints', 'logLevel', 'window']);
        });

        it('repairs an invalid host/port pair against the base', () => {
            const base = {
                endpoints: {
                    auth: { host: 'a', port: 1 },
                    game: { host: 'b', port: 2 },
                },
            } as const;
            const normalized = normalizeSettings(
                {
                    endpoints: { auth: { host: 'bad:port', port: 99999 }, game: { host: 'good', port: 2 } },
                },
                normalizeSettings(base),
            );
            expect(normalized.endpoints.auth).to.deep.equal({ host: 'a', port: 1 });
            expect(normalized.endpoints.game).to.deep.equal({ host: 'good', port: 2 });
        });

        it('repairs out-of-range window bounds with the saved defaults and drops a remembered username it cannot remember', () => {
            const normalized = normalizeSettings({
                window: { width: 1, height: 999999, x: -50, y: -50, maximized: true, fullscreen: 'yes' },
                account: { rememberUsername: true, username: '' },
            });
            expect(normalized.window.width).to.equal(1280);
            expect(normalized.window.height).to.equal(800);
            expect(normalized.window.x).to.equal(-50);
            expect(normalized.window.y).to.equal(-50);
            expect(normalized.window.maximized).to.equal(true);
            expect(normalized.window.fullscreen).to.equal(false);
            expect(normalized.account.rememberUsername).to.equal(false);
            expect(normalized.account.username).to.equal('');
        });

        it('never returns the caller-visible default for an ambiguous log level', () => {
            expect(normalizeSettings({ logLevel: 'loud' }).logLevel).to.equal('info');
            expect(normalizeSettings({ logLevel: 'debug' }).logLevel).to.equal('debug');
        });
    });

    describe('endpointsEqual / cloneSettings', () => {
        it('compares auth+game endpoints structurally', () => {
            const a = {
                auth: { host: 'h', port: 1 },
                game: { host: 'g', port: 2 },
            };
            expect(endpointsEqual(a, { ...a })).to.equal(true);
            expect(endpointsEqual(a, { auth: { host: 'h2', port: 1 }, game: { host: 'g', port: 2 } })).to.equal(false);
            expect(endpointsEqual(a, { auth: { host: 'h', port: 3 }, game: { host: 'g', port: 2 } })).to.equal(false);
        });

        it('cloneSettings returns an independent snapshot', () => {
            const clone = cloneSettings(DEFAULT_SETTINGS);
            clone.endpoints.auth.host = 'changed';
            expect(DEFAULT_SETTINGS.endpoints.auth.host).to.equal('127.0.0.1');
            expect(clone).to.not.equal(DEFAULT_SETTINGS);
        });
    });
});
