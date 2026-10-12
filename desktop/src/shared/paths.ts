/**
 * Filesystem path resolution for the desktop client. Pure helpers (the `exists`
 * predicate is injected) so the fallback order can be unit-tested without a
 * real SPA on disk.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export type ExistsFn = (filePath: string) => boolean;

export const realExists: ExistsFn = (filePath) => fs.existsSync(filePath);

/**
 * Pick the first candidate directory that contains a built SPA (`index.html`).
 * Mirrors the merge order used by the server-side web client (`WEB_CLIENT_DIR`,
 * then the web build, then the release copy), with the desktop-owned locations
 * first.
 *
 * @param candidates Directories in priority order; `null` entries are skipped.
 * @param exists     Filesystem check (injectable for tests).
 * @returns the resolved static dir, or `null` when nothing has been built.
 */
export function resolveStaticDir(candidates: readonly (string | null)[], exists: ExistsFn = realExists): string | null {
    for (const candidate of candidates) {
        if (candidate === null || candidate.length === 0) continue;
        if (exists(path.join(candidate, 'index.html'))) {
            return path.resolve(candidate);
        }
    }
    return null;
}

/** Singleton-friend resolver for the static directory the bridge serves. */
export type StaticDirConfig = {
    /** Absolute directory with a built SPA, or null when the SPA is missing. */
    staticDir: string | null;
    /** Human-readable description of where the SPA came from (for the log). */
    source: string;
};

export function resolveStaticDirConfig(
    candidates: readonly { dir: string | null; source: string }[],
    exists: ExistsFn = realExists,
): StaticDirConfig {
    for (const candidate of candidates) {
        if (candidate.dir === null || candidate.dir.length === 0) continue;
        if (exists(path.join(candidate.dir, 'index.html'))) {
            return { staticDir: path.resolve(candidate.dir), source: candidate.source };
        }
    }
    return { staticDir: null, source: 'none (build the web client first)' };
}
