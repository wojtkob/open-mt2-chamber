import { describe, expect, it } from 'vitest';
import { formatClock, formatNumber, formatPlayTime, formatTimeOfDay, percent, toNamedPoints, truncate } from './format';

describe('formatNumber', () => {
    it('groups thousands', () => {
        expect(formatNumber(1234567)).toBe('1,234,567');
    });

    it('rounds fractions and handles non-finite input', () => {
        expect(formatNumber(3.6)).toBe('4');
        expect(formatNumber(Number.POSITIVE_INFINITY)).toBe('0');
        expect(formatNumber(Number.NaN)).toBe('0');
    });
});

describe('formatPlayTime', () => {
    it('formats minutes only', () => {
        expect(formatPlayTime(95)).toBe('1m');
    });

    it('formats hours and minutes', () => {
        expect(formatPlayTime(3 * 3600 + 4 * 60)).toBe('3h 4m');
    });

    it('formats days, hours and minutes', () => {
        expect(formatPlayTime(3 * 86400 + 4 * 3600 + 5 * 60)).toBe('3d 4h 5m');
    });

    it('never returns a negative duration', () => {
        expect(formatPlayTime(-10)).toBe('0m');
    });
});

describe('formatClock', () => {
    it('renders a placeholder for unknown times', () => {
        expect(formatClock(null)).toBe('--:--');
        expect(formatClock(0)).toBe('--:--');
    });

    it('renders a zero-padded HH:MM clock', () => {
        // 2026-01-01T05:04:00Z is 05:04 in UTC; the toLocaleString call uses the
        // host locale, so assert the shape rather than a fixed value.
        expect(formatClock(1767243840)).toMatch(/^\d{2}:\d{2}$/);
    });
});

describe('formatTimeOfDay', () => {
    it('renders a full HH:MM:SS clock', () => {
        expect(formatTimeOfDay(1767243840000)).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    });
});

describe('percent', () => {
    it('clamps to 0..100', () => {
        expect(percent(50, 100)).toBe(50);
        expect(percent(-5, 100)).toBe(0);
        expect(percent(250, 100)).toBe(100);
    });

    it('returns 0 when the maximum is not positive', () => {
        expect(percent(10, 0)).toBe(0);
        expect(percent(10, Number.NaN)).toBe(0);
    });
});

describe('truncate', () => {
    it('keeps short strings and shortens long ones', () => {
        expect(truncate('abc', 10)).toBe('abc');
        expect(truncate('abcdefghij', 5)).toBe('abcd…');
    });
});

describe('toNamedPoints', () => {
    it('maps protocol indices to labelled rows, defaulting missing slots to zero', () => {
        const rows = toNamedPoints(
            [0, 11, 0, 0, 0, 509],
            [
                { index: 1, label: 'Level' },
                { index: 5, label: 'Health' },
                { index: 99, label: 'Absent' },
            ],
        );
        expect(rows).toEqual([
            { name: 'Level', value: 11 },
            { name: 'Health', value: 509 },
            { name: 'Absent', value: 0 },
        ]);
    });
});
