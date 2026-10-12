/**
 * IPC contract between the Electron main process, the preload bridge and the
 * renderers (main game window + settings window). Pure — no `electron` import —
 * so the payload validators can be unit-tested.
 *
 * Every `ipcMain.handle` callback in the main process runs its payload through
 * one of the `parse*` functions below before touching any state; a renderer can
 * never smuggle a malformed object into `saveSettings`.
 */

import { isValidHost, isValidPort, type DesktopSettings } from './settings';

export const IPC_CHANNELS = {
    /** () => AppInfo */
    getInfo: 'desktop:get-info',
    /** () => DesktopSettings */
    getSettings: 'desktop:get-settings',
    /** (SaveSettingsAction) => DesktopSettings */
    saveSettings: 'desktop:save-settings',
    /** () => { ok: true } */
    openLogs: 'desktop:open-logs',
    /** () => { ok: true } */
    about: 'desktop:about',
    /** (fullscreenFlag?) => { ok: true } */
    setFullscreen: 'desktop:set-fullscreen',
    /** () => void */
    quit: 'desktop:quit',
} as const;

export type AppInfo = {
    name: string;
    version: string;
    electron: string;
    platform: string;
    bridgeUrl: string;
};

/**
 * The settings window sends a partial settings blob. Endpoints are the fields
 * the user edits; the account fields are included so the login form can be
 * pre-filled across launches.
 */
export type SaveSettingsAction = {
    endpoints: { auth: { host: string; port: number }; game: { host: string; port: number } };
    account: { rememberUsername: boolean; username: string };
};

/**
 * Validate one IPC payload under `ipcMain.handle`. Returns `{ ok: true, value }`
 * for a well-formed action or `{ ok: false, error }` with a message safe to
 * send back to the renderer (no thrown internals).
 */
export function parseSaveSettingsAction(
    input: unknown,
): { ok: true; value: SaveSettingsAction } | { ok: false; error: string } {
    if (input === null || typeof input !== 'object') {
        return { ok: false, error: 'Expected an object with endpoints' };
    }
    const candidate = input as { endpoints?: unknown; account?: unknown };

    if (candidate.endpoints === null || typeof candidate.endpoints !== 'object') {
        return { ok: false, error: 'Expected an endpoints object' };
    }
    const endpoints = candidate.endpoints as { auth?: unknown; game?: unknown };

    const authHost = readHost(endpoints.auth);
    if (authHost === null) return { ok: false, error: 'auth.host must be a non-empty host name' };
    const authPort = readPort(endpoints.auth);
    if (authPort === null) return { ok: false, error: 'auth.port must be an integer between 1 and 65535' };

    const gameHost = readHost(endpoints.game);
    if (gameHost === null) return { ok: false, error: 'game.host must be a non-empty host name' };
    const gamePort = readPort(endpoints.game);
    if (gamePort === null) return { ok: false, error: 'game.port must be an integer between 1 and 65535' };

    let rememberUsername = false;
    let username = '';
    if (candidate.account !== null && typeof candidate.account === 'object') {
        const account = candidate.account as { rememberUsername?: unknown; username?: unknown };
        rememberUsername = typeof account.rememberUsername === 'boolean' ? account.rememberUsername : false;
        username = typeof account.username === 'string' ? account.username.slice(0, 32).trim() : '';
    }
    if (rememberUsername && username.length === 0) {
        return { ok: false, error: 'Remembering an account name requires a non-empty username' };
    }

    return {
        ok: true,
        value: {
            endpoints: {
                auth: { host: authHost, port: authPort },
                game: { host: gameHost, port: gamePort },
            },
            account: { rememberUsername, username },
        },
    };
}

export function parseFullscreenFlag(input: unknown): { ok: true; value: boolean } | { ok: false; error: string } {
    if (typeof input !== 'boolean' && typeof input !== 'undefined') {
        return { ok: false, error: 'Expected a boolean fullscreen flag' };
    }
    return { ok: true, value: input === true };
}

/** Map a validated settings IPC payload onto a full settings object. */
export function applySaveSettingsAction(value: SaveSettingsAction): Pick<DesktopSettings, 'endpoints' | 'account'> {
    return {
        endpoints: {
            auth: { host: value.endpoints.auth.host, port: value.endpoints.auth.port },
            game: { host: value.endpoints.game.host, port: value.endpoints.game.port },
        },
        account: value.account,
    };
}

function readHost(endpoint: unknown): string | null {
    if (endpoint === null || typeof endpoint !== 'object') return null;
    const host = (endpoint as { host?: unknown }).host;
    return isValidHost(host) ? host.trim() : null;
}

function readPort(endpoint: unknown): number | null {
    if (endpoint === null || typeof endpoint !== 'object') return null;
    const port = (endpoint as { port?: unknown }).port;
    return isValidPort(port) ? port : null;
}
