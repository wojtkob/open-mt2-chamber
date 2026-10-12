/**
 * Settings persistence for the desktop client.
 *
 * The pure parse/serialize helpers are in this module so they can be unit
 * tested; the file-backed helpers (`loadSettingsFile` / `saveSettingsFile`)
 * wrap them with atomic writes. Nothing here imports `electron`.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
    cloneSettings,
    DEFAULT_SETTINGS,
    normalizeSettings,
    SETTINGS_SCHEMA_VERSION,
    type DesktopSettings,
} from './settings';

export type SettingsFile = {
    schemaVersion: number;
    settings: DesktopSettings;
};

/**
 * Parse the persisted settings JSON. Any deviation from the schema (missing
 * file, malformed JSON, wrong shape, future schema version) falls back to the
 * defaults — the client must always start, and the next save rewrites the file
 * in the current schema.
 */
export function parseSettingsFile(text: string): DesktopSettings {
    let raw: unknown;
    try {
        raw = JSON.parse(text);
    } catch {
        return cloneSettings(DEFAULT_SETTINGS);
    }
    if (raw === null || typeof raw !== 'object') {
        return cloneSettings(DEFAULT_SETTINGS);
    }
    const file = raw as { schemaVersion?: unknown; settings?: unknown };
    if (typeof file.schemaVersion !== 'number' || file.schemaVersion > SETTINGS_SCHEMA_VERSION) {
        return cloneSettings(DEFAULT_SETTINGS);
    }
    return normalizeSettings(file.settings, DEFAULT_SETTINGS);
}

/** Serialize the settings for disk, in the current schema. */
export function serializeSettings(settings: DesktopSettings): string {
    const file: SettingsFile = { schemaVersion: SETTINGS_SCHEMA_VERSION, settings };
    return `${JSON.stringify(file, null, 2)}\n`;
}

/** Read settings from disk (missing/corrupt file → defaults, never throws). */
export function loadSettingsFile(filePath: string): DesktopSettings {
    try {
        return parseSettingsFile(fs.readFileSync(filePath, 'utf8'));
    } catch {
        return cloneSettings(DEFAULT_SETTINGS);
    }
}

/**
 * Write settings to disk atomically: the temporary file is written and flushed
 * before it replaces the target, so a crash mid-write cannot corrupt the saved
 * settings. Throws on I/O failure so the caller can surface the problem.
 */
export function saveSettingsFile(filePath: string, settings: DesktopSettings): void {
    const directory = path.dirname(filePath);
    fs.mkdirSync(directory, { recursive: true });
    const temporary = `${filePath}.tmp`;
    const fd = fs.openSync(temporary, 'w');
    try {
        fs.writeFileSync(fd, serializeSettings(settings), 'utf8');
        fs.fsyncSync(fd);
    } finally {
        fs.closeSync(fd);
    }
    fs.renameSync(temporary, filePath);
}
