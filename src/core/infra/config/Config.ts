import empire from './data/empire.json';
import jobs from './data/jobs.json';
import { loadEnvFile } from './env';

// Imported first so the process environment is fully populated before any value
// below is read, whichever module happens to load this file.
loadEnvFile();

export type Config = {
    DB_HOST: string;
    DB_PORT: string;
    DB_ROOT_PASSWORD: string;
    DB_DATABASE_NAME?: string;
    DB_USER: string;
    CACHE_HOST: string;
    CACHE_PORT: string;
    CACHE_PING_INTERVAL: number;
    empire: Record<string, { startPosX: string; startPosY: string }>;
    jobs: Record<
        string,
        {
            common: {
                st: number;
                ht: number;
                dx: number;
                iq: number;
                initialHp: number;
                initialMp: number;
                initialStamina: number;
                hpPerLvl: number;
                hpPerHtPoint: number;
                mpPerLvl: number;
                mpPerIqPoint: number;
                initialAttackSpeed: number;
                initialMovementSpeed: number;
                defensePerHtPoint: number;
                attackPerStPoint: number;
                attackPerDXPoint: number;
                attackPerIQPoint: number;
            };
        }
    >;
};

const DEFAULTS = {
    DB_HOST: '127.0.0.1',
    DB_PORT: '3306',
    DB_USER: 'root',
    CACHE_HOST: '127.0.0.1',
    CACHE_PORT: '6379',
    /** node-rediss keepalive ping, in milliseconds. */
    CACHE_PING_INTERVAL: 10_000,
} as const;

function readString(name: string, fallback?: string): string {
    const value = process.env[name];

    if (value !== undefined && value !== '') return value;
    if (fallback !== undefined) return fallback;

    return '';
}

function readNumber(name: string, fallback: number): number {
    const value = process.env[name];
    if (value === undefined || value.trim() === '') return fallback;

    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error(`[CONFIG] ${name} must be a positive number, got: "${value}"`);
    }

    return parsed;
}

const config: Config = {
    DB_HOST: readString('DB_HOST', DEFAULTS.DB_HOST),
    DB_PORT: readString('DB_PORT', DEFAULTS.DB_PORT),
    DB_ROOT_PASSWORD: readString('DB_ROOT_PASSWORD'),
    DB_USER: readString('DB_USER', DEFAULTS.DB_USER),
    CACHE_HOST: readString('CACHE_HOST', DEFAULTS.CACHE_HOST),
    CACHE_PORT: readString('CACHE_PORT', DEFAULTS.CACHE_PORT),
    CACHE_PING_INTERVAL: readNumber('CACHE_PING_INTERVAL', DEFAULTS.CACHE_PING_INTERVAL),
    empire,
    jobs,
};

export const makeConfig = () => config;
