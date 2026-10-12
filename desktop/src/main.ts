/**
 * Open MT2 — Windows desktop client (Electron main process).
 *
 * The desktop client is a thin native shell around the repository's own web
 * client: the main process hosts the exact same `BridgeServer` the server-side
 * web client ships (`src/webclient`), which in turn drives the exact same
 * `Metin2Client` protocol library (`src/client`). The game window is a
 * `BrowserWindow` pointed at the bridge's loopback URL, so every packet the
 * client sends and every screen it renders is the repository's client code —
 * protocol compatibility with the open-mt2 server is structural, not emulated.
 *
 * Responsibilities of this file (and nothing else):
 *  - parse CLI flags and persisted settings,
 *  - start/stop the bridge and own its lifecycle,
 *  - create the main + settings windows with strict webPreferences,
 *  - wire the IPC surface the preload exposes,
 *  - persist window geometry and server endpoints.
 */

import { app, BrowserWindow, dialog, ipcMain, Menu, screen, session, shell } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import BridgeHost, { type BridgeHostDefaults, type RunningBridge } from './bridge/bridgeHost';
import { CLI_USAGE, parseCliArgs, type DesktopCliArgs } from './shared/cli';
import { cloneSettings, endpointsEqual, normalizeSettings, type DesktopSettings } from './shared/settings';
import { loadSettingsFile, saveSettingsFile } from './shared/settingsStore';
import { FileLogger, type DesktopLogger } from './shared/logFile';
import {
    applySaveSettingsAction,
    IPC_CHANNELS,
    parseFullscreenFlag,
    parseSaveSettingsAction,
    type AppInfo,
} from './shared/ipc';
import { resolveStaticDirConfig, type StaticDirConfig } from './shared/paths';
import { normalizeWindowBounds } from './shared/windowState';
import { buildMainMenu } from './menu';

const APP_NAME = 'Open MT2';
const APP_ID = 'com.open-mt2.desktop-client';
const PROJECT_URL = 'https://github.com/wojtkob/open-mt2-chamber';

/** Content Security Policy applied to every page the client opens. */
const CONTENT_SECURITY_POLICY = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "media-src 'self' data:",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-src 'none'",
    "form-action 'self'",
].join('; ');

// ----------------------------------------------------------------------------
// Process-wide state
// ----------------------------------------------------------------------------

let cliArgs: DesktopCliArgs;
let settings: DesktopSettings;
let logger: DesktopLogger | null = null;
let settingsFile = '';
let logsDir = '';

let bridgeHost: BridgeHost | null = null;
let runningBridge: RunningBridge | null = null;
let mainWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
let appVersion = '0.0.0';
let shuttingDown = false;
let shouldQuit = false;
let cachedStaticDir: StaticDirConfig | null = null;
let userDataDir = '';

// ----------------------------------------------------------------------------
// CLI + pre-ready decisions
// ----------------------------------------------------------------------------

const rawArgs = process.argv.slice(app.isPackaged ? 1 : 2);

let cliParseError: string | null = null;
try {
    cliArgs = parseCliArgs(rawArgs);
} catch (error) {
    cliParseError = error instanceof Error ? error.message : String(error);
    cliArgs = parseCliArgs([]);
}

app.setAppUserModelId(APP_ID);

// Single instance: a second launch focuses the running client instead of
// stacking another one (the bridge port is ephemeral, so there is no conflict,
// but one window per user is the expected UX).
if (cliArgs.singleInstance && cliArgs.userDataDir === null) {
    const gotLock = app.requestSingleInstanceLock();
    if (!gotLock) {
        shouldQuit = true;
        app.quit();
    }
}

app.on('second-instance', () => {
    if (mainWindow !== null && !mainWindow.isDestroyed()) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
    }
});

if (cliArgs.userDataDir !== null) {
    app.setPath('userData', path.resolve(cliArgs.userDataDir));
}

// ----------------------------------------------------------------------------
// Bridge + static SPA
// ----------------------------------------------------------------------------

function staticDirConfig(): StaticDirConfig {
    if (cachedStaticDir !== null) return cachedStaticDir;
    cachedStaticDir = resolveStaticDirConfig(
        [
            cliArgs.staticDir !== null ? { dir: cliArgs.staticDir, source: '--static-dir override' } : null,
            { dir: path.join(__dirname, 'static'), source: 'bundled SPA (desktop/dist/static)' },
            { dir: path.join(__dirname, '..', 'web', 'dist'), source: 'repository web/dist' },
            { dir: path.join(__dirname, '..', '..', 'web', 'dist'), source: 'repository web/dist (source checkout)' },
        ].filter((entry): entry is { dir: string; source: string } => entry !== null && entry.dir.length > 0),
    );
    return cachedStaticDir;
}

function bridgeDefaults(): BridgeHostDefaults {
    if (cliArgs.endpointsExplicit) {
        return {
            auth: { host: cliArgs.authHost, port: cliArgs.authPort },
            game: { host: cliArgs.gameHost, port: cliArgs.gamePort },
        };
    }
    return {
        auth: { ...settings.endpoints.auth },
        game: { ...settings.endpoints.game },
    };
}

async function startBridge(): Promise<string> {
    if (bridgeHost !== null) throw new Error('The bridge was already started');
    const host = new BridgeHost({
        version: appVersion,
        staticDir: staticDirConfig().staticDir,
        defaults: bridgeDefaults(),
    });
    bridgeHost = host;
    runningBridge = await host.start('127.0.0.1', 0);
    logger?.info('bridge', `listening on ${runningBridge.url} (static SPA: ${staticDirConfig().source})`);
    return runningBridge.url;
}

async function stopBridge(): Promise<void> {
    const host = bridgeHost;
    bridgeHost = null;
    runningBridge = null;
    if (host !== null) {
        await host.close();
        logger?.info('bridge', 'stopped');
    }
}

// ----------------------------------------------------------------------------
// Window state persistence
// ----------------------------------------------------------------------------

function captureWindowState(): DesktopSettings['window'] {
    const win = mainWindow;
    if (win === null || win.isDestroyed()) return normalizeSettings(null).window;
    const bounds = win.getBounds();
    return {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        maximized: win.isMaximized(),
        fullscreen: win.isFullScreen(),
    };
}

function persistWindowState(): void {
    if (settingsFile.length === 0) return;
    try {
        settings = normalizeSettings({ ...settings, window: captureWindowState() }, settings);
        saveSettingsFile(settingsFile, settings);
    } catch {
        // Persisting geometry must never take the client down.
    }
}

// ----------------------------------------------------------------------------
// Windows
// ----------------------------------------------------------------------------

async function createMainWindow(bridgeUrl: string): Promise<BrowserWindow> {
    const workArea = screen.getPrimaryDisplay().workArea;
    const bounds = normalizeWindowBounds(settings.window, workArea);

    const win = new BrowserWindow({
        width: bounds.width,
        height: bounds.height,
        x: bounds.x,
        y: bounds.y,
        title: APP_NAME,
        backgroundColor: '#0b0e14',
        show: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            webviewTag: false,
            spellcheck: false,
        },
    });

    if (settings.window.maximized) win.maximize();
    if (settings.window.fullscreen) win.setFullScreen(true);

    win.webContents.on('will-navigate', (event, url) => {
        // The game screen is the bridge; nothing else may navigate in place.
        if (!url.startsWith(bridgeUrl)) event.preventDefault();
    });
    win.webContents.setWindowOpenHandler(({ url }) => {
        void shell.openExternal(url);
        return { action: 'deny' };
    });

    win.once('ready-to-show', () => {
        win.show();
        if (cliArgs.devTools) win.webContents.openDevTools({ mode: 'detach' });
    });

    win.on('close', () => {
        if (!shuttingDown) persistWindowState();
    });

    win.on('closed', () => {
        if (mainWindow === win) mainWindow = null;
    });

    await win.loadURL(bridgeUrl);
    return win;
}

function createSettingsWindow(): void {
    if (settingsWindow !== null && !settingsWindow.isDestroyed()) {
        settingsWindow.focus();
        return;
    }

    const win = new BrowserWindow({
        width: 520,
        height: 500,
        resizable: false,
        minimizable: false,
        maximizable: false,
        title: 'Server Settings',
        backgroundColor: '#0b0e14',
        parent: mainWindow ?? undefined,
        modal: mainWindow !== null,
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            webviewTag: false,
            spellcheck: false,
        },
    });

    win.webContents.on('will-navigate', (event) => event.preventDefault());
    win.setMenuBarVisibility(false);

    win.on('closed', () => {
        if (settingsWindow === win) settingsWindow = null;
    });

    void win.loadFile(path.join(__dirname, 'settings', 'settings.html'));
    settingsWindow = win;
}

// ----------------------------------------------------------------------------
// IPC surface (invoked through preload.cjs)
// ----------------------------------------------------------------------------

function registerIpc(): void {
    ipcMain.handle(IPC_CHANNELS.getInfo, (): AppInfo => {
        if (runningBridge === null) throw new Error('The bridge is not running');
        return {
            name: APP_NAME,
            version: appVersion,
            electron: process.versions.electron ?? 'unknown',
            platform: process.platform,
            bridgeUrl: runningBridge.url,
        };
    });

    ipcMain.handle(IPC_CHANNELS.getSettings, () => cloneSettings(settings));

    ipcMain.handle(IPC_CHANNELS.saveSettings, (_event, payload: unknown) => {
        const parsed = parseSaveSettingsAction(payload);
        if (!parsed.ok) {
            throw new Error(parsed.error);
        }
        const patch = applySaveSettingsAction(parsed.value);
        const next = normalizeSettings({ ...settings, endpoints: patch.endpoints, account: patch.account }, settings);
        const endpointsChanged = !endpointsEqual(next.endpoints, settings.endpoints);
        settings = next;
        saveSettingsFile(settingsFile, settings);
        if (endpointsChanged && runningBridge !== null) {
            runningBridge.applyDefaults({
                auth: { ...settings.endpoints.auth },
                game: { ...settings.endpoints.game },
            });
            logger?.info('settings', 'server endpoints updated');
        }
        logger?.info(
            'settings',
            `saved (auth ${settings.endpoints.auth.host}:${settings.endpoints.auth.port}, game ${settings.endpoints.game.host}:${settings.endpoints.game.port})`,
        );
        return cloneSettings(settings);
    });

    ipcMain.handle(IPC_CHANNELS.openLogs, async () => {
        await shell.openPath(logsDir);
        return { ok: true };
    });

    ipcMain.handle(IPC_CHANNELS.about, () => showAboutDialog());

    ipcMain.handle(IPC_CHANNELS.setFullscreen, async (_event, payload: unknown) => {
        const parsed = parseFullscreenFlag(payload);
        if (!parsed.ok) throw new Error(parsed.error);
        if (mainWindow !== null && !mainWindow.isDestroyed()) mainWindow.setFullScreen(parsed.value);
        return { ok: true };
    });

    ipcMain.handle(IPC_CHANNELS.quit, () => {
        app.quit();
    });
}

function showAboutDialog(): { ok: true } {
    void dialog.showMessageBox({
        type: 'info',
        title: `About ${APP_NAME}`,
        message: `${APP_NAME} ${appVersion}`,
        detail: [
            `Electron ${process.versions.electron ?? '?'} · Node ${process.versions.node ?? '?'} · ${process.platform}`,
            '',
            'A native Windows client for the open-mt2 Metin2 server emulator.',
            "It ships the repository's own protocol client, so it is compatible",
            'with any open-mt2 auth/game server out of the box.',
            '',
            PROJECT_URL,
        ].join('\n'),
        buttons: ['OK'],
    });
    return { ok: true };
}

// ----------------------------------------------------------------------------
// Security hardening
// ----------------------------------------------------------------------------

/**
 * Apply the static CSP to the SPA served by the loopback bridge. The bridge's
 * own responses are plain files; injecting the header here keeps the Electron
 * layer the only place that decides policy — the bridge code stays untouched.
 * Only the loopback origin is affected; file:// (settings window) keeps its
 * inline styles/scripts.
 */
function applyContentSecurityPolicy(): void {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        if (!details.url.startsWith('http://127.0.0.1:')) {
            callback({});
            return;
        }
        const responseHeaders = details.responseHeaders ?? {};
        responseHeaders['Content-Security-Policy'] = [CONTENT_SECURITY_POLICY];
        callback({ responseHeaders });
    });
}

// ----------------------------------------------------------------------------
// Menu
// ----------------------------------------------------------------------------

function installMenu(): void {
    Menu.setApplicationMenu(
        buildMainMenu({
            openSettings: () => createSettingsWindow(),
            toggleFullscreen: () => {
                if (mainWindow !== null && !mainWindow.isDestroyed()) {
                    mainWindow.setFullScreen(!mainWindow.isFullScreen());
                }
            },
            openLogs: () => {
                void shell.openPath(logsDir);
            },
            showAbout: () => showAboutDialog(),
        }),
    );
}

// ----------------------------------------------------------------------------
// Application lifecycle
// ----------------------------------------------------------------------------

function readAppVersion(): string {
    try {
        const candidates = [
            path.join(__dirname, '..', 'package.json'),
            path.join(process.resourcesPath ?? '', 'app.asar', 'package.json'),
        ];
        for (const candidate of candidates) {
            if (!fs.existsSync(candidate)) continue;
            const manifest = JSON.parse(fs.readFileSync(candidate, 'utf8')) as { version?: unknown };
            if (typeof manifest.version === 'string' && manifest.version.length > 0) {
                return manifest.version;
            }
        }
    } catch {
        // Fall through to app.getVersion() below.
    }
    return app.getVersion() || '0.0.0';
}

async function onReady(): Promise<void> {
    if (shouldQuit) return;
    if (cliParseError !== null) {
        dialog.showMessageBoxSync({
            type: 'error',
            title: `${APP_NAME} — invalid command line`,
            message: cliParseError,
        });
        app.quit();
        return;
    }
    if (cliArgs.help) {
        dialog.showMessageBoxSync({ type: 'info', title: `${APP_NAME} — command line`, message: CLI_USAGE });
        app.quit();
        return;
    }

    userDataDir = app.getPath('userData');
    settingsFile = path.join(userDataDir, 'settings.json');
    logsDir = path.join(userDataDir, 'logs');

    settings = loadSettingsFile(settingsFile);
    if (cliArgs.logLevel !== null) {
        settings = normalizeSettings({ ...settings, logLevel: cliArgs.logLevel }, settings);
    }
    if (cliArgs.account !== null) {
        settings = normalizeSettings(
            { ...settings, account: { rememberUsername: true, username: cliArgs.account } },
            settings,
        );
    }

    logger = new FileLogger(path.join(logsDir, 'desktop.log'), settings.logLevel);
    appVersion = readAppVersion();

    logger.info(
        'app',
        `${APP_NAME} ${appVersion} starting (Electron ${process.versions.electron ?? '?'}, ${process.platform})`,
    );
    logger.debug('app', `user data: ${userDataDir}`);
    logger.debug(
        'app',
        `endpoints: auth ${settings.endpoints.auth.host}:${settings.endpoints.auth.port}, game ${settings.endpoints.game.host}:${settings.endpoints.game.port} (desktop)`,
    );

    try {
        const bridgeUrl = await startBridge();
        registerIpc();
        installMenu();
        applyContentSecurityPolicy();

        mainWindow = await createMainWindow(bridgeUrl);
        logger.info('app', `game window ready at ${bridgeUrl}`);
    } catch (error) {
        logger.error('app', 'failed to start', error);
        dialog.showErrorBox(
            `${APP_NAME} could not start`,
            `The embedded client bridge failed to start:\n\n${error instanceof Error ? error.message : String(error)}\n\nSee ${logsDir} for details.`,
        );
        app.quit();
    }
}

void app.whenReady().then(onReady);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', () => {
    if (shuttingDown) return;
    shuttingDown = true;
    persistWindowState();
    void stopBridge().finally(() => {
        logger?.info('app', 'bye');
        logger?.close();
    });
});
