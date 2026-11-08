// Look metrics (story 16.1, CAP-35): numbers that make "does this still read as plain rectangles" measurable on a
// rendered frame. Pure, no Phaser and no DOM: scripts/shots.mjs serialises computeLookMetrics into the page and runs
// it on canvas pixel reads, scripts/check-lookmetrics.mjs runs it on synthetic images. The function must stay
// self-contained (no outer references) because it is shipped to the page as source text.
//
// All lengths and areas are in base pixels (the 480x270 grid), whatever the render resolution.
//   longestSeamPx       longest unbroken straight colour edge (vertical or horizontal) in the frame
//   largestFlatAreaPx   area of the largest connected region of one (5-bit quantised) colour
//   walkableLuminanceMin / P5   lowest and 5th percentile of the mean luminance (0..1) of the visible walkable tiles
//   meanLuminance       mean luminance of the whole frame
//   distinctColors      number of distinct 5-bit colours (a flat toolbox look has few)
export const LOOK_METRIC_KEYS = ['longestSeamPx', 'longestSeamAxis', 'largestFlatAreaPx', 'largestFlatShare', 'walkableLuminanceMin', 'walkableLuminanceP5', 'meanLuminance', 'distinctColors'];

export function computeLookMetrics(data, w, h, walk) {
  const k = w / 480;
  const SEAM = 40; // summed |dr|+|dg|+|db| between neighbours that counts as an edge
  const r4 = v => Math.round(v * 10000) / 10000;
  // ---- straight seams: runs of consecutive edge pixels along one pixel boundary
  const edge = (a, b) => Math.abs(data[a] - data[b]) + Math.abs(data[a + 1] - data[b + 1]) + Math.abs(data[a + 2] - data[b + 2]) >= SEAM;
  let seam = 0;
  let axis = 'none';
  const vrun = new Int32Array(w); // run length of vertical edges at boundary x | x+1
  for (let y = 0; y < h; y++) {
    let hrun = 0;
    for (let x = 0; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      if (edge(i, i + 4)) {
        if (++vrun[x] > seam) { seam = vrun[x]; axis = 'vertical'; }
      } else vrun[x] = 0;
      if (y < h - 1 && edge(i, i + w * 4)) {
        if (++hrun > seam) { seam = hrun; axis = 'horizontal'; }
      } else hrun = 0;
    }
  }
  // ---- largest flat area: 4-connected flood fill over 5-bit quantised colours
  const q = new Uint16Array(w * h);
  const seen = new Set();
  for (let p = 0, i = 0; p < w * h; p++, i += 4) { q[p] = (data[i] >> 3) << 10 | (data[i + 1] >> 3) << 5 | data[i + 2] >> 3; seen.add(q[p]); }
  const mark = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  let flat = 0;
  for (let s = 0; s < w * h; s++) {
    if (mark[s]) continue;
    let n = 0;
    let sp = 0;
    stack[sp++] = s;
    mark[s] = 1;
    const c = q[s];
    while (sp) {
      const p = stack[--sp];
      n++;
      const x = p % w;
      if (x > 0 && !mark[p - 1] && q[p - 1] === c) { mark[p - 1] = 1; stack[sp++] = p - 1; }
      if (x < w - 1 && !mark[p + 1] && q[p + 1] === c) { mark[p + 1] = 1; stack[sp++] = p + 1; }
      if (p >= w && !mark[p - w] && q[p - w] === c) { mark[p - w] = 1; stack[sp++] = p - w; }
      if (p < w * h - w && !mark[p + w] && q[p + w] === c) { mark[p + w] = 1; stack[sp++] = p + w; }
    }
    if (n > flat) flat = n;
  }
  // ---- luminance
  const lum = (i) => (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
  let total = 0;
  for (let i = 0; i < data.length; i += 4) total += lum(i);
  const tiles = [];
  for (const t of walk || []) {
    const x0 = Math.max(0, Math.round(t.x)), y0 = Math.max(0, Math.round(t.y));
    const x1 = Math.min(w, Math.round(t.x + t.w)), y1 = Math.min(h, Math.round(t.y + t.h));
    if (x1 - x0 < t.w * 0.5 || y1 - y0 < t.h * 0.5) continue; // tiles cut off by the frame edge say little
    let s = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) s += lum((y * w + x) * 4);
    tiles.push(s / ((x1 - x0) * (y1 - y0)));
  }
  tiles.sort((a, b) => a - b);
  return {
    longestSeamPx: r4(seam / k),
    longestSeamAxis: axis,
    largestFlatAreaPx: r4(flat / (k * k)),
    largestFlatShare: r4(flat / (w * h)),
    walkableLuminanceMin: tiles.length ? r4(tiles[0]) : null,
    walkableLuminanceP5: tiles.length ? r4(tiles[Math.floor((tiles.length - 1) * 0.05)]) : null,
    meanLuminance: r4(total / (w * h)),
    distinctColors: seen.size
  };
}
