#!/usr/bin/env node
/**
 * Verifies the Open MT2 Windows desktop client artefacts and writes
 * `SHA256SUMS` next to them.
 *
 * The packaging step (`tools/desktop/buildDesktop.js`) emits three artefacts
 * into `build/windows/`:
 *
 *   OpenMT2-Setup-<version>-<arch>.exe       NSIS installer
 *   OpenMT2-Portable-<version>-<arch>.exe    single-file portable client
 *   open-mt2-windows-<version>-<arch>.zip    win-unpacked directory, zipped
 *
 * The zip is the one that can be verified deeply without running a GUI. This
 * script reads the zip's central directory in pure Node (no Python, no zip
 * tooling), cross-checks every entry against the `win-unpacked/` tree that
 * electron-builder leaves on disk on the way to producing the zip, and asserts
 * that every file the app needs at runtime is present inside
 * `resources/app.asar` by parsing the asar header directly.
 *
 *   node tools/desktop/verifyDesktop.js [--arch x64]
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const projectRoot = path.resolve(__dirname, '..', '..');
const pkg = require(path.join(projectRoot, 'desktop', 'package.json'));
const outputDir = path.join(projectRoot, 'build', 'windows');

/** Files that must be present inside `resources/app.asar` (relative paths). */
const REQUIRED_ASAR_FILES = [
    'dist/main.cjs',
    'dist/preload.cjs',
    'dist/static/index.html',
    'dist/settings/settings.html',
    'package.json',
];

function die(message) {
    console.error(`[verify-windows-client] ${message}`);
    process.exit(1);
}

function log(message) {
    console.log(`[verify-windows-client] ${message}`);
}

function parseArgs(argv) {
    const args = { arch: process.arch === 'arm64' ? 'arm64' : 'x64' };
    for (let i = 0; i < argv.length; i += 1) {
        if (argv[i] === '--arch') {
            args.arch = argv[i + 1];
            i += 1;
        }
    }
    return args;
}

function readFile(pathName) {
    return fs.readFileSync(pathName);
}

/**
 * Read the file list of an asar archive.
 *
 * The asar header is a JSON object (`{ "files": … }`) preceded by length-prefix
 * fields whose exact layout has shifted across Electron versions. Instead of
 * hardcoding an offset, scan the first 64 KiB for the `{"files":` marker and
 * use the `u32le` immediately before it (the header string length) to read the
 * exact JSON blob, then walk the tree.
 */
function readAsarFileList(asarPath) {
    const fd = fs.openSync(asarPath, 'r');
    try {
        const preview = Buffer.alloc(64 * 1024);
        const read = fs.readSync(fd, preview, 0, preview.length, 0);
        const haystack = preview.subarray(0, read);
        const marker = Buffer.from('{"files":');
        const markerIndex = haystack.indexOf(marker);
        if (markerIndex === -1 || markerIndex < 4) {
            throw new Error('asar header JSON not found');
        }
        const jsonLength = haystack.readUInt32LE(markerIndex - 4);
        if (jsonLength < marker.length || jsonLength > 64 * 1024 * 1024) {
            throw new Error(`implausible asar header length ${jsonLength}`);
        }
        const header = Buffer.alloc(jsonLength);
        fs.readSync(fd, header, 0, jsonLength, markerIndex);
        const parsed = JSON.parse(header.toString('utf8'));
        const files = parsed.files ?? {};
        const paths = [];
        const walk = (node, prefix) => {
            for (const [name, info] of Object.entries(node)) {
                const full = prefix === '' ? name : `${prefix}/${name}`;
                if (info !== null && typeof info === 'object' && info.files !== undefined) {
                    walk(info.files, full);
                } else {
                    paths.push(full);
                }
            }
        };
        walk(files, '');
        return paths;
    } finally {
        fs.closeSync(fd);
    }
}

/**
 * List the entries of a `.zip` archive by parsing the End-of-Central-Directory
 * record and the central directory. Returns `{ name, size }` where `size` is
 * the uncompressed size; directory entries end with `/`. This keeps the verify
 * chain dependency-free (no Python, no unzip binary) and validates the archive
 * structure without extracting anything.
 */
function listZipEntries(zipPath) {
    const buffer = readFile(zipPath);
    if (buffer.length < 22) throw new Error('file is too small to be a zip archive');

    // EOCD: the 22-byte record sits in the last 65557 bytes (comment max 65535).
    const eocdStart = Math.max(0, buffer.length - 22 - 65_535);
    let eocdOffset = -1;
    for (let offset = buffer.length - 22; offset >= eocdStart; offset -= 1) {
        if (buffer.readUInt32LE(offset) === 0x06054b50) {
            eocdOffset = offset;
            break;
        }
    }
    if (eocdOffset === -1) throw new Error('End-of-Central-Directory record not found');

    const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
    let cursor = buffer.readUInt32LE(eocdOffset + 16); // central directory offset
    const entries = [];
    for (let index = 0; index < totalEntries; index += 1) {
        if (buffer.readUInt32LE(cursor) !== 0x02014b50) {
            throw new Error(`corrupt central directory entry at index ${index}`);
        }
        const method = buffer.readUInt16LE(cursor + 10);
        const size = buffer.readUInt32LE(cursor + 24);
        const nameLength = buffer.readUInt16LE(cursor + 28);
        const extraLength = buffer.readUInt16LE(cursor + 30);
        const commentLength = buffer.readUInt16LE(cursor + 32);
        const name = buffer.toString('utf8', cursor + 46, cursor + 46 + nameLength);
        entries.push({ name, size, method });
        cursor += 46 + nameLength + extraLength + commentLength;
    }
    return entries;
}

function verifyZip(zip) {
    const unpackedDir = path.join(outputDir, 'win-unpacked');
    if (!fs.existsSync(unpackedDir)) {
        die(`missing win-unpacked directory (${path.relative(projectRoot, unpackedDir)}); run desktop:build first`);
    }

    log(`checking ${path.relative(projectRoot, zip)} archive contents`);
    let entries;
    try {
        entries = listZipEntries(zip);
    } catch (error) {
        die(`could not read ${path.relative(projectRoot, zip)}: ${error.message}`);
    }

    const exeName = `${pkg.build && pkg.build.productName ? pkg.build.productName : 'Open MT2'}.exe`;
    const byName = new Map(entries.map((entry) => [entry.name, entry]));
    // electron-builder zips the win-unpacked directory's *contents*, so the
    // archive root is the unpacked app (no wrapping directory).
    const expectedFiles = [exeName, 'resources/app.asar'];
    for (const required of expectedFiles) {
        if (!byName.has(required)) {
            die(`missing ${required} in ${path.relative(projectRoot, zip)}`);
        }
    }

    const exeEntry = byName.get(exeName);
    if (exeEntry.size < 50 * 1024 * 1024) {
        die(`suspiciously small Electron executable (${exeEntry.size} bytes)`);
    }

    // Cross-check every file entry against the on-disk win-unpacked tree so the
    // archive is not just "contains a plausible exe + asar" but matches the
    // built output byte-for-byte in size.
    let checked = 0;
    for (const entry of entries) {
        if (entry.name.endsWith('/')) continue; // directory marker
        const rel = entry.name;
        if (rel.includes('..') || path.isAbsolute(rel)) {
            die(`zip entry escapes the archive root: ${entry.name}`);
        }
        const diskPath = path.join(unpackedDir, rel);
        let stat;
        try {
            stat = fs.statSync(diskPath);
        } catch {
            die(`zip entry has no on-disk twin: ${entry.name}`);
        }
        if (!stat.isFile() || stat.size !== entry.size) {
            die(`zip entry size mismatch for ${entry.name}: ${entry.size} in zip, ${stat.size} on disk`);
        }
        checked += 1;
    }
    log(`zip verified (${entries.length} entries, ${checked} file entries match win-unpacked)`);

    const asarPath = path.join(unpackedDir, 'resources', 'app.asar');
    if (!fs.existsSync(asarPath)) {
        die('missing resources/app.asar next to the executable');
    }
    const files = readAsarFileList(asarPath);
    const missing = REQUIRED_ASAR_FILES.filter((required) => !files.includes(required));
    if (missing.length > 0) {
        die(`app.asar is missing runtime files: ${missing.join(', ')}`);
    }
    log(`app.asar verified (${files.length} files, ${REQUIRED_ASAR_FILES.length} required)`);
}

function sha256sum(filePath) {
    return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function main() {
    const { arch } = parseArgs(process.argv.slice(2));
    const version = pkg.version;

    if (!fs.existsSync(outputDir)) {
        die(`no artefacts found in ${path.relative(projectRoot, outputDir)}`);
    }

    const installer = path.join(outputDir, `OpenMT2-Setup-${version}-${arch}.exe`);
    const portable = path.join(outputDir, `OpenMT2-Portable-${version}-${arch}.exe`);
    const zip = path.join(outputDir, `open-mt2-windows-${version}-${arch}.zip`);

    for (const [file, label] of [
        [installer, 'NSIS installer'],
        [portable, 'portable client'],
        [zip, 'win-unpacked archive'],
    ]) {
        if (!fs.existsSync(file)) die(`missing ${label}: ${path.relative(projectRoot, file)}`);
        const stat = fs.statSync(file);
        if (stat.size < 1024 * 1024) die(`${label} is suspiciously small (${stat.size} bytes)`);
        log(`${label}: ${stat.size.toLocaleString('en-US')} bytes`);
    }

    verifyZip(zip);

    const sums = [installer, portable, zip]
        .map((file) => `${sha256sum(file)}  ${path.basename(file)}`)
        .join('\n');
    fs.writeFileSync(path.join(outputDir, 'SHA256SUMS'), `${sums}\n`);
    log(`SHA256SUMS written (${path.relative(projectRoot, path.join(outputDir, 'SHA256SUMS'))})`);
    log('Windows client artefacts verified');
}

main();