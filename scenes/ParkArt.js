// Procedural art of the skatepark (story 5.4, AD-14, AD-28): a concrete plaza of slabs with joints, stains and scuffs, the
// drawn-only bodies (funbox, bowl), the manual pad, the bank-spot ring, gate posts, kid-safe graffiti and, in ?debug, the
// arrows of the trick lines, all painted once into one ground canvas; lamp posts, bike rack and the hint sign are small
// y-sorted sprites. Every canvas is drawn at the render scale (ctx.res.scale) and shown at its inverse, like the trick
// objects (vehicles/trickArt.js, which draws the ramps, rails, benches and stairs on top of the ground canvas). The
// finest detail (stains, scuffs) is skipped on Low (scale 1). Nothing is loaded; the layout is data/park.json.
import { darken, lighten } from './HiResArt.js';

const FLOOR_DEPTH = 1; // above the ground, below the trick objects (depth 2) and everything y-sorted
const CONCRETE = '#9a9ea6';
const STEEL = '#d3dbe8';
const TAU = Math.PI * 2;

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Draws the whole park of the current map; returns { images, keys } for `release`.
export function drawPark(scene, ctx, cfg) {
  const ts = ctx.map.tileSize;
  const sc = ctx.res.scale;
  const objects = ctx.map.objects;
  const out = { images: [], keys: [] };
  const make = (key, x, y, w, h, draw) => {
    if (scene.textures.exists(key)) scene.textures.remove(key); // left over from a restarted run
    const tex = scene.textures.createCanvas(key, Math.ceil(w * sc), Math.ceil(h * sc));
    const c = tex.getContext();
    c.scale(sc, sc);
    draw(c);
    tex.refresh();
    out.keys.push(key);
    return scene.add.image(x, y, key).setScale(ctx.res.inv);
  };

  const f = cfg.floor;
  const fx = f.x * ts;
  const fy = f.y * ts;
  out.images.push(make(`park-${ctx.world.id}-floor`, fx, fy, f.w * ts, f.h * ts, c => {
    c.translate(-fx, -fy);
    floor(c, cfg, ts, sc, f);
    for (const p of cfg.pieces) PIECE[p.kind](c, p, ts);
    for (const o of objects) if (o.type === 'manual-pad') pad(c, o, ts);
    for (const o of objects) if (o.type === 'bank-spot') bankSpot(c, o, ts);
    for (const g of cfg.gates) gate(c, g, ts);
    for (const d of cfg.decals) decal(c, d, ts);
    if (window.SCHULWEG_DEBUG) for (const o of objects) if (o.type === 'trick-line') line(c, o, ts);
  }).setOrigin(0).setDepth(FLOOR_DEPTH));

  // y-sorted props: feet at the object's tile centre (a little low, like the other standing sprites)
  for (const o of objects) {
    const sprite = SPRITE[o.type];
    if (!sprite) continue;
    const cx = (o.x + 0.5) * ts;
    const cy = (o.y + 0.5) * ts + 3;
    const { w, h } = sprite;
    const img = make(`park-${ctx.world.id}-${o.id}`, cx, cy, w, h, c => sprite.draw(c, w, h, o)).setOrigin(0.5, (h - 3) / h).setDepth(cy);
    out.images.push(img);
  }
  return out;
}

export function release(scene, art) {
  for (const img of art.images) img.destroy();
  for (const key of art.keys) scene.textures.remove(key);
  art.images.length = art.keys.length = 0;
}

// ---- ground
function floor(c, cfg, ts, sc, f) {
  const slab = cfg.slab;
  const x0 = f.x * ts;
  const y0 = f.y * ts;
  const x1 = (f.x + f.w) * ts;
  const y1 = (f.y + f.h) * ts;
  const r = rng(5400 + f.x * 31 + f.y);
  // the plaza itself is the concrete tiles of the map; slabs only add tone and joints over the sidewalk-grey ground
  for (let y = y0; y < y1; y += slab) {
    for (let x = x0; x < x1; x += slab) {
      const v = r();
      c.fillStyle = v < 0.3 ? 'rgba(255,255,255,0.045)' : v < 0.55 ? 'rgba(40,44,52,0.05)' : 'rgba(0,0,0,0)';
      c.fillRect(x, y, slab, slab);
    }
  }
  c.lineWidth = 0.7;
  for (let x = x0; x <= x1; x += slab) joint(c, x, y0, x, y1);
  for (let y = y0; y <= y1; y += slab) joint(c, x0, y, x1, y);
  if (sc < 2) return;
  for (let i = 0; i < 26; i++) { // oil stains and tyre scuffs
    const x = x0 + r() * (x1 - x0);
    const y = y0 + r() * (y1 - y0);
    if (i % 3 === 0) {
      c.fillStyle = 'rgba(30,34,42,0.07)';
      c.beginPath();
      c.ellipse(x, y, 3 + r() * 5, 2 + r() * 3, r() * 3, 0, TAU);
      c.fill();
    } else {
      c.strokeStyle = 'rgba(30,34,42,0.09)';
      c.lineWidth = 1.2;
      c.beginPath();
      c.moveTo(x, y);
      c.quadraticCurveTo(x + 8 + r() * 10, y + (r() - 0.5) * 12, x + 18 + r() * 14, y + (r() - 0.5) * 6);
      c.stroke();
    }
  }
}

function joint(c, ax, ay, bx, by) {
  c.strokeStyle = 'rgba(55,60,70,0.22)';
  c.beginPath();
  c.moveTo(ax, ay);
  c.lineTo(bx, by);
  c.stroke();
  c.strokeStyle = 'rgba(255,255,255,0.13)';
  c.beginPath();
  c.moveTo(ax + 0.8, ay + 0.8);
  c.lineTo(bx + 0.8, by + 0.8);
  c.stroke();
}

// ---- drawn-only bodies; the ramps around them are map objects
function funbox(c, p, ts) {
  const x = p.x * ts;
  const y = p.y * ts;
  const w = p.w * ts;
  const h = p.h * ts;
  const face = 5; // the visible front face
  c.fillStyle = 'rgba(0,0,0,0.26)';
  c.fillRect(x + 2, y + 3, w, h);
  c.fillStyle = darken(CONCRETE, 0.3);
  c.fillRect(x, y + h - face, w, face);
  const g = c.createLinearGradient(x, y, x, y + h - face);
  g.addColorStop(0, lighten(CONCRETE, 0.22));
  g.addColorStop(1, lighten(CONCRETE, 0.08));
  c.fillStyle = g;
  c.fillRect(x, y, w, h - face);
  coping(c, x, y, w, h - face);
  c.strokeStyle = 'rgba(255,225,77,0.7)'; // painted edge stripe
  c.lineWidth = 1;
  c.setLineDash([4, 3]);
  c.strokeRect(x + 3.5, y + 3.5, w - 7, h - face - 7);
  c.setLineDash([]);
}

function bowl(c, p, ts) {
  const x = p.x * ts;
  const y = p.y * ts;
  const w = p.w * ts;
  const h = p.h * ts;
  const ix = x + ts;
  const iy = y + ts;
  const iw = w - 2 * ts;
  const ih = h - 2 * ts;
  const g = c.createRadialGradient(ix + iw / 2, iy + ih / 2, 2, ix + iw / 2, iy + ih / 2, Math.max(iw, ih) * 0.62);
  g.addColorStop(0, darken(CONCRETE, 0.34));
  g.addColorStop(1, darken(CONCRETE, 0.08));
  c.fillStyle = 'rgba(0,0,0,0.2)';
  c.fillRect(x + 1, y + 2, w, h);
  c.fillStyle = g;
  c.fillRect(x, y, w, h);
  // the transitions on the west and south side (the north and east ones are ramp objects)
  const west = c.createLinearGradient(x, 0, ix, 0);
  west.addColorStop(0, lighten(CONCRETE, 0.12));
  west.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = west;
  c.fillRect(x, iy, ts, ih);
  const south = c.createLinearGradient(0, y + h, 0, iy + ih);
  south.addColorStop(0, lighten(CONCRETE, 0.12));
  south.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = south;
  c.fillRect(ix, iy + ih, iw, ts);
  c.strokeStyle = STEEL;
  c.lineWidth = 1.4;
  c.strokeRect(x + 1, y + 1, w - 2, h - 2);
  c.strokeStyle = 'rgba(20,24,32,0.45)';
  c.lineWidth = 1;
  c.strokeRect(ix, iy, iw, ih);
}

const PIECE = { funbox, bowl };

// Steel coping along the top edge and sides of a raised body.
function coping(c, x, y, w, h) {
  c.strokeStyle = STEEL;
  c.lineWidth = 1.5;
  c.beginPath();
  c.moveTo(x + 0.75, y + h);
  c.lineTo(x + 0.75, y + 0.75);
  c.lineTo(x + w - 0.75, y + 0.75);
  c.lineTo(x + w - 0.75, y + h);
  c.stroke();
  c.strokeStyle = 'rgba(40,46,58,0.5)';
  c.lineWidth = 0.8;
  c.strokeRect(x + 2, y + 2, w - 4, h - 3);
}

// ---- markings
function pad(c, o, ts) {
  const x = o.x * ts;
  const y = o.y * ts;
  const w = o.w * ts;
  const h = o.h * ts;
  c.fillStyle = 'rgba(255,255,255,0.1)';
  c.fillRect(x, y, w, h);
  c.strokeStyle = 'rgba(255,225,77,0.7)';
  c.lineWidth = 1.2;
  c.setLineDash([5, 4]);
  c.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
  c.setLineDash([]);
  c.fillStyle = 'rgba(255,255,255,0.4)';
  c.font = 'bold 6px monospace';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText('MANUAL', x + w / 2, y + h / 2);
}

function bankSpot(c, o, ts) {
  const x = (o.x + 0.5) * ts;
  const y = (o.y + 0.5) * ts;
  const r = o.r * ts;
  c.fillStyle = 'rgba(74,163,255,0.14)';
  c.beginPath();
  c.arc(x, y, r, 0, TAU);
  c.fill();
  c.strokeStyle = 'rgba(120,200,255,0.9)';
  c.lineWidth = 1.5;
  c.setLineDash([5, 4]);
  c.beginPath();
  c.arc(x, y, r, 0, TAU);
  c.stroke();
  c.setLineDash([]);
  star(c, x, y - 2, 5, 'rgba(255,225,77,0.9)', 0);
  c.fillStyle = 'rgba(255,255,255,0.75)';
  c.font = 'bold 6px monospace';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText('BANK', x, y + 7);
}

function gate(c, g, ts) {
  const posts = g.axis === 'x'
    ? [[g.x * ts + 2, (g.y + 0.5) * ts], [(g.x + g.w) * ts - 2, (g.y + 0.5) * ts]]
    : [[(g.x + 0.5) * ts, g.y * ts + 2], [(g.x + 0.5) * ts, (g.y + g.h) * ts - 2]];
  c.strokeStyle = 'rgba(255,225,77,0.6)'; // threshold stripe
  c.lineWidth = 1.2;
  c.setLineDash([3, 3]);
  c.beginPath();
  c.moveTo(posts[0][0], posts[0][1]);
  c.lineTo(posts[1][0], posts[1][1]);
  c.stroke();
  c.setLineDash([]);
  for (const [px, py] of posts) {
    c.fillStyle = 'rgba(0,0,0,0.3)';
    c.beginPath();
    c.arc(px + 1, py + 1.5, 3.4, 0, TAU);
    c.fill();
    c.fillStyle = '#4d5565';
    c.beginPath();
    c.arc(px, py, 3.2, 0, TAU);
    c.fill();
    c.fillStyle = '#ffd23f';
    c.beginPath();
    c.arc(px, py, 1.8, 0, TAU);
    c.fill();
    c.fillStyle = 'rgba(255,255,255,0.7)';
    c.fillRect(px - 1.4, py - 1.6, 1.2, 1);
  }
}

// ---- graffiti: kid-safe words and shapes
function decal(c, d, ts) {
  const x = d.x * ts;
  const y = d.y * ts;
  c.save();
  c.translate(x, y);
  c.rotate(d.rot);
  c.globalAlpha = 0.62;
  if (d.kind === 'word') {
    c.font = `bold ${d.size}px monospace`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineJoin = 'round';
    c.lineWidth = 2.4;
    c.strokeStyle = darken(d.color, 0.55);
    c.strokeText(d.text, 0, 0);
    c.fillStyle = d.color;
    c.fillText(d.text, 0, 0);
    c.fillStyle = 'rgba(255,255,255,0.5)';
    c.fillRect(-d.size * d.text.length * 0.3, -d.size * 0.32, d.size * 0.5, 1);
  } else SHAPE[d.kind](c, d);
  c.restore();
}

function star(c, x, y, size, color, rot) {
  c.fillStyle = color;
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = rot - Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 ? size * 0.45 : size;
    c.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
  }
  c.closePath();
  c.fill();
}

const SHAPE = {
  star: (c, d) => { star(c, 0, 0, d.size, d.color, 0); },
  bolt: (c, d) => {
    const s = d.size;
    c.fillStyle = d.color;
    c.strokeStyle = darken(d.color, 0.55);
    c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(s * 0.2, -s);
    c.lineTo(-s * 0.55, s * 0.15);
    c.lineTo(-s * 0.05, s * 0.15);
    c.lineTo(-s * 0.3, s);
    c.lineTo(s * 0.6, -s * 0.25);
    c.lineTo(s * 0.08, -s * 0.25);
    c.closePath();
    c.stroke();
    c.fill();
  },
  circle: (c, d) => {
    c.strokeStyle = d.color;
    c.lineWidth = 2;
    c.beginPath();
    c.arc(0, 0, d.size, 0, TAU);
    c.stroke();
    c.beginPath();
    c.arc(0, 0, d.size * 0.4, 0, TAU);
    c.stroke();
  },
  triangle: (c, d) => {
    c.strokeStyle = d.color;
    c.lineWidth = 2;
    c.lineJoin = 'round';
    c.beginPath();
    c.moveTo(0, -d.size);
    c.lineTo(d.size, d.size * 0.7);
    c.lineTo(-d.size, d.size * 0.7);
    c.closePath();
    c.stroke();
  },
  blob: (c, d) => { // a soft spray puff
    c.fillStyle = d.color;
    c.globalAlpha = 0.18;
    for (const [dx, dy, k] of [[0, 0, 1], [0.5, 0.2, 0.7], [-0.45, -0.25, 0.65], [0.1, -0.5, 0.5]]) {
      c.beginPath();
      c.arc(dx * d.size, dy * d.size, d.size * k, 0, TAU);
      c.fill();
    }
  }
};

// The designed route as faint arrows (debug only).
function line(c, o, ts) {
  const pts = o.points.map(([px, py]) => [px * ts, py * ts]);
  c.strokeStyle = 'rgba(255,225,77,0.35)';
  c.lineWidth = 1;
  c.setLineDash([2, 3]);
  c.beginPath();
  pts.forEach(([px, py], i) => (i ? c.lineTo(px, py) : c.moveTo(px, py)));
  c.stroke();
  c.setLineDash([]);
  c.strokeStyle = 'rgba(255,225,77,0.85)';
  c.lineWidth = 1.4;
  c.lineCap = 'round';
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[i + 1];
    const len = Math.hypot(bx - ax, by - ay);
    const ux = (bx - ax) / len;
    const uy = (by - ay) / len;
    for (let d = 10; d < len - 4; d += 26) {
      const px = ax + ux * d;
      const py = ay + uy * d;
      c.beginPath();
      c.moveTo(px - ux * 3 - uy * 3, py - uy * 3 + ux * 3);
      c.lineTo(px + ux * 3, py + uy * 3);
      c.lineTo(px - ux * 3 + uy * 3, py - uy * 3 - ux * 3);
      c.stroke();
    }
  }
}

// ---- y-sorted standing things: { w, h, draw(c, w, h) }; the feet are 3 px above the bottom edge
const SPRITE = {
  lamp: {
    w: 16, h: 46,
    draw(c, w, h) {
      const cx = w / 2;
      const base = h - 3;
      const glow = c.createRadialGradient(cx + 3, 8, 1, cx + 3, 8, 9);
      glow.addColorStop(0, 'rgba(255,233,168,0.42)');
      glow.addColorStop(1, 'rgba(255,233,168,0)');
      c.fillStyle = glow;
      c.fillRect(0, 0, w, 18);
      c.fillStyle = 'rgba(0,0,0,0.3)';
      c.beginPath();
      c.ellipse(cx + 1, base + 1, 4.5, 2, 0, 0, TAU);
      c.fill();
      c.fillStyle = '#3a3f4b';
      c.fillRect(cx - 3, base - 4, 6, 4);
      c.fillStyle = '#5a6272';
      c.fillRect(cx - 1.2, 9, 2.4, base - 11);
      c.fillStyle = '#8b94a6';
      c.fillRect(cx - 1.2, 9, 0.9, base - 11);
      c.fillStyle = '#5a6272';
      c.fillRect(cx - 1.2, 7, 6, 2);
      c.fillStyle = '#2f3440';
      c.fillRect(cx + 2, 8.5, 5, 2);
      c.fillStyle = '#ffe9a8';
      c.fillRect(cx + 2.4, 10, 4.2, 1.4);
    }
  },
  'bike-rack': {
    w: 28, h: 16,
    draw(c, w, h) {
      const y = h - 3;
      c.fillStyle = 'rgba(0,0,0,0.25)';
      c.fillRect(2, y - 1, w - 3, 3);
      c.strokeStyle = '#4d5565';
      c.lineWidth = 1.6;
      c.lineCap = 'round';
      for (let i = 0; i < 4; i++) {
        const x = 5 + i * 6;
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x, y - 5);
        c.arc(x + 2.5, y - 5, 2.5, Math.PI, 0);
        c.lineTo(x + 5, y);
        c.stroke();
      }
      c.strokeStyle = STEEL;
      c.lineWidth = 0.7;
      for (let i = 0; i < 4; i++) {
        c.beginPath();
        c.arc(5 + i * 6 + 2.5, y - 5.4, 2.5, Math.PI, 0);
        c.stroke();
      }
    }
  },
  sign: {
    w: 30, h: 38,
    draw(c, w, h, o) {
      const cx = w / 2;
      const base = h - 3;
      c.fillStyle = 'rgba(0,0,0,0.28)';
      c.beginPath();
      c.ellipse(cx + 1, base + 1, 5, 2, 0, 0, TAU);
      c.fill();
      c.fillStyle = '#4d5565';
      c.fillRect(cx - 1, 16, 2, base - 16);
      c.fillStyle = 'rgba(0,0,0,0.25)';
      c.fillRect(2.5, 3.5, w - 4, 17);
      c.fillStyle = '#2b6fb8';
      c.fillRect(1, 2, w - 3, 17);
      c.strokeStyle = '#ffffff';
      c.lineWidth = 1;
      c.strokeRect(2, 3, w - 5, 15);
      c.fillStyle = '#ffffff';
      c.font = 'bold 6px monospace';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(o.board ?? 'LINES', cx - 1, 8.5);
      c.strokeStyle = '#ffd23f';
      c.lineWidth = 1.2;
      c.beginPath();
      c.moveTo(7, 14);
      c.lineTo(21, 14);
      c.moveTo(18, 11.5);
      c.lineTo(21, 14);
      c.lineTo(18, 16.5);
      c.stroke();
    }
  }
};
