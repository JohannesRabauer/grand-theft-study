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

function bench(c, o, ts, cfg) {
  const x = o.x * ts;
  const y = o.y * ts;
  const w = o.w * ts;
  const h = o.h * ts;
  const horizontal = w >= h;
  c.fillStyle = 'rgba(0,0,0,0.25)';
  c.fillRect(x + 1.5, y + 2, w, h);
  c.fillStyle = '#35373f';
  if (horizontal) { c.fillRect(x + 1, y + 1, 2, h - 2); c.fillRect(x + w - 3, y + 1, 2, h - 2); } else { c.fillRect(x + 1, y + 1, w - 2, 2); c.fillRect(x + 1, y + h - 3, w - 2, 2); }
  c.fillStyle = '#b07a3f';
  c.fillRect(x + 1.5, y + 1.5, w - 3, h - 3);
  c.strokeStyle = '#7d5226';
  c.lineWidth = 0.7;
  const planks = Math.max(2, Math.round((horizontal ? h : w) / 4));
  for (let i = 1; i < planks; i++) {
    c.beginPath();
    if (horizontal) { c.moveTo(x + 1.5, y + 1.5 + ((h - 3) * i) / planks); c.lineTo(x + w - 1.5, y + 1.5 + ((h - 3) * i) / planks); } else { c.moveTo(x + 1.5 + ((w - 3) * i) / planks, y + 1.5); c.lineTo(x + 1.5 + ((w - 3) * i) / planks, y + h - 1.5); }
    c.stroke();
  }
  // the grindable steel edge along the middle
  c.strokeStyle = '#d3dbe8';
  c.lineWidth = Math.max(1, cfg.width * ts * 0.18);
  c.beginPath();
  if (horizontal) { c.moveTo(x + cfg.inset, y + h / 2); c.lineTo(x + w - cfg.inset, y + h / 2); } else { c.moveTo(x + w / 2, y + cfg.inset); c.lineTo(x + w / 2, y + h - cfg.inset); }
  c.stroke();
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
