// Canvas drawing helpers shared by the environment art modules (scenes/EnvArt.js, scenes/BuildingArt.js): everything is authored
// on a 32 unit tile grid (U) and written out at the real tile texture size by emit().
export const U = 32;

export function rng(seed) {
  let s = (seed * 2654435761 + 12345) % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}
export const hash = s => [...s].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7);

export function rgbOf(c) { const n = parseInt(c.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
export function shade(c, t) { // t > 0 lightens, t < 0 darkens
  const target = t > 0 ? 255 : 0;
  const k = Math.abs(t);
  return '#' + rgbOf(c).map(v => Math.round(v + (target - v) * k).toString(16).padStart(2, '0')).join('');
}

export function canvas() {
  const c = document.createElement('canvas');
  c.width = c.height = U;
  return c;
}
export const px = (c, col, x, y, w = 1, h = 1) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
export function ell(c, col, cx, cy, rx, ry) {
  c.fillStyle = col;
  for (let y = Math.floor(cy - ry); y < Math.ceil(cy + ry); y++) {
    const dy = (y + 0.5 - cy) / ry;
    if (Math.abs(dy) >= 1) continue;
    const half = rx * Math.sqrt(1 - dy * dy);
    const x0 = Math.round(cx - half);
    const x1 = Math.round(cx + half);
    if (x1 > x0) c.fillRect(x0, y, x1 - x0, 1);
  }
}

// Writes the 32 unit canvas to a texture of the real size, rotated by quarter turns (0 n, 1 e, 2 s, 3 w).
export function emit(scene, key, src, size, rot = 0) {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.createCanvas(key, size, size);
  const c = tex.getContext();
  c.imageSmoothingEnabled = size < U;
  if (rot === 1) c.translate(size, 0);
  else if (rot === 2) c.translate(size, size);
  else if (rot === 3) c.translate(0, size);
  c.rotate((rot * Math.PI) / 2);
  c.drawImage(src, 0, 0, size, size);
  tex.refresh();
}

