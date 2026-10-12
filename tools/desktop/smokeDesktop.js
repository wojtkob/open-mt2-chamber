#!/usr/bin/env node
/**
 * Live smoke test for the packaged Windows client.
 *
 * Launches the packaged Electron executable with an isolated `--user-data-dir`,
 * watches its log file until the main window is up ("game window ready at ..."),
 * then tears the process tree down. It exercises the real boot path the static
 * `verifyDesktop.js` cannot: Electron main process → in-process BridgeServer →
 * BrowserWindow loading the bundled SPA.
 *
 *   node tools/desktop/smokeDesktop.js [--exe <path>] [--timeout-ms <ms>]
 *
 * Default exe: build/windows/win-unpacked/Open MT2.exe  (after desktop:build)
 */
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..', '..');

function parseArgs(argv) {
    const options = {
        exe: null,
        timeoutMs: 60_000,
    };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        switch (arg) {
            case '--exe':
                options.exe = argv[i + 1];
                if (options.exe === undefined) throw new Error('Missing value for --exe');
                i += 1;
                break;
            case '--timeout-ms':
                options.timeoutMs = Number(argv[i + 1]);
                if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 1_000) {
                    throw new Error(`Invalid --timeout-ms ${argv[i + 1]}`);
                }
                i += 1;
                break;
            default:
                throw new Error(`Unknown option: ${arg}`);
        }
    }
    return options;
}

function killTree(pid) {
    if (process.platform === 'win32') {
        // /T kills the whole process tree (Electron spawns helpers).
        spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
        try {
            process.kill(-pid, 'SIGKILL');
        } catch {
            // Already gone.
        }
    }
}

/** Give the killed process tree a moment to release its handles, then remove the temp profile. */
async function removeUserDataDir(userDataDir) {
    for (let attempt = 0; attempt < 10; attempt += 1) {
        try {
            fs.rmSync(userDataDir, { recursive: true, force: true });
            return;
        } catch {
            // Chromium's cache/journal files can survive the taskkill for a few
            // ticks; retry, and never fail the smoke result over a temp dir.
            await new Promise((resolve) => setTimeout(resolve, 250));
        }
    }
    console.warn(`[smoke] could not remove ${userDataDir} (ignored)`);
}

function waitForReady(logFile, deadline, intervalMs) {
    return new Promise((resolve) => {
        const poll = () => {
            if (fs.existsSync(logFile)) {
                const contents = fs.readFileSync(logFile, 'utf8');
                if (contents.includes('game window ready at')) {
                    resolve(true);
                    return;
                }
            }
            if (Date.now() > deadline) {
                resolve(false);
                return;
            }
            setTimeout(poll, intervalMs);
        };
        poll();
    });
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const defaultExe = path.join(projectRoot, 'build', 'windows', 'win-unpacked', 'Open MT2.exe');
    const exe = options.exe === null ? defaultExe : path.resolve(options.exe);

    if (!fs.existsSync(exe)) {
        throw new Error(`executable not found: ${path.relative(projectRoot, exe)}`);
    }

    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'open-mt2-smoke-'));
    const logFile = path.join(userDataDir, 'logs', 'desktop.log');

    console.log(`[smoke] launching ${path.relative(projectRoot, exe)}`);
    console.log(`[smoke] user-data-dir ${userDataDir}`);

    const child = spawn(exe, [
        `--user-data-dir=${userDataDir}`,
        '--no-single-instance',
        '--log-level',
        'debug',
    ], { stdio: 'ignore', detached: true });

    const deadline = Date.now() + options.timeoutMs;
    const ready = await waitForReady(logFile, deadline, 500);
    const tail = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8').split('\n').slice(-8).join('\n') : '';
    killTree(child.pid);

    if (ready) {
        console.log('[smoke] OK: main window is up and the bridge is serving the SPA');
        await removeUserDataDir(userDataDir);
        return;
    }

    console.error(`[smoke] FAILED: no "game window ready" line within ${options.timeoutMs}ms`);
    if (tail.length > 0) console.error(`[smoke] last log lines:\n${tail}`);
    await removeUserDataDir(userDataDir);
    process.exitCode = 1;
}

main().catch((error) => {
    console.error(`[smoke] ${error.message}`);
    process.exitCode = 1;
});