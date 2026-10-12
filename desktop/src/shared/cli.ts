/**
 * Command-line arguments accepted by the desktop client. Pure (no `electron`
 * import) so the root unit tests can exercise the parser directly.
 *
 * The client is a normal Electron app first: when it is launched with no
 * flags it reads the persisted settings. The flags below are conveniences for
 * power users and for CI smoke tests:
 *
 *   --host <host>            server host, applied to both auth and game
 *   --auth-host <host>       auth server host (overrides --host)
 *   --auth-port <port>       auth server port (default 11002)
 *   --game-host <host>       game server host (overrides --host)
 *   --game-port <port>       game server port (default 13001)
 *   --account <name>         username the login form pre-fills
 *   --log-level <level>      error | warn | info | debug (default info)
 *   --user-data-dir <dir>    override the Electron user-data directory
 *   --static-dir <dir>       serve the SPA from <dir> instead of the bundled copy
 *   --dev-tools              open the developer tools on launch
 *   --no-single-instance     allow more than one client process
 *   -h | --help              print usage and exit without launching the UI
 *
 * Anything after a `--` separator is ignored (Electron/Chromium switch
 * passthrough, e.g. `--disable-gpu`), keeping this parser focused on the
 * options this application owns.
 */

import { DEFAULT_ENDPOINTS, isLogLevel, type DesktopLogLevel } from './settings';

export type DesktopCliArgs = {
    authHost: string;
    authPort: number;
    gameHost: string;
    gamePort: number;
    account: string | null;
    logLevel: DesktopLogLevel | null;
    userDataDir: string | null;
    staticDir: string | null;
    devTools: boolean;
    singleInstance: boolean;
    help: boolean;
    /** True when at least one `--host`/`--auth-*`/`--game-*` flag was given. */
    endpointsExplicit: boolean;
};

export const DEFAULT_CLI_ARGS: DesktopCliArgs = {
    authHost: DEFAULT_ENDPOINTS.auth.host,
    authPort: DEFAULT_ENDPOINTS.auth.port,
    gameHost: DEFAULT_ENDPOINTS.game.host,
    gamePort: DEFAULT_ENDPOINTS.game.port,
    account: null,
    logLevel: null,
    userDataDir: null,
    staticDir: null,
    devTools: false,
    singleInstance: true,
    help: false,
    endpointsExplicit: false,
};

export const CLI_USAGE = [
    'Usage: OpenMT2 [options]',
    '',
    '  --host <host>          server host, applied to both auth and game',
    '  --auth-host <host>     auth server host (overrides --host)',
    '  --auth-port <port>     auth server port (default 11002)',
    '  --game-host <host>     game server host (overrides --host)',
    '  --game-port <port>     game server port (default 13001)',
    '  --account <name>       username the login form pre-fills',
    '  --log-level <level>    error | warn | info | debug',
    '  --user-data-dir <dir>  override the Electron user-data directory',
    '  --static-dir <dir>     serve the SPA from <dir> instead of the bundled copy',
    '  --dev-tools            open the developer tools on launch',
    '  --no-single-instance   allow more than one client process',
    '  -h | --help            print this help and exit',
    '',
    'Everything after a "--" separator is passed through to Chromium.',
].join('\n');

/** Validate a port the CLI accepted (1..65535); throws on invalid values. */
export function parsePortFlag(value: string, flag: string): number {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
        throw new Error(`Invalid value for ${flag}: expected a TCP port (1..65535), got ${JSON.stringify(value)}`);
    }
    return parsed;
}

export function parseCliArgs(argv: readonly string[]): DesktopCliArgs {
    const args: DesktopCliArgs = { ...DEFAULT_CLI_ARGS };
    let hostOverride: string | null = null;
    let authHostExplicit = false;
    let gameHostExplicit = false;

    const takeValue = (index: number, flag: string): [string, number] => {
        if (index + 1 >= argv.length) {
            throw new Error(`Missing value for ${flag}`);
        }
        return [argv[index + 1], index + 1];
    };

    const flagAcceptsValue = (flag: string): boolean =>
        flag === '--host' ||
        flag === '--auth-host' ||
        flag === '--auth-port' ||
        flag === '--game-host' ||
        flag === '--game-port';

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === '--') {
            break; // Chromium switch passthrough: everything after this is out of scope.
        }
        if (flagAcceptsValue(arg) || arg === '--account' || arg === '--log-level') {
            if (flagAcceptsValue(arg)) args.endpointsExplicit = true;
        }
        switch (arg) {
            case '-h':
            case '--help':
                args.help = true;
                break;
            case '--host': {
                const [value, next] = takeValue(index, arg);
                hostOverride = value;
                index = next;
                break;
            }
            case '--auth-host': {
                const [value, next] = takeValue(index, arg);
                args.authHost = value;
                authHostExplicit = true;
                index = next;
                break;
            }
            case '--auth-port': {
                const [value, next] = takeValue(index, arg);
                args.authPort = parsePortFlag(value, arg);
                index = next;
                break;
            }
            case '--game-host': {
                const [value, next] = takeValue(index, arg);
                args.gameHost = value;
                gameHostExplicit = true;
                index = next;
                break;
            }
            case '--game-port': {
                const [value, next] = takeValue(index, arg);
                args.gamePort = parsePortFlag(value, arg);
                index = next;
                break;
            }
            case '--account': {
                const [value, next] = takeValue(index, arg);
                args.account = value.trim();
                index = next;
                break;
            }
            case '--log-level': {
                const [value, next] = takeValue(index, arg);
                if (!isLogLevel(value)) {
                    throw new Error(
                        `Invalid value for --log-level: expected one of error, warn, info, debug; got ${JSON.stringify(value)}`,
                    );
                }
                args.logLevel = value;
                index = next;
                break;
            }
            case '--user-data-dir': {
                const [value, next] = takeValue(index, arg);
                args.userDataDir = value;
                index = next;
                break;
            }
            case '--static-dir': {
                const [value, next] = takeValue(index, arg);
                args.staticDir = value;
                index = next;
                break;
            }
            case '--dev-tools':
                args.devTools = true;
                break;
            case '--no-single-instance':
                args.singleInstance = false;
                break;
            default:
                if (arg.startsWith('/') || arg.startsWith('-')) {
                    // Unknown switches (including Chromium's) do not abort the
                    // launch; the app simply ignores them. This keeps the client
                    // resilient to extra flags injected by shortcuts/launchers.
                    break;
                }
                throw new Error(`Unexpected positional argument: ${JSON.stringify(arg)}`);
        }
    }

    if (hostOverride !== null) {
        // `--host` fills in whichever of the two endpoints was not given a
        // dedicated `--auth-host`/`--game-host`, so dedicated flags always win
        // regardless of the order they appeared in.
        if (!authHostExplicit) args.authHost = hostOverride;
        if (!gameHostExplicit) args.gameHost = hostOverride;
    }

    return args;
}
