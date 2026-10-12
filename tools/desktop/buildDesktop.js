#!/usr/bin/env node
/**
 * Builds the Open MT2 Windows desktop client.
 *
 * Steps (in order):
 *   1. Build the browser SPA (`npm run build:web`) — the game UI both the web
 *      client and the desktop client render.
 *   2. Bundle the Electron main process, the preload script and the in-process
 *      bridge (which reuses `src/webclient` + `src/client` verbatim) into
 *      `desktop/dist/*.cjs` with esbuild. zero runtime dependencies.
 *   3. Copy the SPA into `desktop/dist/static` and the settings page into
 *      `desktop/dist/settings`.
 *   4. Generate the app icon (pure-Node PNG).
 *   5. Package with electron-builder: NSIS installer + portable executable in
 *      `build/windows/`.
 *
 * Flags:
 *   --skip-package   bundle everything but skip electron-builder (fast loop)
 *   --skip-web       reuse an existing `web/dist` instead of rebuilding the SPA
 *   --arch <arch>    electron-builder target arch (default: host arch)
 *
 * The electron-builder output lands in `build/windows/` (gitignored, like every
 * release artefact the repository produces).
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..', '..');
const desktopRoot = path.join(projectRoot, 'desktop');
const webDist = path.join(projectRoot, 'web', 'dist');
const desktopDist = path.join(desktopRoot, 'dist');

function log(message) {
    console.log(`[desktop] ${message}`);
}

function run(command, args, options = {}) {
    const result = spawnSync(command, args, {
        stdio: options.quiet ? 'pipe' : 'inherit',
        cwd: options.cwd ?? projectRoot,
        shell: process.platform === 'win32',
        encoding: 'utf8',
    });
    if (result.error) throw new Error(`${command} failed to start: ${result.error.message}`);
    if (result.status !== 0) {
        const output = [result.stdout, result.stderr].filter(Boolean).join('\n');
        throw new Error(`${command} exited with code ${result.status}\n${output}`);
    }
    return result.stdout ?? '';
}

function ensureFile(filePath, description) {
    if (!fs.existsSync(filePath)) {
        throw new Error(`Missing ${description}: ${path.relative(projectRoot, filePath)}`);
    }
    return filePath;
}

function copyDirectory(source, target) {
    fs.rmSync(target, { recursive: true, force: true });
    fs.mkdirSync(target, { recursive: true });
    fs.cpSync(source, target, { recursive: true });
    return countFiles(target);
}

function copyFile(source, target) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
}

function countFiles(directory) {
    let total = 0;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        total += entry.isDirectory() ? countFiles(path.join(directory, entry.name)) : 1;
    }
    return total;
}

function parseArgs(argv) {
    const options = {
        skipPackage: false,
        skipWeb: false,
        arch: process.arch === 'arm64' ? 'arm64' : 'x64',
    };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        switch (arg) {
            case '--skip-package':
                options.skipPackage = true;
                break;
            case '--skip-web':
                options.skipWeb = true;
                break;
            case '--arch':
                options.arch = argv[i + 1];
                if (options.arch === undefined) throw new Error('Missing value for --arch');
                i += 1;
                if (!['x64', 'ia32', 'arm64'].includes(options.arch)) {
                    throw new Error(`Unsupported --arch ${options.arch} (expected x64, ia32 or arm64)`);
                }
                break;
            default:
                throw new Error(`Unknown option: ${arg}`);
        }
    }
    return options;
}

async function main() {
    const options = parseArgs(process.argv.slice(2));

    ensureFile(path.join(desktopRoot, 'node_modules', 'esbuild', 'package.json'), 'esbuild install');

    // 1. The SPA.
    if (!options.skipWeb) {
        log('building the browser SPA (npm run build:web)');
        run('npm', ['run', 'build:web'], { cwd: projectRoot });
    }
    ensureFile(path.join(webDist, 'index.html'), 'the web client build (run npm run build:web)');

    // 2. Bundle the Electron code.
    log('bundling main/preload with esbuild');
    fs.rmSync(desktopDist, { recursive: true, force: true });
    fs.mkdirSync(desktopDist, { recursive: true });

    const esbuild = require(path.join(desktopRoot, 'node_modules', 'esbuild'));
    const common = {
        bundle: true,
        platform: 'node',
        format: 'cjs',
        target: 'node22',
        tsconfig: path.join(desktopRoot, 'tsconfig.json'),
        alias: { '@': path.join(projectRoot, 'src') },
        external: ['electron'],
        logLevel: 'info',
        sourcemap: false,
    };

    await esbuild.build({
        ...common,
        entryPoints: [path.join(desktopRoot, 'src', 'main.ts')],
        outfile: path.join(desktopDist, 'main.cjs'),
    });
    await esbuild.build({
        ...common,
        entryPoints: [path.join(desktopRoot, 'src', 'preload.ts')],
        outfile: path.join(desktopDist, 'preload.cjs'),
    });

    // 3. Static assets the shell serves.
    const files = copyDirectory(webDist, path.join(desktopDist, 'static'));
    log(`copied SPA (${files} file(s)) into desktop/dist/static`);
    copyFile(
        path.join(desktopRoot, 'src', 'settings', 'settings.html'),
        path.join(desktopDist, 'settings', 'settings.html'),
    );

    // 4. Icon.
    log('generating the app icon');
    run('node', [path.join(projectRoot, 'tools', 'desktop', 'generateIcon.js')], { cwd: projectRoot });

    if (options.skipPackage) {
        log('--skip-package: electron-builder skipped');
        return;
    }

    // 5. Package (NSIS installer + portable exe).
    const electronBuilderCli = path.join(desktopRoot, 'node_modules', 'electron-builder', 'cli.js');
    ensureFile(electronBuilderCli, 'electron-builder install');

    log(`packaging Windows client (${options.arch})`);
    const env = { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false' };
    const args = ['--win', '--x64'];
    if (options.arch === 'arm64') args.push('--arm64');
    args.push('--publish', 'never');

    const result = spawnSync('node', [electronBuilderCli, ...args], {
        cwd: desktopRoot,
        shell: process.platform === 'win32',
        encoding: 'utf8',
        env,
        stdio: 'inherit',
    });
    if (result.error) throw new Error(`electron-builder failed to start: ${result.error.message}`);
    if (result.status !== 0) {
        throw new Error(`electron-builder exited with code ${result.status}`);
    }

    const outputDir = path.join(projectRoot, 'build', 'windows');
    log(`artefacts written to ${path.relative(projectRoot, outputDir)}`);
}

main().catch((error) => {
    console.error(`[desktop] ${error.message}`);
    process.exit(1);
});