#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import Metin2Client, { DEFAULT_AUTH_PORT, DEFAULT_GAME_PORT } from './Metin2Client';
import type { CharacterSummary } from './protocol/ServerPackets';
import { ClientError, InvalidArgumentError } from './errors';

/**
 * Command line client for an open-mt2 server.
 *
 * ```sh
 * npm run client -- login        # full auth flow, prints the character list
 * npm run client -- play -m "hi" # login + select + enter, send a chat line
 * npm run client -- status       # ask the auth server for its channel status
 * ```
 *
 * Connection settings come from flags, `CLIENT_*` env vars, the server env vars
 * (`AUTH_SERVER_PORT`, `GAME_SERVER_PORT`, `REAL_SERVER_ADDRESS`) or defaults.
 */

type CliOptions = {
    command: string;
    authHost: string | null;
    authPort: number | null;
    gameHost: string | null;
    gamePort: number | null;
    username: string | null;
    password: string | null;
    slot: number | null;
    message: string | null;
    seconds: number;
    json: boolean;
    help: boolean;
};

const USAGE = `open-mt2 client

Usage:
  npm run client -- <command> [options]

Commands:
  status   Query the auth server for its channel status.
  login    Authenticate (auth server) and redeem the token (game server).
  play     login, select a character, enter the game and stay connected.

Options:
  --auth-host <host>       Auth server host        (env CLIENT_AUTH_HOST)
  --auth-port <port>       Auth server port        (env AUTH_SERVER_PORT, default ${DEFAULT_AUTH_PORT})
  --game-host <host>       Game server host        (env CLIENT_GAME_HOST / REAL_SERVER_ADDRESS)
  --game-port <port>       Game server port        (env GAME_SERVER_PORT, default ${DEFAULT_GAME_PORT})
  -u, --username <name>    Account name            (env CLIENT_USERNAME, default admin)
  -p, --password <pass>    Account password        (env CLIENT_PASSWORD)
  -s, --slot <n>           Character slot for play (default: first occupied)
  -m, --message <text>     Chat line to send after entering the game
      --seconds <n>        How long play stays connected (default 30)
      --json               Machine-readable JSON output
  -h, --help               Show this help
`;

const BOOLEAN_FLAGS = new Set(['--json', '-h', '--help']);

const VALUE_FLAGS = new Set([
    '--auth-host',
    '--auth-port',
    '--game-host',
    '--game-port',
    '--username',
    '-u',
    '--password',
    '-p',
    '--slot',
    '-s',
    '--message',
    '-m',
    '--seconds',
]);

export function parseArgs(argv: string[]): CliOptions {
    const options: CliOptions = {
        command: '',
        authHost: null,
        authPort: null,
        gameHost: null,
        gamePort: null,
        username: null,
        password: null,
        slot: null,
        message: null,
        seconds: 30,
        json: false,
        help: false,
    };

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg.startsWith('-') && !/^-\d+$/.test(arg)) {
            if (BOOLEAN_FLAGS.has(arg)) {
                if (arg === '--json') options.json = true;
                if (arg === '-h' || arg === '--help') options.help = true;
                continue;
            }
            if (!VALUE_FLAGS.has(arg)) {
                throw new InvalidArgumentError(`Unknown option: ${arg}`);
            }
            const value = argv[++i];
            if (value === undefined) {
                throw new InvalidArgumentError(`Missing value for ${arg}`);
            }
            switch (arg) {
                case '--auth-host':
                    options.authHost = value;
                    break;
                case '--auth-port':
                    options.authPort = parsePort(arg, value);
                    break;
                case '--game-host':
                    options.gameHost = value;
                    break;
                case '--game-port':
                    options.gamePort = parsePort(arg, value);
                    break;
                case '--username':
                case '-u':
                    options.username = value;
                    break;
                case '--password':
                case '-p':
                    options.password = value;
                    break;
                case '--slot':
                case '-s':
                    options.slot = parsePort(arg, value);
                    break;
                case '--message':
                case '-m':
                    options.message = value;
                    break;
                case '--seconds':
                    options.seconds = parsePort(arg, value);
                    break;
                default:
                    throw new InvalidArgumentError(`Unknown option: ${arg}`);
            }
        } else if (options.command === '') {
            options.command = arg;
        } else {
            throw new InvalidArgumentError(`Unexpected argument: ${arg}`);
        }
    }

    return options;
}

function parsePort(flag: string, value: string): number {
    const numeric = Number(value);
    if (!Number.isInteger(numeric) || numeric < 0) {
        throw new InvalidArgumentError(`Invalid number for ${flag}: ${value}`);
    }
    return numeric;
}

/**
 * Pick the character slot to enter the world with.
 *
 * `requestedSlot` is the explicit `--slot` value, or `null` to fall back to the
 * first occupied slot. Throws an {@link InvalidArgumentError} when the account
 * has no characters to play, or when the requested slot is empty.
 */
export function resolveCharacterSlot(characters: readonly CharacterSummary[], requestedSlot: number | null): number {
    if (requestedSlot === null) {
        if (characters.length === 0) {
            throw new InvalidArgumentError('This account has no characters to play; create one first (or pass --slot)');
        }
        return characters[0].slot;
    }

    if (!characters.some((character) => character.slot === requestedSlot)) {
        throw new InvalidArgumentError(`No character on slot ${requestedSlot}`);
    }
    return requestedSlot;
}

/** Minimal .env reader so the CLI works without `--env-file`. Existing keys win. */
function loadEnvFile(): void {
    const candidates = [resolve(process.cwd(), '.env'), resolve(__dirname, '../../../.env')];
    for (const path of candidates) {
        if (!existsSync(path)) continue;
        const content = readFileSync(path, 'utf8');
        for (const rawLine of content.split(/\r?\n/)) {
            const line = rawLine.trim();
            if (!line || line.startsWith('#')) continue;
            const separator = line.indexOf('=');
            if (separator === -1) continue;
            const key = line.slice(0, separator).trim();
            const value = line
                .slice(separator + 1)
                .trim()
                .replace(/^["']|["']$/g, '');
            if (process.env[key] === undefined) {
                process.env[key] = value;
            }
        }
    }
}

const env = (key: string): string | undefined => process.env[key];

function resolveHosts(options: CliOptions): { authHost: string; gameHost: string } {
    return {
        authHost: options.authHost ?? env('CLIENT_AUTH_HOST') ?? env('AUTH_SERVER_ADDRESS') ?? '127.0.0.1',
        gameHost:
            options.gameHost ??
            env('CLIENT_GAME_HOST') ??
            env('REAL_SERVER_ADDRESS') ??
            env('GAME_SERVER_ADDRESS') ??
            '127.0.0.1',
    };
}

function resolvePorts(options: CliOptions): { authPort: number; gamePort: number } {
    const parsePort = (value: string | undefined): number | null => {
        if (value === undefined) return null;
        const port = Number(value);
        return Number.isInteger(port) && port > 0 && port <= 65535 ? port : null;
    };
    return {
        authPort:
            options.authPort ??
            parsePort(env('CLIENT_AUTH_PORT')) ??
            parsePort(env('AUTH_SERVER_PORT')) ??
            DEFAULT_AUTH_PORT,
        gamePort:
            options.gamePort ??
            parsePort(env('CLIENT_GAME_PORT')) ??
            parsePort(env('GAME_SERVER_PORT')) ??
            DEFAULT_GAME_PORT,
    };
}

async function runStatus(client: Metin2Client, authHost: string, authPort: number, json: boolean): Promise<void> {
    await client.auth.connect(authHost, authPort);
    try {
        const status = await client.auth.requestServerStatus();
        if (json) {
            console.log(JSON.stringify(status, null, 2));
            return;
        }
        console.log(`Server status: ${status.success ? 'online' : 'unreachable'}`);
        for (const channel of status.channels) {
            console.log(`  channel ${channel.port}: ${channel.status === 1 ? 'online' : 'offline'}`);
        }
    } finally {
        await client.auth.close();
    }
}

async function runLogin(
    client: Metin2Client,
    hosts: { authHost: string; gameHost: string },
    ports: { authPort: number; gamePort: number },
    username: string,
    password: string,
    json: boolean,
): Promise<void> {
    await client.login({
        username,
        password,
        authHost: hosts.authHost,
        authPort: ports.authPort,
        gameHost: hosts.gameHost,
        gamePort: ports.gamePort,
    });

    if (json) {
        console.log(
            JSON.stringify(
                {
                    empireId: client.game.getEmpireId(),
                    characters: client.game.getCharacters().map((character) => ({
                        ...character,
                        name: character.name.trim(),
                    })),
                },
                null,
                2,
            ),
        );
        return;
    }

    console.log(`Authenticated as '${username}' (empire ${client.game.getEmpireId()})`);
    const characters = client.game.getCharacters();
    if (characters.length === 0) {
        console.log('  no characters on this account');
        return;
    }
    for (const character of characters) {
        console.log(
            `  slot ${character.slot}: ${character.name.trim().padEnd(15)} lvl ${character.level} class ${character.playerClass}`,
        );
    }
}

async function runPlay(
    client: Metin2Client,
    hosts: { authHost: string; gameHost: string },
    ports: { authPort: number; gamePort: number },
    username: string,
    password: string,
    slot: number | null,
    message: string | null,
    seconds: number,
    json: boolean,
): Promise<void> {
    await client.login({
        username,
        password,
        authHost: hosts.authHost,
        authPort: ports.authPort,
        gameHost: hosts.gameHost,
        gamePort: ports.gamePort,
    });

    const characters = client.game.getCharacters();
    const chosenSlot = resolveCharacterSlot(characters, slot);
    const character = characters.find((entry) => entry.slot === chosenSlot);
    if (!character) {
        // resolveCharacterSlot guarantees this, but keep the compiler happy without a non-null assertion.
        throw new InvalidArgumentError(`No character on slot ${chosenSlot}`);
    }

    const selected = await client.selectCharacter(chosenSlot);
    const entered = await client.enterGame();

    if (!json) {
        console.log(
            `Entering the world as '${character.name.trim()}' on channel ${entered.channel} (game time ${entered.time})`,
        );
        console.log(
            `  hp ${selected.points[0]} mp ${selected.points[1]} st ${selected.points[2]}  skills ${selected.skills.length}`,
        );
    }

    client.reportClientVersion('open-mt2-client', '1.1.2');
    if (message !== null) {
        client.chat(message);
        if (!json) console.log(`  >> ${message}`);
    }

    const done = new Promise<void>((resolveDone) => setTimeout(resolveDone, seconds * 1000));
    if (!json) console.log(`Connected. Ctrl+C to disconnect (staying ${seconds}s).`);
    await done;

    await client.game.close();
    if (!json) console.log('Disconnected.');
}

async function main(): Promise<void> {
    loadEnvFile();

    let options: CliOptions;
    try {
        options = parseArgs(process.argv.slice(2));
    } catch (error) {
        if (error instanceof ClientError) {
            console.error(error.message);
            console.error(USAGE);
            process.exit(2);
        }
        throw error;
    }

    if (options.help || options.command === '') {
        console.log(USAGE);
        process.exit(options.help ? 0 : 2);
    }

    const hosts = resolveHosts(options);
    const ports = resolvePorts(options);
    const username = options.username ?? env('CLIENT_USERNAME') ?? 'admin';
    const password = options.password ?? env('CLIENT_PASSWORD') ?? 'admin';

    const client = new Metin2Client();
    client.on('error', (source, error) => {
        console.error(`[${source}] ${error.message}`);
    });

    let exitCode = 0;
    try {
        switch (options.command) {
            case 'status':
                await runStatus(client, hosts.authHost, ports.authPort, options.json);
                break;
            case 'login':
                await runLogin(client, hosts, ports, username, password, options.json);
                await client.game.close();
                break;
            case 'play':
                await runPlay(
                    client,
                    hosts,
                    ports,
                    username,
                    password,
                    options.slot,
                    options.message,
                    options.seconds,
                    options.json,
                );
                break;
            default:
                throw new InvalidArgumentError(`Unknown command: ${options.command}`);
        }
    } catch (error) {
        const code = error instanceof ClientError ? error.code : 'UNKNOWN';
        console.error(`error [${code}]: ${error instanceof Error ? error.message : String(error)}`);
        exitCode = 1;
    } finally {
        client.destroy();
    }

    process.exit(exitCode);
}

const SIGNALS: Array<NodeJS.Signals> = ['SIGINT', 'SIGTERM'];

function start(): void {
    SIGNALS.forEach((signal) => {
        process.on(signal, () => {
            console.log('\ndisconnecting…');
            process.exit(0);
        });
    });

    void main().catch((error: unknown) => {
        console.error(`fatal: ${error instanceof Error ? error.stack : String(error)}`);
        process.exit(1);
    });
}

// Only run when invoked as the entry point (`node dist/client/cli.js`); importing
// the module for tests must not connect, exit or hijack process signals.
if (require.main === module) {
    start();
}
