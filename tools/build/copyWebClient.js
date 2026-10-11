#!/usr/bin/env node
/**
 * Copies the built web client SPA (`web/dist`) into the compiled tree at
 * `dist/webclient/static`, so the release tarball, the Debian package and the
 * Docker image — all of which ship `dist/` as a whole — include the browser UI
 * alongside the bridge that serves it.
 *
 * The bridge resolves its static directory as `WEB_CLIENT_DIR` →
 * `<project>/web/dist` → `dist/webclient/static`, and the release install only
 * has the last one, so this step is what makes `open-mt2` installations able to
 * serve the visual client out of the box.
 *
 * The target is wiped first: Vite emits content-hashed asset names, and stale
 * files would otherwise accumulate across builds.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..', '..');
const sourceDir = path.join(projectRoot, 'web', 'dist');
const targetDir = path.join(projectRoot, 'dist', 'webclient', 'static');

function countFiles(directory) {
    let total = 0;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        total += entry.isDirectory() ? countFiles(path.join(directory, entry.name)) : 1;
    }
    return total;
}

function main() {
    const indexHtml = path.join(sourceDir, 'index.html');
    if (!fs.existsSync(indexHtml)) {
        throw new Error(
            `Missing ${path.relative(projectRoot, indexHtml)}; run 'npm run build:web' (or 'npm --prefix web run build') first`,
        );
    }

    fs.rmSync(targetDir, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(targetDir), { recursive: true });
    fs.cpSync(sourceDir, targetDir, { recursive: true });

    console.log(
        `[copy-web-client] copied ${countFiles(targetDir)} file(s) into ${path.relative(projectRoot, targetDir)}`,
    );
}

try {
    main();
} catch (error) {
    console.error(`[copy-web-client] ${error.message}`);
    process.exit(1);
}
