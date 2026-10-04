#!/usr/bin/env node
/* global process */

/**
 * Release gate for the compiled output.
 *
 * `npm run build` emits the JavaScript; this checks that what an ARM64 host
 * actually needs at runtime is also there and loadable:
 *
 *   - the non-TypeScript assets (map grids, spawn tables, schema script)
 *   - every statically imported JSON config
 *   - both dependency-injection containers resolve, i.e. `tsc-alias` rewrote
 *     every `@/` path alias into a relative one
 *   - every compiled quest module loads, since quests are `require`d at runtime
 *     and a missing import there would only surface when a player walks into an
 *     NPC
 *   - the entry points parse under the running Node
 *
 * Exits non-zero on the first failure so it can gate a release build.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// dist/ is CommonJS, so it has to be loaded through require, not import.
const requireDist = createRequire(path.join(__dirname, 'noop.js'));

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DIST_DIR = path.join(PROJECT_ROOT, 'dist');
const DATA_DIR = path.join(DIST_DIR, 'core', 'infra', 'config', 'data');

const ENTRY_POINTS = [path.join('auth', 'main.js'), path.join('game', 'main.js'), path.join('cli', 'migrate.js')];

const failures = [];

function fail(message) {
    failures.push(message);
}

function countFiles(directory, predicate = () => true) {
    if (!fs.existsSync(directory)) return 0;

    let count = 0;
    const stack = [directory];

    while (stack.length > 0) {
        const current = stack.pop();

        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
            const fullPath = path.join(current, entry.name);
            if (entry.isDirectory()) stack.push(fullPath);
            else if (entry.isFile() && predicate(fullPath)) count++;
        }
    }

    return count;
}

function requireModule(relativePath) {
    const fullPath = path.join(DIST_DIR, relativePath);

    if (!fs.existsSync(fullPath)) {
        fail(`missing module: dist/${relativePath}`);
        return;
    }

    try {
        requireDist(fullPath);
    } catch (error) {
        fail(`cannot load dist/${relativePath}: ${error.message}`);
    }
}

function checkSyntax() {
    for (const relative of ENTRY_POINTS) {
        const file = path.join(DIST_DIR, relative);

        if (!fs.existsSync(file)) {
            fail(`missing entry point: dist/${relative}`);
            continue;
        }

        try {
            execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
        } catch (error) {
            fail(`syntax error in dist/${relative}: ${error.stderr?.toString().trim()}`);
        }
    }

    console.log(`[verify-dist] syntax checked ${ENTRY_POINTS.length} entry point(s)`);
}

function checkAssets() {
    const attrCount = countFiles(path.join(DATA_DIR, 'attr'), (file) => file.endsWith('.attr.gz'));
    const spawnCount = countFiles(path.join(DATA_DIR, 'spawn'), (file) => file.endsWith('.json'));
    const sqlCount = countFiles(path.join(DIST_DIR, 'core', 'infra', 'database', 'scripts'), (file) =>
        file.endsWith('.sql'),
    );

    if (attrCount === 0) fail('no map grids (*.attr.gz) under dist/core/infra/config/data/attr');
    if (spawnCount === 0) fail('no spawn tables (*.json) under dist/core/infra/config/data/spawn');
    if (sqlCount === 0) fail('no database script (*.sql) under dist/core/infra/database/scripts');

    console.log(
        `[verify-dist] assets: ${attrCount} map grid(s), ${spawnCount} spawn table(s), ${sqlCount} sql script(s)`,
    );
}

function checkJsonConfigs() {
    const required = [
        'atlasinfo.json',
        'empire.json',
        'general.json',
        'items.json',
        'jobs.json',
        'mobs.json',
        'npc_shops.json',
        path.join('animation', 'animations.json'),
        path.join('drop', 'common_drops.json'),
        path.join('spawn', 'group.json'),
        path.join('spawn', 'group_group.json'),
    ];

    for (const relative of required) {
        const fullPath = path.join(DATA_DIR, relative);

        if (!fs.existsSync(fullPath)) {
            fail(`missing config asset: dist/core/infra/config/data/${relative}`);
            continue;
        }

        try {
            JSON.parse(fs.readFileSync(fullPath, 'utf8'));
        } catch (error) {
            fail(`invalid JSON in dist/core/infra/config/data/${relative}: ${error.message}`);
        }
    }
}

function checkMigrator() {
    if (!fs.existsSync(path.join(DIST_DIR, 'cli', 'migrate.js'))) {
        fail('missing compiled migrator: dist/cli/migrate.js');
    }
}

function checkContainers() {
    requireModule(path.join('auth', 'Container.js'));
    requireModule(path.join('game', 'Container.js'));
}

function checkQuests() {
    const questsDir = path.join(DIST_DIR, 'core', 'domain', 'quests', 'quests');
    const quests = fs.existsSync(questsDir)
        ? fs.readdirSync(questsDir).filter((file) => file.endsWith('.js'))
        : [];

    if (quests.length === 0) {
        fail('no compiled quest modules under dist/core/domain/quests/quests');
        return;
    }

    for (const quest of quests) {
        const fullPath = path.join(questsDir, quest);

        try {
            requireDist(fullPath);
        } catch (error) {
            fail(`cannot load quest module dist/core/domain/quests/quests/${quest}: ${error.message}`);
        }
    }

    console.log(`[verify-dist] loaded ${quests.length} quest module(s)`);
}

function report() {
    if (failures.length === 0) {
        console.log('[verify-dist] OK: dist/ is complete and loadable');
        return;
    }

    console.error(`[verify-dist] ${failures.length} problem(s) found:`);
    for (const failure of failures) {
        console.error(`  - ${failure}`);
    }
    process.exit(1);
}

function main() {
    if (!fs.existsSync(DIST_DIR)) {
        fail('dist/ not found, run "npm run build" first');
        report();
        return;
    }

    checkSyntax();
    checkAssets();
    checkJsonConfigs();
    checkMigrator();
    checkContainers();
    checkQuests();
    report();
}

main();