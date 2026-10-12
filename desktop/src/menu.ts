/**
 * Application menu for the desktop client (Electron main process).
 * The Settings window and everything it does is reachable from `Game → Server
 * Settings…` (also `Ctrl+,`). The standard View roles give reload/zoom/devtools
 * without any custom code; F11 toggles fullscreen.
 */

import { Menu, shell, type MenuItemConstructorOptions } from 'electron';

export type DesktopMenuActions = {
    openSettings(): void;
    toggleFullscreen(): void;
    openLogs(): void;
    showAbout(): void;
};

export function buildMainMenu(actions: DesktopMenuActions): Menu {
    const template: MenuItemConstructorOptions[] = [
        {
            label: 'Game',
            submenu: [
                {
                    label: 'Server Settings…',
                    accelerator: 'Ctrl+,',
                    click: () => actions.openSettings(),
                },
                {
                    label: 'Open Logs Folder',
                    click: () => actions.openLogs(),
                },
                { type: 'separator' },
                { role: 'quit' },
            ],
        },
        {
            label: 'View',
            submenu: [
                { role: 'reload' },
                { role: 'forceReload' },
                { role: 'toggleDevTools' },
                { type: 'separator' },
                { role: 'resetZoom' },
                { role: 'zoomIn' },
                { role: 'zoomOut' },
                { type: 'separator' },
                {
                    label: 'Toggle Full Screen',
                    accelerator: 'F11',
                    click: () => actions.toggleFullscreen(),
                },
            ],
        },
        {
            label: 'Help',
            submenu: [
                {
                    label: 'About Open MT2',
                    click: () => actions.showAbout(),
                },
                {
                    label: 'Project Website',
                    click: () => {
                        void shell.openExternal('https://github.com/wojtkob/open-mt2-chamber');
                    },
                },
            ],
        },
    ];
    return Menu.buildFromTemplate(template);
}
