/**
 * Presentation helpers for the web client. Pure functions, no DOM — they are
 * unit tested directly.
 */

/** Thousands-separated integer (`12345` → `"12,345"`). */
export function formatNumber(value: number): string {
    if (!Number.isFinite(value)) return '0';
    return Math.round(value).toLocaleString('en-US');
}

/** Compact elapsed play time: `3d 4h 5m`, `4h 5m`, `5m`. */
export function formatPlayTime(totalSeconds: number): string {
    const seconds = Math.max(0, Math.floor(totalSeconds));
    const days = Math.floor(seconds / 86_400);
    const hours = Math.floor((seconds % 86_400) / 3_600);
    const minutes = Math.floor((seconds % 3_600) / 60);
    const parts: string[] = [];
    if (days > 0) parts.push(`${days}d`);
    if (days > 0 || hours > 0) parts.push(`${hours}h`);
    parts.push(`${minutes}m`);
    return parts.join(' ');
}

/** A unix timestamp (seconds) rendered as `HH:MM`, or `--:--` when unknown. */
export function formatClock(unixSeconds: number | null): string {
    if (unixSeconds === null || !Number.isFinite(unixSeconds) || unixSeconds <= 0) return '--:--';
    return new Date(unixSeconds * 1000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

/** `HH:MM:SS` for a chat line timestamp (milliseconds). */
export function formatTimeOfDay(epochMs: number): string {
    return new Date(epochMs).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/** Percentage of `value` in `max`, clamped to 0..100. */
export function percent(value: number, max: number): number {
    if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return 0;
    return Math.max(0, Math.min(100, (value / max) * 100));
}

/** Shorten long text with an ellipsis. */
export function truncate(text: string, max: number): string {
    if (text.length <= max) return text;
    return `${text.slice(0, Math.max(0, max - 1))}…`;
}

export type NamedValue = { name: string; value: number };

/** Convert the flat 255-slot points array into named rows for a detail table. */
export function toNamedPoints(points: number[], names: readonly { index: number; label: string }[]): NamedValue[] {
    return names.map(({ index, label }) => ({ name: label, value: points[index] ?? 0 }));
}
