import { useEffect, useState } from 'react';

/**
 * Debounce a rapidly-changing value (search inputs, motion-heavy fields).
 * Returns `value` unchanged until it has been stable for `delayMs`.
 */
export function useDebouncedValue<T>(value: T, delayMs = 200): T {
    const [debounced, setDebounced] = useState(value);

    useEffect(() => {
        const timer = window.setTimeout(() => setDebounced(value), delayMs);
        return () => window.clearTimeout(timer);
    }, [value, delayMs]);

    return debounced;
}
