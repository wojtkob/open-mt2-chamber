import { expect } from 'chai';
import { DEFAULT_CLI_ARGS, parseCliArgs, parsePortFlag } from '../../src/shared/cli';

describe('desktop/shared/cli', () => {
    it('returns defaults for an empty argv', () => {
        expect(parseCliArgs([])).to.deep.equal(DEFAULT_CLI_ARGS);
    });

    it('maps host/auth/game flags onto endpoints and marks them explicit', () => {
        const args = parseCliArgs(['--host', 'play.example.com', '--auth-port', '2001', '--game-port', '3001']);
        expect(args.authHost).to.equal('play.example.com');
        expect(args.gameHost).to.equal('play.example.com');
        expect(args.authPort).to.equal(2001);
        expect(args.gamePort).to.equal(3001);
        expect(args.endpointsExplicit).to.equal(true);
    });

    it('lets dedicated auth/game flags override --host', () => {
        const args = parseCliArgs([
            '--host',
            'common.example.com',
            '--auth-host',
            'auth.example.com',
            '--game-host',
            'game.example.com',
        ]);
        expect(args.authHost).to.equal('auth.example.com');
        expect(args.gameHost).to.equal('game.example.com');
    });

    it('parses account, log level, static/user-data dirs and dev-tools', () => {
        const args = parseCliArgs([
            '--account',
            '  Hero  ',
            '--log-level',
            'debug',
            '--static-dir',
            'C:\\spa',
            '--user-data-dir',
            'D:\\profile',
            '--dev-tools',
        ]);
        expect(args.account).to.equal('Hero');
        expect(args.logLevel).to.equal('debug');
        expect(args.staticDir).to.equal('C:\\spa');
        expect(args.userDataDir).to.equal('D:\\profile');
        expect(args.devTools).to.equal(true);
        expect(args.endpointsExplicit).to.equal(false);
    });

    it('supports --no-single-instance and --help', () => {
        const args = parseCliArgs(['--no-single-instance', '--help']);
        expect(args.singleInstance).to.equal(false);
        expect(args.help).to.equal(true);
    });

    it('stops parsing at the -- separator (Chromium passthrough)', () => {
        const args = parseCliArgs(['--host', 'server.test', '--', '--host=evil']);
        expect(args.authHost).to.equal('server.test');
        const afterSeparator = parseCliArgs(['--', 'stray positional']);
        expect(afterSeparator).to.deep.equal(DEFAULT_CLI_ARGS);
    });

    it('ignores unknown dash switches so launchers can inject Chromium flags', () => {
        expect(parseCliArgs(['--disable-gpu', '--no-sandbox', '--log-level', 'info']).authPort).to.equal(11002);
    });

    it('throws on bad port values and missing flag values', () => {
        expect(() => parseCliArgs(['--auth-port', '70000'])).to.throw(/expected a TCP port/);
        expect(() => parseCliArgs(['--auth-port'])).to.throw(/Missing value for --auth-port/);
        expect(() => parseCliArgs(['--log-level', 'verbose'])).to.throw(/Invalid value for --log-level/);
        expect(() => parseCliArgs(['positional'])).to.throw(/Unexpected positional argument/);
    });

    it('parsePortFlag accepts the port bounds exactly', () => {
        expect(parsePortFlag('1', '--x')).to.equal(1);
        expect(parsePortFlag('65535', '--x')).to.equal(65535);
        expect(() => parsePortFlag('0', '--x')).to.throw();
        expect(() => parsePortFlag('65536', '--x')).to.throw();
        expect(() => parsePortFlag('12.5', '--x')).to.throw();
    });
});
