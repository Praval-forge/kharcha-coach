// Generates icon-192.png and icon-512.png (rounded gradient square with a "K"). Run: node make-icons.mjs
import fs from 'node:fs';
import zlib from 'node:zlib';

const crcTable = Array.from({length: 256}, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = buf => { let c = 0xFFFFFFFF; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); };

const segDist = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};
const cover = d => Math.max(0, Math.min(1, 0.5 - d)); // 1px anti-aliased edge

function icon(N) {
  const px = Buffer.alloc(N * N * 4), r = 0.22 * N, hw = 0.058 * N;
  const segs = [[.34, .25, .34, .75], [.34, .52, .69, .25], [.43, .49, .70, .75]].map(s => s.map(v => v * N));
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const cx = x + 0.5, cy = y + 0.5;
    // rounded-square mask
    const qx = Math.abs(cx - N / 2) - (N / 2 - r), qy = Math.abs(cy - N / 2) - (N / 2 - r);
    const dBox = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
    const a = cover(dBox);
    const t = (cx + cy) / (2 * N);                                   // diagonal gradient #6BE8BF -> #45CBDD
    let R = 0x6B + (0x45 - 0x6B) * t, G = 0xE8 + (0xCB - 0xE8) * t, B = 0xBF + (0xDD - 0xBF) * t;
    const k = Math.max(...segs.map(s => cover(segDist(cx, cy, ...s) - hw)));
    R += (0x0A - R) * k; G += (0x2A - G) * k; B += (0x21 - B) * k;
    const i = (y * N + x) * 4; px[i] = R; px[i + 1] = G; px[i + 2] = B; px[i + 3] = Math.round(a * 255);
  }
  const raw = Buffer.alloc((N * 4 + 1) * N);
  for (let y = 0; y < N; y++) { raw[y * (N * 4 + 1)] = 0; px.copy(raw, y * (N * 4 + 1) + 1, y * N * 4, (y + 1) * N * 4); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(N, 0); ihdr.writeUInt32BE(N, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, {level: 9})), chunk('IEND', Buffer.alloc(0))]);
}

for (const n of [192, 512]) { fs.writeFileSync(new URL(`./icon-${n}.png`, import.meta.url), icon(n)); console.log(`icon-${n}.png`); }
