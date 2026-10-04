import DatabaseManager from '@/core/infra/database/DatabaseManager';
import { makeConfig } from '@/core/infra/config/Config';
import Logger from '@/core/infra/logger/Logger';

/**
 * Logger writing to the console, so the migrator can run outside the servers
 * (which bring their own winston adapter) without a log directory.
 */
export const scriptLogger: Logger = {
    info: (message: string, ...params: unknown[]) => console.log(message, ...params),
    debug: () => undefined,
    error: (param: Error | string, ...params: unknown[]) => console.error(param, ...params),
};

/**
 * Database migration entry point.
 *
 * Compiled to `dist/cli/migrate.js` so a packaged install can create and seed
 * the schemas with `node dist/cli/migrate.js`, without shipping ts-node or the
 * TypeScript sources. `npm run migrate` (tools/database/migrate.ts) calls the
 * same function during development.
 *
 * Applies `src/core/infra/database/scripts/script.sql`, which creates both the
 * `auth` and the `game` schemas and seeds the default admin account. The script
 * starts with `DROP DATABASE IF EXISTS`, so it is destructive: it wipes any
 * existing world. The packaged installer asks for confirmation before calling
 * it.
 *
 * @returns a process exit code: 0 on success, 1 on failure.
 */
export async function runMigrations(logger: Logger = scriptLogger): Promise<number> {
    const config = makeConfig();

    const databaseManager = new DatabaseManager({
        logger,
        config: {
            ...config,
            DB_HOST: process.env.DB_HOST ?? config.DB_HOST,
            DB_PORT: process.env.DB_PORT ?? config.DB_PORT,
            DB_USER: process.env.DB_USER ?? config.DB_USER,
            DB_ROOT_PASSWORD: process.env.DB_ROOT_PASSWORD ?? config.DB_ROOT_PASSWORD,
            // Deliberately cleared: the connection must not assume either schema
            // exists yet, since creating them is what this script does.
            DB_DATABASE_NAME: undefined,
        },
    });

    try {
        await databaseManager.init();
        await databaseManager.executeScripts();
        logger.info('Database scripts ran successfully');
        return 0;
    } catch (error) {
        logger.error('Error when try to execute database scripts', error instanceof Error ? error : String(error));
        return 1;
    } finally {
        await databaseManager.close().catch(() => undefined);
    }
}

if (require.main === module) {
    void runMigrations().then((exitCode) => {
        process.exit(exitCode);
    });
}
