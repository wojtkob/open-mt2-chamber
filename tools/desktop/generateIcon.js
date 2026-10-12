#!/usr/bin/env node
/**
 * Generates the Open MT2 desktop client icon (`desktop/build/icon.png`).
 *
 * Pure Node (no image libraries): draws a torii-gate glyph on a dark rounded
 * square and encodes it as a 512x512 RGBA PNG. electron-builder then derives the
 * Windows `.ico` from it, so no external rasteriser is needed anywhere in the
 * build chain.
 *
 *   node tools/desktop/generateIcon.js [out.png]
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const SIZE = 512;
const CORNER_RADIUS = 96;

const COLORS = {
    // Vertical background gradient (top → bottom).
    bgTop: [16, 20, 30, 255],
    bgBottom: [9, 11, 16, 255],
    // Torii beams (kasagi + nuki).
    beam: [217, 89, 58, 255],
    beamHighlight: [232, 126, 92, 255],
    beamShadow: [166, 62, 38, 255],
    // Pillars + foot blocks.
    pillar: [222, 227, 236, 255],
    pillarShadow: [163, 170, 185, 255],
    pillarOutline: [31, 37, 50, 255],
};

function roundedRectAlpha(x, y) {
    // Distance from the inside of the rounded-rect corner arcs.
    const r = CORNER_RADIUS;
    const left = x < r;
    const right = x >= SIZE - r;
    const top = y < r;
    const bottom = y >= SIZE - r;
    if (!left && !right && !top && !bottom) return 255;
    if ((left && !top && !bottom) || (right && !top && !bottom) || (top && !left && !right) || (bottom && !left && !right)) {
        return 255;
    }
    const cx = left ? r : SIZE - r - 1;
    const cy = top ? r : SIZE - r - 1;
    const dx = x - cx;
    const dy = y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist <= r) return 255;
    if (dist <= r + 1) return Math.round(255 * (r + 1 - dist));
    return 0;
}

function draw(bounds, color, blendAmount = 1) {
    const [x0, y0] = bounds[0];
    const [x1, y1] = bounds[1];
    const [r, g, b] = color;
    for (let y = Math.max(0, y0); y <= Math.min(SIZE - 1, y1); y += 1) {
        for (let x = Math.max(0, x0); x <= Math.min(SIZE - 1, x1); x += 1) {
            const index = (y * SIZE + x) * 4;
            pixels[index] = Math.round(pixels[index] * (1 - blendAmount) + r * blendAmount);
            pixels[index + 1] = Math.round(pixels[index + 1] * (1 - blendAmount) + g * blendAmount);
            pixels[index + 2] = Math.round(pixels[index + 2] * (1 - blendAmount) + b * blendAmount);
        }
    }
}

function main() {
    const outPath = path.resolve(process.argv[2] ?? path.join(__dirname, '..', '..', 'desktop', 'build', 'icon.png'));
    pixels = Buffer.alloc(SIZE * SIZE * 4);

    // Background gradient + rounded-corner alpha mask.
    for (let y = 0; y < SIZE; y += 1) {
        const t = y / (SIZE - 1);
        const bg = COLORS.bgTop.map((channel, i) => Math.round(channel * (1 - t) + COLORS.bgBottom[i] * t));
        for (let x = 0; x < SIZE; x += 1) {
            const index = (y * SIZE + x) * 4;
            pixels[index] = bg[0];
            pixels[index + 1] = bg[1];
            pixels[index + 2] = bg[2];
            pixels[index + 3] = roundedRectAlpha(x, y);
        }
    }

    const center = SIZE / 2;

    // Torii geometry (y grows downwards; the gate reads top → bottom).
    const kasagi = [[center - 180, 120], [center + 180, 158]]; // outer top beam
    const nuki = [[center - 128, 214], [center + 128, 250]]; // second beam under it
    const gakuzuka = [[center - 10, 158], [center + 10, 214]]; // vertical tie between the beams
    const leftPillar = [[center - 190, 158], [center - 158, 386]];
    const rightPillar = [[center + 158, 158], [center + 190, 386]];
    const leftFoot = [[center - 212, 380], [center - 150, 408]];
    const rightFoot = [[center + 150, 380], [center + 212, 408]];

    // Pillars first so the beams overlap them cleanly.
    draw(leftPillar, COLORS.pillar);
    draw(rightPillar, COLORS.pillar);
    draw(leftFoot, COLORS.pillar);
    draw(rightFoot, COLORS.pillar);
    // Inner edge shading gives the pillars volume.
    draw([[center - 190, 158], [center - 184, 386]], COLORS.pillarShadow);
    draw([[center + 184, 158], [center + 190, 386]], COLORS.pillarShadow);

    draw(gakuzuka, COLORS.beam);
    draw(kasagi, COLORS.beam);
    draw(nuki, COLORS.beam);
    // Bevel highlights/shadows.
    draw([[center - 180, 120], [center + 180, 128]], COLORS.beamHighlight);
    draw([[center - 180, 150], [center + 180, 158]], COLORS.beamShadow);
    draw([[center - 128, 214], [center + 128, 222]], COLORS.beamHighlight);
    draw([[center - 128, 242], [center + 128, 250]], COLORS.beamShadow);
    draw([[center - 10, 206], [center + 10, 214]], COLORS.beamShadow);

    // Outline around the whole glyph for contrast on dark backgrounds.
    draw([[center - 180, 116], [center + 180, 120]], COLORS.pillarOutline);
    draw([[center - 180, 158], [center + 180, 162]], COLORS.pillarOutline);
    draw([[center - 184, 158], [center - 180, 386]], COLORS.pillarOutline);
    draw([[center + 180, 158], [center + 184, 386]], COLORS.pillarOutline);

    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    const png = encodePng(SIZE, SIZE, pixels);
    fs.writeFileSync(outPath, png);
    console.log(`[generate-icon] wrote ${outPath} (${png.length} bytes, ${SIZE}x${SIZE})`);
}

/** Reusable module-level pixel buffer. */
let pixels = Buffer.alloc(0);

function encodePng(width, height, rgba) {
    const crcTable = [];
    for (let n = 0; n < 256; n += 1) {
        let c = n;
        for (let k = 0; k < 8; k += 1) {
            c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        }
        crcTable[n] = c >>> 0;
    }
    const crc32 = (buffer) => {
        let crc = 0xffffffff;
        for (const byte of buffer) {
            crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
        }
        return (crc ^ 0xffffffff) >>> 0;
    };
    const chunk = (type, data) => {
        const typeBuffer = Buffer.from(type, 'ascii');
        const length = Buffer.alloc(4);
        length.writeUInt32BE(data.length, 0);
        const crc = Buffer.alloc(4);
        crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
        return Buffer.concat([length, typeBuffer, data, crc]);
    };

    const header = Buffer.alloc(13);
    header.writeUInt32BE(width, 0);
    header.writeUInt32BE(height, 4);
    header[8] = 8; // bit depth
    header[9] = 6; // colour type RGBA
    header[10] = 0; // compression
    header[11] = 0; // filter
    header[12] = 0; // interlace

    const stride = width * 4;
    const raw = Buffer.alloc((stride + 1) * height);
    for (let y = 0; y < height; y += 1) {
        raw[y * (stride + 1)] = 0; // filter type none
        rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
    }

    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', header),
        chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
        chunk('IEND', Buffer.alloc(0)),
    ]);
}

try {
    main();
} catch (error) {
    console.error(`[generate-icon] ${error.message}`);
    process.exit(1);
}