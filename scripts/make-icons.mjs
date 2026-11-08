// Draws the app icons (icons/icon-192.png, icons/icon-512.png, icons/icon-maskable-512.png) without any library: a night-blue square, a yellow
// school bell shape and a small road, written as PNG by hand (zlib + CRC). Run: node scripts/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = buf => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};

function png(size, maskable) {
  const px = Buffer.alloc(size * size * 3);
  const set = (x, y, r, g, b) => { const i = (y * size + x) * 3; px[i] = r; px[i + 1] = g; px[i + 2] = b; };
  const pad = maskable ? 0 : size * 0.06; // a maskable icon fills the whole square (the platform crops it)
  const radius = maskable ? 0 : size * 0.18;
  const cx = size / 2;
  const cy = size * 0.46;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // background: sky gradient, rounded corners drawn in the page colour for the plain icon
      const t = y / size;
      let col = [Math.round(24 + 30 * t), Math.round(32 + 50 * t), Math.round(78 + 70 * t)];
      const dx = Math.max(pad + radius - x, 0, x - (size - pad - radius));
      const dy = Math.max(pad + radius - y, 0, y - (size - pad - radius));
      if (!maskable && (x < pad || y < pad || x > size - pad || y > size - pad || Math.hypot(dx, dy) > radius)) col = [16, 19, 28];
      // the road at the bottom
      if (y > size * 0.74 && y < size * 0.92) col = [74, 77, 85];
      if (y > size * 0.82 && y < size * 0.84 && Math.floor(x / (size * 0.1)) % 2 === 0) col = [240, 220, 120];
      // the bell: a dome and a clapper
      const d = Math.hypot(x - cx, (y - cy) * 1.1);
      if (d < size * 0.26 && y < cy + size * 0.12) col = [255, 205, 40];
      if (y >= cy + size * 0.12 && y < cy + size * 0.2 && Math.abs(x - cx) < size * 0.3) col = [235, 180, 30];
      if (Math.hypot(x - cx, y - (cy + size * 0.27)) < size * 0.05) col = [200, 140, 20];
      if (d < size * 0.26 && x < cx - size * 0.08 && y < cy - size * 0.05 && d > size * 0.18) col = [255, 235, 140];
      set(x, y, ...col);
    }
  }
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) { raw[y * (size * 3 + 1)] = 0; px.copy(raw, y * (size * 3 + 1) + 1, y * size * 3, (y + 1) * size * 3); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

mkdirSync(new URL('../icons/', import.meta.url), { recursive: true });
for (const [name, size, maskable] of [['icon-192.png', 192, false], ['icon-512.png', 512, false], ['icon-maskable-512.png', 512, true]]) writeFileSync(new URL(`../icons/${name}`, import.meta.url), png(size, maskable));
console.log('icons written');
