import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Data directories shipped as plain files next to the compiled code.
 *
 * `attr` holds the per-map walkability grids, `spawn` the per-map spawn files.
 * Neither is imported by the TypeScript sources, so `tsc` never emits them:
 * they only end up under `dist/` because the build copies them explicitly.
 */
export type DataDirName = 'attr' | 'spawn';

const PACKAGE_MANIFEST = 'package.json';
const DATA_RELATIVE_PATH = ['core', 'infra', 'config', 'data'];
const MAX_APP_ROOT_DEPTH = 12;

/**
 * Resolves where the runtime assets live, independently of the current working
 * directory.
 *
 * The servers used to build their asset paths from `process.cwd()`, which
 * silently breaks as soon as the process is started from anywhere other than
 * the repository root — the normal case for a packaged install under
 * `/opt/open-mt2` and for a systemd unit with its own `WorkingDirectory`.
 * Resolution therefore tries several layouts in order, anchored on the
 * installation root, and picks the first one that exists.
 */
export default class RuntimePaths {
    private static cachedAppRoot: string | undefined;

    /** Absolute path of the installation root (the folder holding package.json). */
    static appRoot(): string {
        if (RuntimePaths.cachedAppRoot) return RuntimePaths.cachedAppRoot;

        const start = __dirname;
        let current = start;

        for (let depth = 0; depth < MAX_APP_ROOT_DEPTH; depth++) {
            if (fs.existsSync(path.join(current, PACKAGE_MANIFEST))) {
                RuntimePaths.cachedAppRoot = current;
                return current;
            }

            const parent = path.dirname(current);
            if (parent === current) break;
            current = parent;
        }

        // No manifest anywhere above us (e.g. a bundled single-file layout):
        // fall back to the working directory so the error messages produced by
        // the callers still point at something the operator recognises.
        RuntimePaths.cachedAppRoot = process.cwd();
        return RuntimePaths.cachedAppRoot;
    }

    /** First candidate that exists on disk, or the first candidate when none does. */
    static resolveFirstExisting(candidates: string[]): string {
        const existing = candidates.find((candidate) => fs.existsSync(candidate));
        return existing ?? candidates[0];
    }

    /** Every location a given data directory may live in, most specific first. */
    static dataDirCandidates(name: DataDirName): string[] {
        const appRoot = RuntimePaths.appRoot();

        return [
            // Source checkout started from its own root — the historical
            // location. Keeping it first means an existing dev workflow is
            // untouched, and a packaged install simply falls through, because
            // <prefix>/src does not exist there.
            path.join(process.cwd(), 'src', ...DATA_RELATIVE_PATH, name),
            // Compiled layout: <root>/dist/core/infra/config/data/<name>
            path.join(appRoot, 'dist', ...DATA_RELATIVE_PATH, name),
            // Source layout anchored on the installation root rather than on
            // the working directory.
            path.join(appRoot, 'src', ...DATA_RELATIVE_PATH, name),
        ];
    }

    /** Absolute path of a shipped data directory. */
    static dataDir(name: DataDirName): string {
        return RuntimePaths.resolveFirstExisting(RuntimePaths.dataDirCandidates(name));
    }

    /**
     * True when the assets shipped with the build are actually present. Used by
     * the release verifier and by the servers to fail loudly at boot instead of
     * starting a world where every map is walkable and empty.
     */
    static hasDataDir(name: DataDirName): boolean {
        return RuntimePaths.dataDirCandidates(name).some((candidate) => fs.existsSync(candidate));
    }

    /** Test seam: forces the next {@link appRoot} call to re-resolve. */
    static resetCache(): void {
        RuntimePaths.cachedAppRoot = undefined;
    }
}
