import { runMigrations } from '@/cli/migrate';

/**
 * Development wrapper around `src/cli/migrate.ts`, which is the entry point the
 * compiled release uses (`dist/cli/migrate.js`). Kept so `npm run migrate`
 * keeps working with ts-node.
 */
void runMigrations().then((exitCode) => {
    process.exit(exitCode);
});