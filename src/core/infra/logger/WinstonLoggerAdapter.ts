import * as fs from 'node:fs';
import * as path from 'node:path';
import winston from 'winston';
import Logger from '@/core/infra/logger/Logger';
import { loadEnvFile } from '@/core/infra/config/env';

// Imported first so LOG_LEVEL and LOG_DIR are readable below.
loadEnvFile();

const DEFAULT_LOG_DIR = 'logs';

function resolveLogDir(): string {
    const configured = process.env.LOG_DIR;

    if (configured && configured.trim() !== '') {
        return path.isAbsolute(configured) ? configured : path.resolve(process.cwd(), configured);
    }

    return path.resolve(process.cwd(), DEFAULT_LOG_DIR);
}

export default class WinstonLoggerAdapter implements Logger {
    private readonly logger: winston.Logger;

    constructor() {
        const logDir = resolveLogDir();

        // winston creates the log files but not their directory, which fails the
        // first write on a packaged install where the working directory is
        // owned by root and only the log directory is writable by the service
        // user.
        fs.mkdirSync(logDir, { recursive: true });

        this.logger = winston.createLogger({
            level: process.env.LOG_LEVEL || 'info',
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.errors({
                    stack: true,
                }),
                winston.format.json(),
            ),
            transports: [
                new winston.transports.File({
                    filename: path.join(logDir, 'error.log'),
                    level: 'error',
                }),
                new winston.transports.File({
                    filename: path.join(logDir, 'info.log'),
                    level: 'info',
                }),
                new winston.transports.Console(),
            ],
        });
    }

    info(message: string, ...params: any): void {
        this.logger.info(message, params);
    }
    warn(message: string, ...params: any): void {
        this.logger.warn(message, params);
    }
    error(param: Error | string, ...params: any): void {
        if (param instanceof Error) {
            this.logger.error(param);
            return;
        }

        this.logger.error(param as string, params);
    }
    debug(message: string, ...params: any): void {
        this.logger.debug(message, params);
    }
}
