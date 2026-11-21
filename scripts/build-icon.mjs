#!/usr/bin/env node
// Renders assets/icon.png (512 x 512) from the same geometry as assets/logo.svg.
// No dependency: shapes are rasterized with 4 x 4 supersampling and encoded
// as PNG with node:zlib. Run: node scripts/build-icon.mjs

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const SIZE = Number(process.argv[2]) || 512;
const S = SIZE / 64;
const hex = (h, a = 1) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), a];
const INK = hex('#161a2c');
const TEAL = hex('#2fc2b9');
const AMBER = hex('#f0ad4e');
const RING = [255, 255, 255, 0.16];
const C = 32;
const R = 21;
const NODES = [[32, 11], [50.2, 42.5], [13.8, 42.5]];
// Arc spans (degrees, 0 = east, counter clockwise in screen coordinates is negative y)
const ARCS = [[-90, -30], [30, 90], [150, 210]];

function insideRoundRect(x, y) {
  const r = 14;
  const cx = Math.min(Math.max(x, r), 64 - r);
  const cy = Math.min(Math.max(y, r), 64 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r && x >= 0 && x <= 64 && y >= 0 && y <= 64;
}

function onArc(x, y, width) {
  const d = Math.hypot(x - C, y - C);
  if (Math.abs(d - R) > width / 2) return false;
  let a = (Math.atan2(y - C, x - C) * 180) / Math.PI;
  for (const [s, e] of ARCS) {
    let aa = a;
    while (aa < s) aa += 360;
    if (aa <= e) return true;
  }
  // round caps
  for (const [s, e] of ARCS) for (const deg of [s, e]) {
    const px = C + R * Math.cos((deg * Math.PI) / 180);
    const py = C + R * Math.sin((deg * Math.PI) / 180);
    if (Math.hypot(x - px, y - py) <= width / 2) return true;
  }
  return false;
}

function sample(x, y) {
  // Painter's order: background, ring, arcs, core, node outlines, nodes.
  let col = [0, 0, 0, 0];
  const over = (c) => {
    const a = c[3] + col[3] * (1 - c[3]);
    if (a === 0) return;
    col = [0, 1, 2].map((i) => (c[i] * c[3] + col[i] * col[3] * (1 - c[3])) / a).concat(a);
  };
  if (!insideRoundRect(x, y)) return col;
  over(INK);
  if (Math.abs(Math.hypot(x - C, y - C) - R) <= 1.2) over(RING);
  if (onArc(x, y, 3.2)) over(TEAL);
  if (Math.hypot(x - C, y - C) <= 8) over(TEAL);
  for (const [nx, ny] of NODES) {
    const d = Math.hypot(x - nx, y - ny);
    if (d <= 5.8) over(INK);
    if (d <= 4.8) over(AMBER);
  }
  return col;
}

const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE);
const SS = 4;
for (let py = 0; py < SIZE; py++) {
  raw[py * (SIZE * 4 + 1)] = 0;
  for (let px = 0; px < SIZE; px++) {
    let acc = [0, 0, 0, 0];
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const c = sample((px + (sx + 0.5) / SS) / S, (py + (sy + 0.5) / SS) / S);
      acc = [acc[0] + c[0] * c[3], acc[1] + c[1] * c[3], acc[2] + c[2] * c[3], acc[3] + c[3]];
    }
    const a = acc[3] / (SS * SS);
    const o = py * (SIZE * 4 + 1) + 1 + px * 4;
    raw[o] = a ? Math.round(acc[0] / acc[3]) : 0;
    raw[o + 1] = a ? Math.round(acc[1] / acc[3]) : 0;
    raw[o + 2] = a ? Math.round(acc[2] / acc[3]) : 0;
    raw[o + 3] = Math.round(a * 255);
  }
}

function crc32(buf) {
  let c;
  let crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8;
ihdr[9] = 6;
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
const out = path.join(process.cwd(), 'assets', SIZE === 512 ? 'icon.png' : `icon-${SIZE}.png`);
fs.writeFileSync(out, png);
console.log(`icon written: ${out} (${png.length} bytes)`);
