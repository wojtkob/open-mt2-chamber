/**
 * Desktop client log message formatting. Pure, so the unit tests can pin the
 * exact lines written to the log file.
 */

export type DesktopLogLevel = 'error' | 'warn' | 'info' | 'debug';

const LEVEL_ORDER: Record<DesktopLogLevel, number> = { error: 0, warn: 1, info: 2, debug: 3 };

export function levelEnabled(level: DesktopLogLevel, configured: DesktopLogLevel): boolean {
    return LEVEL_ORDER[level] <= LEVEL_ORDER[configured];
}

/**
 * Format one log line: ISO timestamp + level + optional scope + message.
 *
 * ```
 * 2026-10-12T09:15:33.123Z info  [bridge] listening on http://127.0.0.1:51324
 * ```
 */
export function formatLogLine(level: DesktopLogLevel, message: string, scope?: string, at = new Date()): string {
    const timestamp = at.toISOString();
    const scopePart = scope !== undefined ? ` [${scope}]` : '';
    return `${timestamp} ${level.padEnd(5)}${scopePart} ${message}`;
}

/** Format an unknown thrown value the way a desktop log wants it (never throws). */
export function errorText(error: unknown): string {
    if (error instanceof Error) {
        return error.stack ?? `${error.name}: ${error.message}`;
    }
    if (typeof error === 'string') return error;
    try {
        // JSON.stringify(Symbol / function / circular-safe values) can return
        // `undefined` instead of a string — fall back to String() in that case.
        return JSON.stringify(error) ?? String(error);
    } catch {
        return String(error);
    }
}
