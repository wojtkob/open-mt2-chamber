/**
 * Preload script for the Open MT2 desktop client (context-isolated bridge).
 *
 * Runs in every renderer (the game window and the settings window) with
 * `contextIsolation: true` and `sandbox: true`. Only the four methods below
 * cross the IPC boundary, and every payload they accept is validated in the
 * main process before any state changes.
 */

import { contextBridge, ipcRenderer } from 'electron';
import type { AppInfo, SaveSettingsAction } from './shared/ipc';
import type { DesktopSettings } from './shared/settings';

export type OpenMt2DesktopApi = {
    /** Application + environment info (version, platform, bridge URL). */
    getInfo(): Promise<AppInfo>;
    /** Current persisted settings (server endpoints, window geometry, ...). */
    getSettings(): Promise<DesktopSettings>;
    /** Validate + persist a settings edit; resolves with the stored settings. */
    saveSettings(patch: SaveSettingsAction): Promise<DesktopSettings>;
    /** Open the client's log folder in Explorer. */
    openLogs(): Promise<{ ok: true }>;
    /** Show the About dialog. */
    about(): Promise<{ ok: true }>;
    /** Enter/leave fullscreen on the game window. */
    setFullscreen(fullscreen: boolean): Promise<{ ok: true }>;
    /** Quit the application. */
    quit(): Promise<void>;
};

const api: OpenMt2DesktopApi = {
    getInfo: () => ipcRenderer.invoke('desktop:get-info'),
    getSettings: () => ipcRenderer.invoke('desktop:get-settings'),
    saveSettings: (patch: SaveSettingsAction) => ipcRenderer.invoke('desktop:save-settings', patch),
    openLogs: () => ipcRenderer.invoke('desktop:open-logs'),
    about: () => ipcRenderer.invoke('desktop:about'),
    setFullscreen: (fullscreen: boolean) => ipcRenderer.invoke('desktop:set-fullscreen', fullscreen),
    quit: () => ipcRenderer.invoke('desktop:quit'),
};

contextBridge.exposeInMainWorld('openMt2', api);
