// Procedural art of the trick map objects (rails, benches, ramps, stairs), drawn once per map as one small canvas
// image per object at the render scale (so Phaser culls them like any sprite). Flat things on the ground: they sit
// below the players' y-sorted depth.
import { DIR } from './trickCore.js';

const DEPTH = 2;

// Draws every rail, bench, ramp and stairs object of `objects` (tile coordinates); returns the images (destroy them
// and remove their textures through `release`).
export function drawTrickObjects(scene, ctx, objects, bench) {
  const ts = ctx.map.tileSize;
  const out = [];
  for (const o of objects) {
    const box = boxOf(o, ts, bench);
    if (!box) continue;
    const key = `trick-${ctx.world.id}-${o.id}`;
    const sc = ctx.res.scale;
    if (scene.textures.exists(key)) scene.textures.remove(key); // left over from a restarted run
    const tex = scene.textures.createCanvas(key, Math.ceil(box.w * sc), Math.ceil(box.h * sc));
    const c = tex.getContext();
    c.scale(sc, sc);
    c.translate(-box.x, -box.y);
    DRAW[o.type](c, o, ts, bench);
    tex.refresh();
    out.push(scene.add.image(box.x, box.y, key).setOrigin(0).setScale(ctx.res.inv).setDepth(DEPTH));
  }
  return out;
}

export function release(scene, images) {
  for (const img of images) {
    const key = img.texture.key;
    img.destroy();
    scene.textures.remove(key);
  }
  images.length = 0;
}

// Bounding box in px with a small margin for shadows and posts.
function boxOf(o, ts, bench) {
  const pad = 4;
  if (o.type === 'rail') {
    const xs = o.points.map(p => p[0] * ts);
    const ys = o.points.map(p => p[1] * ts);
    const x = Math.min(...xs) - pad - 4;
    const y = Math.min(...ys) - pad - 4;
    return { x, y, w: Math.max(...xs) + pad + 4 - x, h: Math.max(...ys) + pad + 4 - y };
  }
  if (o.type === 'bench' || o.type === 'ramp' || o.type === 'stairs') return { x: o.x * ts - pad, y: o.y * ts - pad, w: o.w * ts + 2 * pad, h: o.h * ts + 2 * pad };
  return null;
}

function rail(c, o, ts) {
  const w = Math.max(2, o.width * ts * 0.35);
  const trace = (dx, dy) => {
    c.beginPath();
    o.points.forEach((p, i) => (i ? c.lineTo(p[0] * ts + dx, p[1] * ts + dy) : c.moveTo(p[0] * ts + dx, p[1] * ts + dy)));
  };
  c.lineCap = c.lineJoin = 'round';
  c.strokeStyle = 'rgba(0,0,0,0.28)';
  c.lineWidth = w + 1;
  trace(1.5, 2);
  c.stroke();
  c.strokeStyle = '#4d5565';
  c.lineWidth = w;
  trace(0, 0);
  c.stroke();
  c.strokeStyle = '#d3dbe8';
  c.lineWidth = Math.max(0.8, w * 0.35);
  trace(0, -0.6);
  c.stroke();
  c.fillStyle = '#2f3440';
  for (let i = 0; i < o.points.length - 1; i++) {
    const [ax, ay] = [o.points[i][0] * ts, o.points[i][1] * ts];
    const [bx, by] = [o.points[i + 1][0] * ts, o.points[i + 1][1] * ts];
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / 26));
    for (let k = 0; k <= n; k++) {
      c.beginPath();
      c.arc(ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n + 1, 1.8, 0, Math.PI * 2);
      c.fill();
    }
  }
}

// The park bench (story 16.9): planks with a lit top edge, dark gaps and a worn joint, iron legs with a light edge, a dithered
// shadow to the lower right and the grindable steel edge with rivets. Whole pixels, no anti-aliasing.
function bench(c, o, ts, cfg) {
  const x = Math.round(o.x * ts);
  const y = Math.round(o.y * ts);
  const w = Math.round(o.w * ts);
  const h = Math.round(o.h * ts);
  const horizontal = w >= h;
  const R = (col, rx, ry, rw = 1, rh = 1) => { c.fillStyle = col; c.fillRect(rx, ry, rw, rh); };
  for (let sy = 0; sy < h + 2; sy++) for (let sx = 0; sx < w + 2; sx++) if (sx >= 2 && sy >= 2 && (sx + sy) % 2 === 0 && (sx >= w - 1 || sy >= h - 1 || sx < 4 || sy < 4)) R('rgba(26,32,70,0.34)', x + sx, y + sy); // checker shadow rim
  R('rgba(26,32,70,0.3)', x + 3, y + 3, w - 3, h - 3);
  const legs = '#35373f';
  if (horizontal) { R(legs, x + 1, y + 1, 2, h - 2); R(legs, x + w - 3, y + 1, 2, h - 2); R('#5a5d66', x + 1, y + 1, 1, h - 2); R('#5a5d66', x + w - 3, y + 1, 1, h - 2); }
  else { R(legs, x + 1, y + 1, w - 2, 2); R(legs, x + 1, y + h - 3, w - 2, 2); R('#5a5d66', x + 1, y + 1, w - 2, 1); R('#5a5d66', x + 1, y + h - 3, w - 2, 1); }
  const planks = Math.max(2, Math.round((horizontal ? h : w) / 4));
  const tones = ['#b07a3f', '#a9783f', '#b8854a', '#a06d38'];
  for (let i = 0; i < planks; i++) {
    const t = tones[(i + o.x * 3 + o.y) % tones.length];
    const p0 = 1 + Math.round(((horizontal ? h : w) - 2) * i / planks);
    const p1 = 1 + Math.round(((horizontal ? h : w) - 2) * (i + 1) / planks);
    if (horizontal) { R(t, x + 1, y + p0, w - 2, p1 - p0 - 1); R('#d2a06a', x + 1, y + p0, w - 2, 1); R('#7d5226', x + 1, y + p1 - 1, w - 2, 1); R('#8c5f2e', x + w - 2, y + p0, 1, p1 - p0); }
    else { R(t, x + p0, y + 1, p1 - p0 - 1, h - 2); R('#d2a06a', x + p0, y + 1, 1, h - 2); R('#7d5226', x + p1 - 1, y + 1, 1, h - 2); R('#8c5f2e', x + p0, y + h - 2, p1 - p0, 1); }
  }
  for (let k = 9; k < (horizontal ? w : h) - 4; k += 11 + ((k * 7) % 4)) { // worn joints and a knot or two
    if (horizontal) { R('#7d5226', x + k, y + 2, 1, 2); R('#8c5f2e', x + k + 4, y + h - 5, 2, 1); } else { R('#7d5226', x + 2, y + k, 2, 1); R('#8c5f2e', x + w - 5, y + k + 4, 1, 2); }
  }
  const inset = Math.round(cfg.inset);
  const half = Math.max(1, Math.round(cfg.width * ts * 0.09));
  c.fillStyle = '#d3dbe8';
  if (horizontal) { R('#d3dbe8', x + inset, y + Math.round(h / 2) - half, w - 2 * inset, half * 2); R('#ffffff', x + inset, y + Math.round(h / 2) - half, w - 2 * inset, 1); R('#8a94a6', x + inset, y + Math.round(h / 2) + half - 1, w - 2 * inset, 1); for (const rx of [inset + 2, w - inset - 3]) R('#5a6272', x + rx, y + Math.round(h / 2) - 1, 1, 1); }
  else { R('#d3dbe8', x + Math.round(w / 2) - half, y + inset, half * 2, h - 2 * inset); R('#ffffff', x + Math.round(w / 2) - half, y + inset, 1, h - 2 * inset); R('#8a94a6', x + Math.round(w / 2) + half - 1, y + inset, 1, h - 2 * inset); for (const ry of [inset + 2, h - inset - 3]) R('#5a6272', x + Math.round(w / 2) - 1, y + ry, 1, 1); }
}

// Arrow marks pointing along `dir` over a rect.
function chevrons(c, x, y, w, h, dir, color) {
  const [dx, dy] = DIR[dir];
  const cx = x + w / 2;
  const cy = y + h / 2;
  const len = Math.abs(dx) * w + Math.abs(dy) * h;
  c.strokeStyle = color;
  c.lineWidth = 1.4;
  c.lineCap = 'round';
  for (const k of [-0.28, 0.1]) {
    const px = cx + dx * len * k;
    const py = cy + dy * len * k;
    c.beginPath();
    c.moveTo(px - dx * 2.5 - dy * 3, py - dy * 2.5 - dx * 3);
    c.lineTo(px + dx * 2.5, py + dy * 2.5);
    c.lineTo(px - dx * 2.5 + dy * 3, py - dy * 2.5 + dx * 3);
    c.stroke();
  }
}

function ramp(c, o, ts) {
  const x = o.x * ts;
  const y = o.y * ts;
  const w = o.w * ts;
  const h = o.h * ts;
  const [dx, dy] = DIR[o.dir];
  c.fillStyle = 'rgba(0,0,0,0.25)';
  c.fillRect(x + 1.5, y + 2, w, h);
  const g = c.createLinearGradient(dx > 0 ? x : dx < 0 ? x + w : x + w / 2, dy > 0 ? y : dy < 0 ? y + h : y + h / 2, dx > 0 ? x + w : dx < 0 ? x : x + w / 2, dy > 0 ? y + h : dy < 0 ? y : y + h / 2);
  g.addColorStop(0, '#6f747e');
  g.addColorStop(0.7, '#a3a8b2');
  g.addColorStop(1, '#cfd4dc');
  c.fillStyle = g;
  c.fillRect(x, y, w, h);
  // shaded sides and a steel coping lip at the launching edge
  c.fillStyle = 'rgba(20,24,32,0.22)';
  if (dx) { c.fillRect(x, y, w, 1.6); c.fillRect(x, y + h - 1.6, w, 1.6); } else { c.fillRect(x, y, 1.6, h); c.fillRect(x + w - 1.6, y, 1.6, h); }
  c.strokeStyle = '#3c404c';
  c.lineWidth = 1.2;
  c.strokeRect(x + 0.6, y + 0.6, w - 1.2, h - 1.2);
  c.fillStyle = '#e4eaf3';
  if (dx) c.fillRect(dx > 0 ? x + w - 2.4 : x, y, 2.4, h); else c.fillRect(x, dy > 0 ? y + h - 2.4 : y, w, 2.4);
  chevrons(c, x, y, w, h, o.dir, '#ffe14d');
}

function stairs(c, o, ts) {
  const x = o.x * ts;
  const y = o.y * ts;
  const w = o.w * ts;
  const h = o.h * ts;
  const [dx, dy] = DIR[o.dir];
  const len = dx ? w : h;
  const step = len / o.steps;
  c.fillStyle = 'rgba(0,0,0,0.22)';
  c.fillRect(x + 1.5, y + 2, w, h);
  for (let i = 0; i < o.steps; i++) {
    const t = i / Math.max(1, o.steps - 1);
    const shade = Math.round(190 - 60 * t);
    c.fillStyle = `rgb(${shade},${shade + 3},${shade + 10})`;
    const a = dx > 0 ? x + i * step : dx < 0 ? x + w - (i + 1) * step : x;
    const b = dy > 0 ? y + i * step : dy < 0 ? y + h - (i + 1) * step : y;
    c.fillRect(a, b, dx ? step : w, dy ? step : h);
    c.fillStyle = 'rgba(255,255,255,0.35)';
    if (dx) c.fillRect(dx > 0 ? a : a + step - 1, b, 1, h); else c.fillRect(a, dy > 0 ? b : b + step - 1, w, 1);
  }
  c.strokeStyle = '#3c404c';
  c.lineWidth = 1.2;
  c.strokeRect(x + 0.6, y + 0.6, w - 1.2, h - 1.2);
  chevrons(c, x, y, w, h, o.dir, 'rgba(255,255,255,0.7)');
}

const DRAW = { rail, bench, ramp, stairs };
