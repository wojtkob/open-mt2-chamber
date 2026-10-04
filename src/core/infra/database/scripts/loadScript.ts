import fs from 'node:fs/promises';
import path from 'node:path';
import bcrypt from 'bcryptjs';

const SEED_ADMIN_HASH_PLACEHOLDER = '{{SEED_ADMIN_PASSWORD_HASH}}';
const SAULT_ROUNDS = 5;
const SCRIPT_FILE_NAME = 'script.sql';

/**
 * `tsc` only emits the modules it compiles, so `script.sql` has to be copied
 * into `dist/` by the build (see tools/copy-assets.js). Both candidate
 * layouts are checked so the migrator runs from a source checkout and from a
 * packaged install without any extra flag.
 */
async function resolveScriptPath(): Promise<string> {
    const candidates = [
        path.resolve(__dirname, SCRIPT_FILE_NAME),
        path.resolve(__dirname, '../scripts', SCRIPT_FILE_NAME),
        path.resolve(process.cwd(), 'src/core/infra/database/scripts', SCRIPT_FILE_NAME),
    ];

    for (const candidate of candidates) {
        try {
            await fs.access(candidate);
            return candidate;
        } catch {
            continue;
        }
    }

    throw new Error(
        `[DB_SCRIPT] ${SCRIPT_FILE_NAME} not found. Looked in: ${candidates.join(', ')}. ` +
            'The database scripts are copied by "npm run build" and shipped in the release package.',
    );
}

async function loadScript() {
    const scriptPath = await resolveScriptPath();
    const bruteScript = (await fs.readFile(scriptPath)).toString();
    const seedAdminHash = await bcrypt.hash(process.env.SEED_ADMIN_PASSWORD || 'admin', SAULT_ROUNDS);
    const scriptWithSeedValues = bruteScript.replaceAll(SEED_ADMIN_HASH_PLACEHOLDER, seedAdminHash);
    const cleanedScript = scriptWithSeedValues.replace(/(\r\n|\n|\r)/gm, '');
    const scriptSplittedByCommand = cleanedScript.split(';');
    const validCommandScriptArray = scriptSplittedByCommand.filter(Boolean);
    return validCommandScriptArray;
}

export default loadScript;
