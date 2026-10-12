/**
 * File-backed logger for the desktop client.
 *
 * Writes timestamped lines to a single rolling log file under the user-data
 * directory. When the file grows past `maxBytes` the oldest half is discarded
 * on the next start (not inline — appending stays cheap and lock-free).
 * `error`/`warn`/`info`/`debug` map onto the client's configured log level.
 * This module does not import `electron`.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { errorText, formatLogLine, levelEnabled, type DesktopLogLevel } from './log';

export type DesktopLogger = {
    error(scope: string | undefined, message: string, error?: unknown): void;
    warn(scope: string | undefined, message: string, error?: unknown): void;
    info(scope: string | undefined, message: string): void;
    debug(scope: string | undefined, message: string): void;
    /** Close the underlying file descriptor (used on app shutdown). */
    close(): void;
};

export class FileLogger implements DesktopLogger {
    private readonly filePath: string;
    private readonly level: DesktopLogLevel;
    private fd: number | null = null;

    constructor(filePath: string, level: DesktopLogLevel) {
        this.filePath = filePath;
        this.level = level;
        try {
            fs.mkdirSync(path.dirname(filePath), { recursive: true });
            this.rotateIfOversized(filePath);
            this.fd = fs.openSync(filePath, 'a');
        } catch {
            // Logging must never take the client down; if the log file cannot
            // be opened, writes are silently dropped.
            this.fd = null;
        }
    }

    error(scope: string | undefined, message: string, error?: unknown): void {
        this.write('error', scope, error !== undefined ? `${message} ${errorText(error)}` : message);
    }

    warn(scope: string | undefined, message: string, error?: unknown): void {
        this.write('warn', scope, error !== undefined ? `${message} ${errorText(error)}` : message);
    }

    info(scope: string | undefined, message: string): void {
        this.write('info', scope, message);
    }

    debug(scope: string | undefined, message: string): void {
        this.write('debug', scope, message);
    }

    close(): void {
        if (this.fd !== null) {
            fs.closeSync(this.fd);
            this.fd = null;
        }
    }

    private write(level: DesktopLogLevel, scope: string | undefined, message: string): void {
        if (this.fd === null || !levelEnabled(level, this.level)) return;
        const line = `${formatLogLine(level, message, scope)}\n`;
        try {
            fs.writeSync(this.fd, line);
        } catch {
            // Same policy as the constructor: silent failure keeps the game alive.
        }
    }

    private rotateIfOversized(filePath: string): void {
        try {
            const stat = fs.statSync(filePath);
            if (stat.size <= 2 * 1024 * 1024) return;
        } catch {
            return; // No log file yet.
        }
        // Keep roughly the newest 2 MB: copy the tail to a fresh file.
        const MAX_BYTES = 2 * 1024 * 1024;
        const content = fs.readFileSync(filePath);
        const start = Math.max(0, content.byteLength - MAX_BYTES);
        const tail = content.subarray(start);
        fs.writeFileSync(filePath, tail);
    }
}

/** A no-op logger used before {@link FileLogger} construction succeeds and in tests. */
export const silentLogger: DesktopLogger = {
    error: () => undefined,
    warn: () => undefined,
    info: () => undefined,
    debug: () => undefined,
    close: () => undefined,
};
