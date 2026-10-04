#!/usr/bin/env node
/* global process */

/**
 * Copies the runtime assets that `tsc` does not emit into `dist/`.
 *
 * `tsc` only writes the JavaScript it compiles plus the JSON files that are
 * statically imported. Three kinds of files are read at runtime through the
 * filesystem instead, and therefore have to be copied explicitly:
 *
 *   - data/attr/**\/*.attr.gz  - per map walkability grids (binary, gzipped)
 *   - data/spawn/**\/*.json    - per map spawn tables (hundreds of files)
 *   - database/scripts/*.sql   - schema + seed statements used by the migrator
 *
 * Without this step the servers still boot from `dist/`, but every map comes up
 * empty and fully walkable - a failure that is easy to miss and impossible to
 * spot from the logs. `tools/verify-dist.js` asserts the copy happened.
 *
 * Run through `npm run build`, or directly: `node tools/copy-assets.js`.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const SOURCE_DIR = path.join(PROJECT_ROOT, 'src');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'dist');

/** Directory trees copied verbatim, relative to src/. */
const COPIED_TREES = [path.join('core', 'infra', 'config', 'data'), path.join('core', 'infra', 'database', 'scripts')];

/** Emitted by tsc itself, so copying them back would only duplicate work. */
const EXCLUDED_EXTENSIONS = new Set(['.ts', '.tsx', '.map', '.js.map']);

function listFiles(directory) {
    const entries = fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    const files = [];

    for (const entry of entries) {
        const fullPath = path.join(directory, entry.name);

        if (entry.isDirectory()) {
            files.push(...listFiles(fullPath));
            continue;
        }

        if (!entry.isFile()) continue;
        if (EXCLUDED_EXTENSIONS.has(path.extname(entry.name))) continue;

        files.push(fullPath);
    }

    return files;
}

function copyTree(relativeTree) {
    const source = path.join(SOURCE_DIR, relativeTree);
    const destination = path.join(OUTPUT_DIR, relativeTree);

    if (!fs.existsSync(source)) {
        console.warn(`[copy-assets] skipped missing directory: ${path.relative(PROJECT_ROOT, source)}`);
        return 0;
    }

    const files = listFiles(source);
    let copied = 0;

    for (const file of files) {
        const target = path.join(destination, path.relative(source, file));
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(file, target);
        copied++;
    }

    console.log(
        `[copy-assets] ${path.relative(PROJECT_ROOT, source)} -> ${path.relative(PROJECT_ROOT, destination)} (${copied} file(s))`,
    );
    return copied;
}

function main() {
    if (!fs.existsSync(OUTPUT_DIR)) {
        console.error('[copy-assets] dist/ not found. Run "tsc -p tsconfig.build.json" first.');
        process.exit(1);
    }

    let total = 0;

    for (const tree of COPIED_TREES) {
        total += copyTree(tree);
    }

    console.log(`[copy-assets] done, ${total} asset(s) copied into dist/`);
}

main();