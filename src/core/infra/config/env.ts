import * as fs from 'node:fs';
import * as path from 'node:path';
import RuntimePaths from './RuntimePaths';

const ENV_FILE_NAME = '.env';
const MAX_ENV_FILE_BYTES = 1024 * 1024;

let loadedFilePath: string | undefined;

/**
 * Minimal `.env` reader used as a fallback for `node --env-file=.env`.
 *
 * `--env-file` only exists on Node >= 20.6 and needs the file to sit in the
 * working directory, neither of which holds for the packaged install (Node
 * shipped by Armbian is often older, and systemd starts the process from
 * `/opt/open-mt2` with the real configuration in `/etc/open-mt2`). Loading the
 * file here keeps every entry point — both servers, the migrator and the
 * tests — working from a plain `node dist/auth/main.js`.
 *
 * Rules, matching `--env-file`: blank lines and `#` comments are skipped, an
 * optional `export ` prefix is accepted, single quotes are literal, double
 * quotes expand `\n`, and a key that is already present in `process.env` is
 * never overwritten (so an explicit environment always wins).
 */
export function parseEnvFile(content: string): Record<string, string> {
    const parsed: Record<string, string> = {};

    for (const rawLine of content.split(/\r\n|\n|\r/)) {
        const line = rawLine.trim();

        if (line === '' || line.startsWith('#')) continue;

        const withoutExport = line.startsWith('export ') ? line.slice('export '.length).trim() : line;
        const separator = withoutExport.indexOf('=');

        if (separator <= 0) continue;

        const key = withoutExport.slice(0, separator).trim();
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

        parsed[key] = parseEnvValue(withoutExport.slice(separator + 1).trim());
    }

    return parsed;
}

function parseEnvValue(rawValue: string): string {
    if (rawValue.length >= 2 && rawValue.startsWith("'") && rawValue.endsWith("'")) {
        return rawValue.slice(1, -1);
    }

    if (rawValue.length >= 2 && rawValue.startsWith('"') && rawValue.endsWith('"')) {
        return rawValue
            .slice(1, -1)
            .replace(/\\n/g, '\n')
            .replace(/\\r/g, '\r')
            .replace(/\\t/g, '\t')
            .replace(/\\"/g, '"')
            .replace(/\\\\/g, '\\');
    }

    // Unquoted values end at an unescaped `#` comment, like a POSIX shell word.
    const withoutComment = rawValue.replace(/(^|\s)#.*$/, '$1').trim();

    return withoutComment.replace(/\\([\\'"#\s])/g, '$1');
}

/** Absolute path of the env file this process should read, if any. */
export function resolveEnvFilePath(explicitPath?: string): string | undefined {
    const candidate = explicitPath ?? process.env.OPEN_MT2_ENV_FILE;

    if (candidate) {
        return path.isAbsolute(candidate) ? candidate : path.resolve(RuntimePaths.appRoot(), candidate);
    }

    const nextToApp = path.join(RuntimePaths.appRoot(), ENV_FILE_NAME);

    return fs.existsSync(nextToApp) ? nextToApp : undefined;
}

/**
 * Applies the env file to `process.env`. Safe to call more than once and from
 * several modules: the file is read at most once per path.
 *
 * @returns the file that was loaded, or undefined when there was nothing to load.
 */
export function loadEnvFile(explicitPath?: string): string | undefined {
    const envFilePath = resolveEnvFilePath(explicitPath);

    if (!envFilePath) return undefined;
    if (loadedFilePath === envFilePath) return envFilePath;
    if (!fs.existsSync(envFilePath)) return undefined;

    const content = fs.readFileSync(envFilePath, 'utf8');

    if (content.length > MAX_ENV_FILE_BYTES) {
        throw new Error(`[ENV] ${envFilePath} is larger than ${MAX_ENV_FILE_BYTES} bytes, refusing to parse it`);
    }

    for (const [key, value] of Object.entries(parseEnvFile(content))) {
        if (process.env[key] === undefined) {
            process.env[key] = value;
        }
    }

    loadedFilePath = envFilePath;
    return envFilePath;
}

/** Test seam: forgets which file was loaded. */
export function resetEnvFileCache(): void {
    loadedFilePath = undefined;
}
