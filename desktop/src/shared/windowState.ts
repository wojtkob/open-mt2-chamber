/**
 * Window-bounds normalisation. Pure (no `electron` import) so the root unit
 * tests can exercise the edge cases directly.
 *
 * The client persists its window geometry and restores it on the next launch;
 * monitors come and go, so the remembered bounds can land entirely outside the
 * current work area (or get taller than the screen after a DPI change). Rather
 * than trusting the saved numbers verbatim, every restore passes through
 * {@link normalizeWindowBounds}, which clamps the rectangles and re-centers
 * windows that would otherwise be unreachable.
 */

export type Rectangle = {
    x: number;
    y: number;
    width: number;
    height: number;
};

/**
 * The persisted form of a window rectangle. `x`/`y` are `null` when the window
 * was never explicitly placed (the OS/work-area default is used instead); on
 * disk JSON cannot express `undefined`, so "unset" round-trips as `null`.
 */
export type PersistedBounds = {
    x: number | null;
    y: number | null;
    width: number | null;
    height: number | null;
};

/**
 * Normalise a persisted window rectangle against the primary work area.
 *
 * - Missing sizes default to the work-area size (first launch: the client
 *   fills the primary screen instead of materialising at a random small size).
 * - Width/height are clamped to the work area and to `minWidth`/`minHeight`.
 * - A window whose persisted position still intersects the work area (or the
 *   ring of screens directly around it) is pinned back onto the work area,
 *   staying near where the user had it.
 * - A window that is farther away than one screen in either direction lived on
 *   a monitor that has been removed; pinning it to an edge would strand it on
 *   a phantom display, so it is centered on the primary work area instead.
 *
 * `maximized`/`fullscreen` flags are not part of the returned rectangle; the
 * caller reapplies the flags after the rectangle has been restored.
 */
export function normalizeWindowBounds(
    bounds: Partial<PersistedBounds> | null | undefined,
    workArea: Rectangle,
    minWidth = 480,
    minHeight = 360,
): Rectangle {
    const areaLeft = workArea.x;
    const areaTop = workArea.y;
    const areaRight = areaLeft + workArea.width;
    const areaBottom = areaTop + workArea.height;

    const width = Math.min(Math.max(normalizeInteger(bounds?.width, workArea.width), minWidth), workArea.width);
    const height = Math.min(Math.max(normalizeInteger(bounds?.height, workArea.height), minHeight), workArea.height);

    const x = normalizeInteger(bounds?.x, areaLeft);
    const y = normalizeInteger(bounds?.y, areaTop);

    // Envelope: the work area expanded by a full work-area size in each
    // direction — i.e. the ring of directly adjacent screens. A window outside
    // it cannot be reached by glancing at the next monitor.
    const overlapsEnvelope =
        x + width > areaLeft - workArea.width &&
        x < areaRight + workArea.width &&
        y + height > areaTop - workArea.height &&
        y < areaBottom + workArea.height;

    if (!overlapsEnvelope) {
        return {
            x: areaLeft + Math.floor((workArea.width - width) / 2),
            y: areaTop + Math.floor((workArea.height - height) / 2),
            width,
            height,
        };
    }

    return {
        x: Math.min(Math.max(x, areaLeft), areaRight - width),
        y: Math.min(Math.max(y, areaTop), areaBottom - height),
        width,
        height,
    };
}

function normalizeInteger(value: number | null | undefined, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback;
}
