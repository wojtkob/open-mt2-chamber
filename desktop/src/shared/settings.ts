/**
 * Persisted settings for the Open MT2 desktop client.
 *
 * This module is deliberately dependency-free (no `electron`, no Node file
 * access at the top level) so the root unit tests can exercise it with plain
 * mocha/chai, mirroring the repository's `test/unit/**` conventions — the
 * desktop package itself has no test runner.
 *
 * `normalizeSettings` is the single gate between untrusted input (the settings
 * file on disk, the CLI, or the renderer's IPC payload) and the runtime: it
 * always produces a complete {@link DesktopSettings} value with every field
 * validated, so callers never deal with partial or malformed state.
 */

import type { BridgeEndpoint } from '../../../src/webclient/contract';

/** Settings file schema version; bump when the shape changes. */
export const SETTINGS_SCHEMA_VERSION = 1;

export type DesktopLogLevel = 'error' | 'warn' | 'info' | 'debug';

/** Which server endpoints the client connects to (mirrors the bridge defaults). */
export type DesktopEndpoints = { auth: BridgeEndpoint; game: BridgeEndpoint };

export type DesktopWindowState = {
    /** `undefined` lets the window open centered on the primary display. */
    x: number | null;
    y: number | null;
    width: number;
    height: number;
    maximized: boolean;
    fullscreen: boolean;
};

export type DesktopSettings = {
    endpoints: DesktopEndpoints;
    account: { rememberUsername: boolean; username: string };
    window: DesktopWindowState;
    logLevel: DesktopLogLevel;
};

export const DEFAULT_ENDPOINTS: DesktopEndpoints = {
    auth: { host: '127.0.0.1', port: 11002 },
    game: { host: '127.0.0.1', port: 13001 },
};

export const DEFAULT_WINDOW_STATE: DesktopWindowState = {
    x: null,
    y: null,
    width: 1280,
    height: 800,
    maximized: false,
    fullscreen: false,
};

export const DEFAULT_SETTINGS: DesktopSettings = {
    endpoints: {
        auth: { ...DEFAULT_ENDPOINTS.auth },
        game: { ...DEFAULT_ENDPOINTS.game },
    },
    account: { rememberUsername: false, username: '' },
    window: { ...DEFAULT_WINDOW_STATE },
    logLevel: 'info',
};

const LOG_LEVELS: readonly DesktopLogLevel[] = ['error', 'warn', 'info', 'debug'];

/** Human-readable label for a log level, used by the CLI `--log-level` flag. */
export const LOG_LEVEL_NAMES: readonly string[] = [...LOG_LEVELS];

export function isLogLevel(value: unknown): value is DesktopLogLevel {
    return typeof value === 'string' && (LOG_LEVELS as readonly string[]).includes(value);
}

/**
 * Validate a host the client can connect to: a non-empty trimmed string that
 * does not begin with `/` (a path, not a host) and contains no spaces or port
 * separators — the port is a separate field everywhere in this client.
 */
export function isValidHost(value: unknown): value is string {
    if (typeof value !== 'string') return false;
    const host = value.trim();
    if (host.length === 0 || host.length > 253) return false;
    if (host.startsWith('/') || host.includes('\\')) return false;
    if (host.includes(' ') || host.includes(':')) return false;
    if (host.includes('://')) return false;
    return true;
}

/** Validate a TCP port number (`1`..`65535`). */
export function isValidPort(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 65_535;
}

export function normalizeEndpoint(input: unknown, fallback: BridgeEndpoint): BridgeEndpoint {
    if (input === null || typeof input !== 'object') {
        return { ...fallback };
    }
    const candidate = input as Record<string, unknown>;
    const host = isValidHost(candidate.host) ? candidate.host.trim() : fallback.host;
    const port = isValidPort(candidate.port) ? candidate.port : fallback.port;
    return { host, port };
}

function normalizeEndpoints(input: unknown, fallback: DesktopEndpoints): DesktopEndpoints {
    if (input === null || typeof input !== 'object') {
        return { auth: { ...fallback.auth }, game: { ...fallback.game } };
    }
    const candidate = input as { auth?: unknown; game?: unknown };
    return {
        auth: normalizeEndpoint(candidate.auth, fallback.auth),
        game: normalizeEndpoint(candidate.game, fallback.game),
    };
}

function normalizeWindowState(input: unknown, fallback: DesktopWindowState): DesktopWindowState {
    if (input === null || typeof input !== 'object') {
        return { ...fallback };
    }
    const candidate = input as Record<string, unknown>;
    const clamped = (value: unknown, min: number, max: number, fallbackValue: number): number =>
        typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
            ? Math.round(value)
            : fallbackValue;

    return {
        x: typeof candidate.x === 'number' && Number.isInteger(candidate.x) ? candidate.x : fallback.x,
        y: typeof candidate.y === 'number' && Number.isInteger(candidate.y) ? candidate.y : fallback.y,
        width: clamped(candidate.width, 480, 10_000, fallback.width),
        height: clamped(candidate.height, 360, 10_000, fallback.height),
        maximized: typeof candidate.maximized === 'boolean' ? candidate.maximized : fallback.maximized,
        fullscreen: typeof candidate.fullscreen === 'boolean' ? candidate.fullscreen : fallback.fullscreen,
    };
}

function normalizeAccount(input: unknown, fallback: DesktopSettings['account']): DesktopSettings['account'] {
    if (input === null || typeof input !== 'object') {
        return { ...fallback };
    }
    const candidate = input as Record<string, unknown>;
    const username =
        typeof candidate.username === 'string' ? candidate.username.slice(0, 32).trim() : fallback.username;
    const rememberUsername =
        typeof candidate.rememberUsername === 'boolean' ? candidate.rememberUsername : fallback.rememberUsername;
    // Keeping an empty remembered username is pointless — the login form has
    // nothing to pre-fill — so it is normalised away.
    return { rememberUsername: rememberUsername && username.length > 0, username };
}

function normalizeLogLevel(input: unknown, fallback: DesktopSettings['logLevel']): DesktopLogLevel {
    return isLogLevel(input) ? input : fallback;
}

/**
 * Turn arbitrary (possibly hostile, possibly partially typed) input into a
 * complete, valid {@link DesktopSettings}. Unknown keys are dropped; invalid
 * fields fall back to `base` (defaults for the file, current value for saves).
 */
export function normalizeSettings(input: unknown, base: DesktopSettings = DEFAULT_SETTINGS): DesktopSettings {
    if (input === null || typeof input !== 'object') {
        return {
            endpoints: { auth: { ...base.endpoints.auth }, game: { ...base.endpoints.game } },
            account: { ...base.account },
            window: { ...base.window },
            logLevel: base.logLevel,
        };
    }
    const candidate = input as Record<string, unknown>;
    return {
        endpoints: normalizeEndpoints(candidate.endpoints, base.endpoints),
        account: normalizeAccount(candidate.account, base.account),
        window: normalizeWindowState(candidate.window, base.window),
        logLevel: normalizeLogLevel(candidate.logLevel, base.logLevel),
    };
}

/** Deep-copy a settings value so callers can hold a snapshot that never aliases the stored object. */
export function cloneSettings(settings: DesktopSettings): DesktopSettings {
    return {
        endpoints: { auth: { ...settings.endpoints.auth }, game: { ...settings.endpoints.game } },
        account: { ...settings.account },
        window: { ...settings.window },
        logLevel: settings.logLevel,
    };
}

/** True when every endpoint of `a` matches `b`, used to avoid redundant bridge updates. */
export function endpointsEqual(a: DesktopEndpoints, b: DesktopEndpoints): boolean {
    return (
        a.auth.host === b.auth.host &&
        a.auth.port === b.auth.port &&
        a.game.host === b.game.host &&
        a.game.port === b.game.port
    );
}
