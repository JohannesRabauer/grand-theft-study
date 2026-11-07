// Procedural art at 2x detail (story 1.12, AD-14). Medium and High render at 960x540 with the
// world camera at base zoom 2, so every texture here is drawn on a grid twice as fine as the
// 1x set in BootScene (which Low still uses) and is displayed at scale 0.5: one texture pixel is
// one screen pixel. Same keys as the 1x set. Everything is deterministic (seeded), nothing is
// loaded. Sprites get a dark outline pass; tiles get seeded variants so the ground is not a grid.
const TILE = 32;
const VARIANTS = { asphalt: 4, cobble: 3, grass: 4, path: 3, concrete: 4, water: 3, lane: 2, hedge: 3, puddle: 1 };

function rgb(c) { const n = parseInt(c.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
function mix(a, b, t) {
  const x = rgb(a);
  const y = rgb(b);
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
const lighten = (c, t) => mix(c, '#ffffff', t);
const darken = (c, t) => mix(c, '#000000', t);

function rng(seed) {
  let s = (seed * 2654435761 + 12345) % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

class Pen {
  constructor(scene, key, w, h) {
    this.tex = scene.textures.createCanvas(key, w, h);
    this.c = this.tex.getContext();
    this.w = w;
    this.h = h;
  }

  px(col, x, y, w = 1, h = 1) {
    this.c.fillStyle = col;
    this.c.fillRect(x, y, w, h);
    return this;
  }

  // filled pixel ellipse (centre cx, cy; radii rx, ry)
  ell(col, cx, cy, rx, ry) {
    this.c.fillStyle = col;
    for (let y = Math.floor(cy - ry); y < Math.ceil(cy + ry); y++) {
      const dy = (y + 0.5 - cy) / ry;
      if (Math.abs(dy) >= 1) continue;
      const half = rx * Math.sqrt(1 - dy * dy);
      const x0 = Math.round(cx - half);
      const x1 = Math.round(cx + half);
      if (x1 > x0) this.c.fillRect(x0, y, x1 - x0, 1);
    }
    return this;
  }

  // 1 px line
  line(col, x0, y0, x1, y1) {
    this.c.fillStyle = col;
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) this.c.fillRect(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), 1, 1);
    return this;
  }

  // 1 px outline around everything drawn so far
  outline(col) {
    const { w, h } = this;
    const d = this.c.getImageData(0, 0, w, h).data;
    const solid = (x, y) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 60;
    this.c.fillStyle = col;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!solid(x, y) && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) this.c.fillRect(x, y, 1, 1);
      }
    }
    return this;
  }

  // soft ground shadow drawn beneath everything else
  shadow(cx, cy, rx, ry, alpha = 0.3) {
    this.c.globalCompositeOperation = 'destination-over';
    this.ell(`rgba(0,0,0,${alpha})`, cx, cy, rx, ry);
    this.c.globalCompositeOperation = 'source-over';
    return this;
  }

  done() { this.tex.refresh(); }
}

// ---------------------------------------------------------------- tiles

function speckle(p, r, cols, n, x0 = 0, y0 = 0, w = TILE, h = TILE) {
  for (let i = 0; i < n; i++) {
    const x = x0 + Math.floor(r() * w);
    const y = y0 + Math.floor(r() * h);
    p.px(cols[Math.floor(r() * cols.length)], x, y, r() < 0.3 ? 2 : 1, 1);
  }
}

function crack(p, r, col) {
  let x = Math.floor(r() * TILE);
  let y = Math.floor(r() * TILE);
  const n = 6 + Math.floor(r() * 8);
  for (let i = 0; i < n; i++) {
    p.px(col, x, y);
    x = (x + (r() < 0.6 ? 1 : 0) + TILE) % TILE;
    y = (y + (r() < 0.5 ? 1 : 0) + TILE) % TILE;
  }
}

const GROUND = {
  asphalt(p, d, r, v) {
    speckle(p, r, [d.speck, darken(d.base, 0.12), lighten(d.base, 0.07)], 150);
    if (v === 1) crack(p, r, darken(d.base, 0.3));
    if (v === 3) p.px(lighten(d.base, 0.14), 5 + Math.floor(r() * 20), 4 + Math.floor(r() * 24), 3, 1);
  },
  cobble(p, d, r) {
    const rows = [0, 8, 16, 24];
    rows.forEach((y, ri) => {
      const off = ri % 2 ? 4 : 0;
      for (let k = -1; k < 4; k++) {
        const x = off + k * 8;
        const col = mix(d.base, ri % 2 ? d.speck : lighten(d.base, 0.18), r() * 0.55);
        p.px(col, x + 1, y + 1, 7, 7);
        p.px(lighten(col, 0.25), x + 1, y + 1, 7, 1); // lit top edge
        p.px(darken(col, 0.18), x + 1, y + 7, 7, 1); // shaded bottom edge
        if (r() < 0.4) p.px(darken(col, 0.12), x + 2 + Math.floor(r() * 4), y + 3 + Math.floor(r() * 3), 1, 1);
      }
      p.px(darken(d.base, 0.35), 0, y, TILE, 1); // grout
      for (let k = -1; k < 4; k++) p.px(darken(d.base, 0.35), off + k * 8, y, 1, 8);
    });
  },
  grass(p, d, r, v) {
    const dark = darken(d.base, 0.16);
    const light = lighten(d.base, 0.14);
    speckle(p, r, [d.speck, dark, light], 130);
    for (let i = 0; i < 9; i++) { // tufts: three blades
      const x = 1 + Math.floor(r() * 29);
      const y = 3 + Math.floor(r() * 26);
      const c = r() < 0.5 ? dark : light;
      p.px(c, x, y, 1, 3); p.px(c, x - 1, y + 1, 1, 2); p.px(c, x + 1, y, 1, 2);
    }
    if (v === 3) {
      for (let i = 0; i < 3; i++) {
        const x = 2 + Math.floor(r() * 27);
        const y = 2 + Math.floor(r() * 27);
        p.px(['#ffffff', '#ffe86a', '#ff9ec4'][i % 3], x, y, 2, 2);
        p.px('#e8b830', x, y, 1, 1);
      }
    }
  },
  path(p, d, r, v) {
    speckle(p, r, [d.speck, darken(d.base, 0.1), lighten(d.base, 0.1)], 100);
    for (let i = 0; i < 4 + v; i++) { // pebbles
      const x = 1 + Math.floor(r() * 28);
      const y = 1 + Math.floor(r() * 28);
      p.px(darken(d.base, 0.22), x, y + 1, 3, 2);
      p.px(lighten(d.base, 0.2), x, y, 3, 2);
      p.px('#ffffff44', x, y, 1, 1);
    }
  },
  concrete(p, d, r, v) {
    speckle(p, r, [d.speck, darken(d.base, 0.07), lighten(d.base, 0.06)], 70);
    if (v === 2) crack(p, r, darken(d.base, 0.25));
    if (v === 1) p.px(darken(d.base, 0.09), 0, 15 + Math.floor(r() * 2), TILE, 1); // expansion joint
  },
  water(p, d, r, v) {
    const dark = darken(d.base, 0.12);
    for (let i = 0; i < 7; i++) {
      const x = Math.floor(r() * 26);
      const y = 2 + Math.floor(r() * 28);
      const len = 5 + Math.floor(r() * 6);
      p.px(dark, x + 1, y + 1, len, 1);
      p.px(d.speck, x, y, len, 1);
    }
    for (let i = 0; i < 3 + v; i++) p.px('#e4f3ff', Math.floor(r() * 31), Math.floor(r() * 31), 1, 1); // sparkle
  },
  lane(p, d, r) {
    speckle(p, r, [d.speck, darken(d.base, 0.1), lighten(d.base, 0.08)], 80);
    p.px('#e8e4d8', 0, 14, 12, 4);
    p.px('#ffffff', 0, 14, 12, 1);
  },
  hedge(p, d, r) {
    p.px(darken(d.base, 0.25), 0, 0, TILE, TILE);
    const light = lighten(d.base, 0.3);
    for (let i = 0; i < 26; i++) {
      const cx = Math.floor(r() * TILE);
      const cy = 2 + Math.floor(r() * 30);
      const rad = 2 + Math.floor(r() * 3);
      for (const dx of [0, cx < rad ? TILE : cx > TILE - rad ? -TILE : 0]) {
        p.ell(darken(d.base, 0.1), cx + dx, cy + 1, rad + 0.5, rad);
        p.ell(d.base, cx + dx, cy, rad, rad);
        p.ell(mix(d.base, light, 0.5), cx + dx - 1, cy - 1, rad * 0.55, rad * 0.5);
        if (rad > 2) p.px(light, cx + dx - 1, cy - 1, 1, 1);
      }
    }
    p.px(darken(d.base, 0.5), 0, 0, TILE, 3);
    p.px(darken(d.base, 0.35), 0, 3, TILE, 1);
  },
  puddle(p, d, r) {
    GROUND.asphalt(p, { base: d.base, speck: '#5a5d66' }, r, 0);
    const water = '#4f86bd';
    for (let y = 5; y < 27; y++) { // organic blob: width follows a lumpy ellipse
      const t = (y - 16) / 11;
      const half = Math.round(13 * Math.sqrt(Math.max(0, 1 - t * t)) + Math.sin(y * 1.7) * 1.2);
      if (half > 0) p.px(water, 16 - half, y, half * 2, 1);
    }
    for (let y = 7; y < 25; y++) {
      const t = (y - 16) / 9;
      const half = Math.round(10 * Math.sqrt(Math.max(0, 1 - t * t)));
      if (half > 0) p.px('#6fa8dc', 16 - half + 1, y, half * 2 - 2, 1);
    }
    p.px('#cfe6fa', 9, 11, 7, 1);
    p.px('#cfe6fa', 11, 13, 4, 1);
    p.px('#ffffff', 20, 18, 3, 1);
    p.px('#3d6d9e', 7, 19, 2, 1);
  }
};

// roof: terracotta shingles in staggered rows
function roof(p, d, r, top) {
  const base = d.base;
  p.px(base, 0, 0, TILE, TILE);
  for (let row = 0; row < 8; row++) {
    const y = row * 4;
    const off = row % 2 ? 4 : 0;
    p.px(darken(base, 0.28), 0, y + 3, TILE, 1);
    for (let k = -1; k < 4; k++) {
      const x = off + k * 8;
      p.px(darken(base, 0.28), x, y, 1, 3);
      const col = mix(base, r() < 0.5 ? lighten(base, 0.18) : darken(base, 0.1), r() * 0.8);
      p.px(col, x + 1, y, 7, 3);
      p.px(lighten(col, 0.18), x + 1, y, 7, 1);
    }
  }
  if (top) {
    p.px(lighten(base, 0.35), 0, 0, TILE, 2);
    p.px(darken(base, 0.4), 0, 2, TILE, 1);
  }
}

// facade: brick rows, foundation strip, optional window
function facade(p, d, r, win) {
  const base = lighten(d.base, 0.04);
  const mortar = lighten(d.base, 0.45);
  p.px(mortar, 0, 0, TILE, TILE);
  for (let row = 0; row < 7; row++) {
    const y = row * 4;
    const off = row % 2 ? 4 : 0;
    for (let k = -1; k < 4; k++) {
      const x = off + k * 8;
      const col = mix(base, r() < 0.5 ? darken(d.speck, 0.1) : lighten(base, 0.12), r() * 0.55);
      p.px(col, x + 1, y + 1, 7, 3);
      p.px(darken(col, 0.18), x + 1, y + 3, 7, 1);
    }
  }
  p.px('#3e2018', 0, 28, TILE, 4); // foundation
  p.px('#5d2e20', 0, 28, TILE, 2);
  p.px(darken(d.base, 0.5), 0, 0, TILE, 1);
  if (win) {
    p.px('#2a1a14', 8, 4, 16, 18);                           // frame shadow
    p.px('#f0e8da', 8, 4, 16, 17);                           // frame
    p.px('#2d3f55', 10, 6, 12, 13);                          // glass
    p.px('#5f86ad', 10, 6, 12, 6);
    p.px('#8fb4d6', 11, 7, 4, 3);                            // reflection
    p.px('#cfe3f4', 11, 7, 2, 1);
    p.px('#f0e8da', 15, 6, 2, 13);                           // mullion
    p.px('#f0e8da', 10, 12, 12, 1);
    p.px('#b8b0a2', 7, 21, 18, 2);                           // sill
    p.px('#8a8274', 7, 23, 18, 1);
  }
}

// map boundary: plain brick with a capstone
function brickWall(p, d, r) {
  facade(p, d, r, false);
  p.px('#3e2018', 0, 28, TILE, 4);
  p.px(lighten(d.base, 0.4), 0, 0, TILE, 3);
  p.px(darken(d.base, 0.3), 0, 3, TILE, 1);
}

const SPECIAL = {
  tree(p, d, r) {
    GROUND.grass(p, { base: d.base, speck: d.speck }, r, 0);
    p.ell('rgba(0,0,0,0.28)', 17, 28, 10, 3); // ground shadow
    p.px('#5a3a1e', 14, 22, 4, 8);                    // trunk
    p.px('#7a5230', 14, 22, 1, 8);
    p.px('#3b2412', 17, 22, 1, 8);
    const g = ['#1f5a26', '#2c6a2c', '#3f8a3c', '#5aa84c', '#7fcb66'];
    p.ell(g[0], 16, 14, 14, 13);
    p.ell(g[1], 15, 13, 13, 12);
    p.ell(g[2], 14, 11, 11, 10);
    p.ell(g[3], 12, 9, 7, 6);
    p.ell(g[4], 10, 7, 3.5, 3);
    for (let i = 0; i < 18; i++) { // leaf texture
      const a = r() * Math.PI * 2;
      const rr = r() * 11;
      p.px(r() < 0.5 ? g[1] : g[3], Math.round(15 + Math.cos(a) * rr), Math.round(13 + Math.sin(a) * rr * 0.9), 2, 1);
    }
    p.px('#e0483c', 21, 16, 2, 2); p.px('#e0483c', 9, 18, 2, 2); // a few apples
  },
  fence(p, d, r) {
    GROUND.concrete(p, d, r, 0);
    p.px('rgba(0,0,0,0.25)', 0, 18, TILE, 3);          // shadow
    p.px('#6a6e76', 0, 16, TILE, 2);                   // rail underside
    p.px('#c4c8d0', 0, 12, TILE, 4);                   // rail
    p.px('#e6e9ee', 0, 12, TILE, 1);
    p.px('#8a8e96', 0, 15, TILE, 1);
    for (let x = 2; x < TILE; x += 8) {
      p.px('#3e4248', x, 5, 4, 19);                    // post
      p.px('#6a6e76', x, 5, 3, 18);
      p.px('#9aa0a8', x, 5, 1, 18);
      p.px('#c4c8d0', x, 4, 3, 2);                     // cap
    }
  },
  dumpster(p, d, r) {
    GROUND.concrete(p, d, r, 0);
    p.px('rgba(0,0,0,0.28)', 4, 27, 26, 3);
    p.px('#1a3a22', 2, 4, 28, 24);                     // outline
    p.px('#2f6b3a', 3, 5, 26, 22);                     // body
    p.px('#3f8a4c', 3, 13, 26, 1);
    for (let x = 6; x < 28; x += 5) p.px('#25552e', x, 14, 1, 12); // ribs
    p.px('#1f4a28', 3, 5, 26, 8);                      // lid
    p.px('#2a6034', 4, 6, 24, 1);
    p.px('#143019', 3, 12, 26, 1);
    p.px('#8a8e96', 12, 8, 8, 2);                      // handle
    p.px('#111111', 4, 27, 4, 2); p.px('#111111', 24, 27, 4, 2); // wheels
  },
  booth(p, d, r) {
    GROUND.concrete(p, d, r, 0);
    p.px('rgba(0,0,0,0.28)', 6, 28, 22, 3);
    p.px('#4a1210', 5, 1, 22, 29);
    p.px('#c8352f', 6, 2, 20, 27);
    p.px('#8a1f1b', 6, 2, 20, 3);                      // roof band
    p.px('#e8574f', 6, 5, 20, 1);
    p.px('#7a1f1b', 6, 24, 20, 5);                     // base panel
    for (let col = 0; col < 2; col++) {
      for (let row = 0; row < 3; row++) {
        const x = 8 + col * 9;
        const y = 7 + row * 5.5 | 0;
        p.px('#9fd3f0', x, y, 7, 4);
        p.px('#d6efff', x, y, 7, 1);
        p.px('#6fa8c8', x, y + 3, 7, 1);
      }
    }
    p.px('#ffe14d', 13, 25, 6, 2);                     // sign
  }
};

function makeTiles(scene, defs) {
  const make = (key, draw) => {
    const p = new Pen(scene, key, TILE, TILE);
    draw(p);
    p.done();
  };
  const seed = id => [...id].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7);
  for (const id in defs) {
    const d = defs[id];
    if (id === 'wall') {
      const r = rng(seed(id));
      make('tile-wall-roof', p => roof(p, d, r, false));
      make('tile-wall-roof-top', p => roof(p, d, r, true));
      make('tile-wall-front', p => facade(p, d, r, false));
      make('tile-wall-window', p => facade(p, d, r, true));
      make('tile-wall-brick', p => brickWall(p, d, r));
      continue;
    }
    const n = VARIANTS[id] ?? 1;
    for (let v = 0; v < n; v++) {
      const r = rng(seed(id) + v * 977);
      make(v === 0 ? `tile-${id}` : `tile-${id}-${v}`, p => {
        p.px(d.base, 0, 0, TILE, TILE);
        if (GROUND[id]) GROUND[id](p, d, r, v);
        else SPECIAL[id](p, d, r);
      });
    }
  }
}

// Texture key for the map tile at (tx, ty): seeded variants for open ground, facade / roof for walls.
export function tileKey(map, tx, ty) {
  const id = map.legend[map.rows[ty][tx]];
  if (id === 'wall') {
    const rows = map.rows.length;
    const cols = map.rows[0].length;
    if (tx === 0 || ty === 0 || tx === cols - 1 || ty === rows - 1) return 'tile-wall-brick';
    const solid = (x, y) => map.legend[map.rows[y][x]] === 'wall';
    if (!solid(tx, ty + 1)) return tx % 2 === 0 ? 'tile-wall-window' : 'tile-wall-front';
    return solid(tx, ty - 1) ? 'tile-wall-roof' : 'tile-wall-roof-top';
  }
  const n = VARIANTS[id] ?? 1;
  const v = (((tx * 73856093) ^ (ty * 19349663)) >>> 0) % n;
  return v === 0 ? `tile-${id}` : `tile-${id}-${v}`;
}

// ---------------------------------------------------------------- sprites

const OUT = '#16161e';

function figure(p, o) {
  const { jacket, jacketDark, jacketLight, pants, hair, brows } = o;
  p.px(pants, 7, 20, 4, 8);                             // legs
  p.px(pants, 13, 20, 4, 8);
  p.px(darken(pants, 0.3), 10, 20, 1, 8);
  p.px(darken(pants, 0.3), 16, 20, 1, 8);
  p.px('#2c2018', 6, 27, 5, 2);                         // shoes
  p.px('#2c2018', 13, 27, 5, 2);
  p.px(jacket, 4, 11, 16, 11);                          // torso
  p.px(jacketDark, 15, 12, 5, 10);
  p.px(jacketLight, 5, 12, 2, 9);
  p.px(jacketDark, 4, 21, 16, 1);
  p.px(jacket, 2, 12, 3, 9);                            // arms
  p.px(jacket, 19, 12, 3, 9);
  p.px(jacketDark, 21, 13, 1, 8);
  p.px('#f2c9a0', 2, 21, 3, 2);                         // hands
  p.px('#f2c9a0', 19, 21, 3, 2);
  if (o.straps) {
    p.px(o.straps, 8, 12, 1, 8);
    p.px(o.straps, 15, 12, 1, 8);
  }
  if (o.zip) p.px(o.zip, 11, 12, 1, 9);
  p.px('#f2c9a0', 10, 10, 4, 2);                        // neck
  p.ell('#f2c9a0', 12, 7, 6, 5.5);                      // head
  p.px('#d9a97e', 16, 6, 2, 4);                         // face shade
  hair(p);
  p.px('#222222', 9, 8, 2, 2);                          // eyes
  p.px('#222222', 14, 8, 2, 2);
  p.px('#ffffff', 9, 8, 1, 1);
  p.px('#ffffff', 14, 8, 1, 1);
  brows?.(p);
  p.px('#c4755b', 11, 11, 3, 1);                        // mouth
}

function makeFigures(scene) {
  const mk = (key, o) => {
    const p = new Pen(scene, key, 24, 32);
    figure(p, o);
    p.outline(OUT).shadow(12, 29.5, 8, 2.5);
    p.done();
  };
  mk('player', {
    jacket: '#e0483c', jacketDark: '#b2352c', jacketLight: '#f06a5c', pants: '#2a3f8f', straps: '#e8c24a', zip: '#f6b3ab',
    hair: p => { p.ell('#5a3a1e', 12, 4.5, 6.5, 3.5); p.px('#5a3a1e', 6, 5, 2, 4); p.px('#5a3a1e', 17, 5, 2, 3); p.px('#7a5230', 9, 2, 4, 1); }
  });
  mk('bully', {
    jacket: '#5a2a7a', jacketDark: '#411c5a', jacketLight: '#7a3fa0', pants: '#3a3a48', zip: '#2c1740',
    hair: p => { p.ell('#1a1a1a', 12, 4.5, 7, 3.5); p.px('#1a1a1a', 5, 5, 14, 2); p.px('#2c2c2c', 8, 2, 5, 1); p.px('#0c0c0c', 8, 6, 12, 1); },
    brows: p => { p.px('#1a1a1a', 8, 7, 4, 1); p.px('#1a1a1a', 13, 7, 4, 1); p.px('#1a1a1a', 11, 12, 3, 1); p.px('#f2c9a0', 11, 11, 3, 1); }
  });
}

// Top-down bike facing right; rider = jacket, sleeves, hands on the bars and a head seen from above.
function bike(p, o) {
  const tire = (x, y, w) => { p.px('#0e0e12', x, y, w, 5); p.px('#2e2e36', x + 1, y + 1, w - 2, 1); p.px('#6b6b78', x + (w >> 1) - 1, y + 2, 2, 1); };
  tire(1, 9, 11);
  tire(28, 9, 11);
  p.px(o.frameDark, 11, 10, 18, 4);
  p.px(o.frame, 11, 10, 18, 3);
  p.px(lighten(o.frame, 0.35), 12, 10, 16, 1);
  p.px('#8a8a96', 27, 3, 3, 18);                        // handlebar
  p.px('#c8c8d2', 27, 3, 1, 18);
  p.px('#16161e', 26, 3, 5, 3);                         // grips
  p.px('#16161e', 26, 18, 5, 3);
  p.px('#d8d8e0', 36, 11, 2, 2);                        // headlamp
  if (o.rider) {
    p.ell(o.jacketDark, 16, 12.5, 7.5, 7);
    p.ell(o.jacket, 15.5, 11.5, 7, 6.2);
    p.px(o.jacketLight, 10, 8, 8, 1);
    p.px(o.jacket, 21, 6, 7, 3);                        // sleeves
    p.px(o.jacket, 21, 16, 7, 3);
    p.px('#f2c9a0', 27, 6, 2, 3);                       // hands
    p.px('#f2c9a0', 27, 16, 2, 3);
    p.ell(o.hair, 17.5, 12, 4.7, 4.7);                  // head from above
    p.px(o.hairLight, 14, 9, 4, 1);
    p.px('#f2c9a0', 21, 10, 2, 4);                      // forehead / face edge
    o.cap?.(p);
  } else {
    p.ell('#222228', 18, 12, 4, 3);                     // saddle
    p.px('#44444e', 16, 10, 4, 1);
  }
}

function makeBikes(scene) {
  const mk = (key, o) => {
    const p = new Pen(scene, key, 40, 24);
    bike(p, o);
    p.outline(OUT).shadow(20, 20.5, 16, 2.5, 0.25);
    p.done();
  };
  const rider = { jacket: '#e0483c', jacketDark: '#b2352c', jacketLight: '#f06a5c', hair: '#5a3a1e', hairLight: '#7a5230' };
  mk('bike', { frame: '#3b7dd8', frameDark: '#24508f' });
  mk('player-bike', { rider: true, frame: '#3b7dd8', frameDark: '#24508f', ...rider });
  mk('bully-bike', {
    rider: true, frame: '#c8352f', frameDark: '#8a1f1b', jacket: '#5a2a7a', jacketDark: '#411c5a', jacketLight: '#7a3fa0', hair: '#1a1a1a', hairLight: '#3a3a48',
    cap: p => { p.px('#0c0c0c', 21, 8, 3, 8); p.px('#2c2c2c', 21, 9, 2, 1); }
  });
}

function makeArrow(scene) {
  const p = new Pen(scene, 'arrow', 24, 24);
  const c = p.c;
  c.fillStyle = '#000000';
  c.beginPath(); c.moveTo(0, 0); c.lineTo(24, 12); c.lineTo(0, 24); c.lineTo(6, 12); c.closePath(); c.fill();
  c.fillStyle = '#ffe14d';
  c.beginPath(); c.moveTo(3.5, 4); c.lineTo(19.5, 12); c.lineTo(3.5, 20); c.lineTo(8, 12); c.closePath(); c.fill();
  c.fillStyle = '#fff6b0';
  c.beginPath(); c.moveTo(4, 5); c.lineTo(15, 10.5); c.lineTo(8.5, 10.5); c.closePath(); c.fill();
  c.fillStyle = '#c99a1e';
  c.beginPath(); c.moveTo(4, 19); c.lineTo(15, 13.5); c.lineTo(8.5, 13.5); c.closePath(); c.fill();
  p.done();
}

// ---------------------------------------------------------------- effects and props

function disc(p, col, cx, cy, r) { p.ell(col, cx, cy, r, r); }

function makeFx(scene) {
  const mk = (key, w, h, draw) => { const p = new Pen(scene, key, w, h); draw(p, p.c); p.done(); };
  mk('skid', 6, 4, p => { p.px('rgba(17,17,17,0.55)', 0, 0, 6, 4); p.px('#111111', 1, 1, 4, 2); });
  mk('puff', 16, 16, p => {
    disc(p, '#b8b8b8', 8, 8, 8);
    disc(p, '#d8d8d8', 8, 8, 6.5);
    disc(p, '#f4f4f4', 7, 7, 4.5);
    p.px('#ffffff', 5, 5, 3, 2);
  });
  mk('ring', 48, 48, (p, c) => {
    c.lineWidth = 4; c.strokeStyle = '#d9b84a';
    c.beginPath(); c.arc(24, 24, 20, 0, Math.PI * 2); c.stroke();
    c.lineWidth = 2.5; c.strokeStyle = '#fff2a8';
    c.beginPath(); c.arc(24, 24, 20, 0, Math.PI * 2); c.stroke();
  });
  mk('p-dust', 8, 8, p => { disc(p, '#cfcfcf', 4, 4, 4); disc(p, '#ffffff', 3.5, 3.5, 2.6); });
  mk('p-drop', 4, 6, p => { p.px('#9fd0ff', 1, 0, 2, 1); p.px('#9fd0ff', 0, 1, 4, 4); p.px('#7ab4f0', 1, 5, 2, 1); p.px('#ffffff', 1, 2, 1, 2); });
  mk('p-leaf', 6, 6, p => { p.line('#ffffff', 0, 5, 4, 1); p.px('#ffffff', 1, 3, 3, 2); p.px('#ffffff', 2, 1, 3, 3); p.line('#b0b0b0', 0, 5, 4, 1); });
  mk('p-debris', 6, 6, p => { p.px('#ffffff', 1, 0, 4, 6); p.px('#ffffff', 0, 1, 6, 4); p.px('#a8a8a8', 3, 3, 3, 3); p.px('#d0d0d0', 2, 2, 1, 1); });
  mk('p-rain', 2, 12, (p, c) => { // streak fading in from the top, 1 world px wide
    for (let y = 0; y < 12; y++) { c.fillStyle = `rgba(188,216,255,${0.2 + y * 0.07})`; c.fillRect(0, y, 2, 1); }
  });
  mk('p-ring', 24, 24, (p, c) => {
    c.lineWidth = 1.5; c.strokeStyle = '#cfe8ff';
    c.beginPath(); c.arc(12, 12, 10.5, 0, Math.PI * 2); c.stroke();
  });
}

function makeProps(scene) {
  const mk = (key, w, h, draw, outline = OUT) => {
    const p = new Pen(scene, key, w, h);
    draw(p);
    p.outline(outline).done();
  };
  mk('prop-cone', 16, 16, p => {
    p.px('#7a3a10', 1, 1, 14, 14);
    p.px('#9a4c18', 1, 1, 14, 2);
    disc(p, '#e8731c', 8, 7.5, 7);
    disc(p, '#f08a38', 7, 6.5, 5.2);
    disc(p, '#ffffff', 8, 8, 4.6);
    disc(p, '#e8731c', 8, 8, 2.4);
    p.px('#ffd2a6', 5, 4, 2, 1);
  });
  mk('prop-cone-tipped', 20, 12, p => {
    p.px('#7a3a10', 16, 0, 4, 12);
    p.px('#9a4c18', 16, 0, 1, 12);
    for (let x = 0; x < 16; x++) { const h = 4 + Math.round(x * 0.35); p.px('#e8731c', x, 6 - (h >> 1), 1, h); p.px('#f08a38', x, 6 - (h >> 1), 1, 1); }
    p.px('#ffffff', 6, 3, 3, 6);
    p.px('#ffffff', 10, 2, 2, 8);
  });
  mk('prop-can', 12, 12, p => {
    disc(p, '#5d666e', 6, 6, 5.5);
    disc(p, '#9aa3ab', 6, 6, 4.4);
    disc(p, '#c9d1d9', 5.5, 5.5, 3);
    disc(p, '#7d868f', 6, 6, 1.6);
    p.px('#ffffff', 4, 3, 2, 1);
  });
  mk('prop-crate', 24, 24, p => {
    p.px('#5a3a1e', 0, 0, 24, 24);
    p.px('#b9854a', 1, 1, 22, 22);
    for (let y = 3; y < 22; y += 4) p.px('#a47642', 2, y, 20, 1);          // grain
    p.px('#8a5f31', 1, 9, 22, 6);
    p.px('#8a5f31', 9, 1, 6, 22);
    p.px('#cf9c5e', 1, 1, 22, 1);
    p.px('#cf9c5e', 1, 1, 1, 22);
    p.px('#6b4623', 1, 22, 22, 1);
    p.px('#3b2412', 2, 2, 2, 2); p.px('#3b2412', 20, 2, 2, 2);               // nails
    p.px('#3b2412', 2, 20, 2, 2); p.px('#3b2412', 20, 20, 2, 2);
    p.px('#6b4623', 9, 9, 6, 1); p.px('#6b4623', 9, 14, 6, 1);
  }, '#2c1a0c');
  mk('prop-ball', 16, 16, p => {
    disc(p, '#8a1f1b', 8, 8, 7.5);
    disc(p, '#c8352f', 7.5, 7.5, 6.6);
    disc(p, '#e8574f', 6, 6, 4);
    p.px('#ffffff', 4, 3, 3, 2);
    p.px('#f2f2f2', 5, 12, 6, 1);
    p.px('#ffffff', 2, 8, 12, 1);
  });
  mk('prop-trashcan', 20, 24, p => {
    p.px('#555e68', 1, 6, 18, 18);
    p.px('#7d868f', 2, 6, 16, 17);
    for (const x of [5, 9, 13]) p.px('#5d6670', x, 8, 1, 14);
    p.px('#a8b1ba', 3, 8, 1, 13);
    p.px('#4a5159', 2, 22, 16, 1);
    p.ell('#5d6670', 10, 5, 9.5, 4.5);                                       // lid
    p.ell('#8d97a1', 10, 4.5, 8.2, 3.6);
    p.ell('#aab3bc', 9, 4, 4, 1.8);
    p.px('#3b4046', 7, 3, 6, 1);                                             // handle
  });
  mk('prop-trashcan-tipped', 24, 20, p => {
    p.px('#555e68', 3, 1, 21, 18);
    p.px('#7d868f', 4, 1, 20, 17);
    for (const x of [9, 14, 19]) p.px('#5d6670', x, 2, 1, 15);
    p.px('#a8b1ba', 5, 2, 18, 1);
    p.ell('#3b4046', 3, 10, 3, 8.5);                                         // open mouth
    p.ell('#1d2024', 3.5, 10, 2, 6);
    p.ell('#5d6670', 21, 10, 3, 8.5);
  });
  mk('proj', 6, 6, p => { disc(p, '#a39b8a', 3, 3, 3); disc(p, '#d8d2c4', 2.6, 2.6, 2.2); p.px('#ffffff', 2, 1, 1, 1); }, 'rgba(0,0,0,0)');
  mk('proj-shadow', 8, 4, p => p.ell('rgba(0,0,0,0.35)', 4, 2, 4, 2), 'rgba(0,0,0,0)');
  mk('aim-dot', 4, 4, p => { p.px('#ffffff', 1, 0, 2, 4); p.px('#ffffff', 0, 1, 4, 2); }, 'rgba(0,0,0,0)');
  mk('ammo-pebble', 10, 8, p => {
    p.ell('#5d6268', 5, 4.2, 4.8, 3.8);
    p.ell('#8a9097', 4.8, 3.8, 4.2, 3.2);
    p.ell('#b6bcc2', 4, 3, 2.2, 1.5);
    p.px('#dfe3e6', 3, 2, 1, 1);
  });
  mk('ammo-chestnut', 10, 10, p => {
    p.ell('#4a2410', 5, 5.3, 4.8, 4.5);
    p.ell('#7a4220', 4.8, 4.8, 4.2, 4);
    p.ell('#a86a38', 4, 3.6, 2.4, 2);
    p.px('#d9a066', 3, 2, 1, 1);
    p.px('#e8d4a8', 4, 8, 3, 1);
  });
  mk('ammo-acorn', 8, 12, p => {
    p.ell('#8a5f22', 4, 8, 3.6, 3.8);
    p.ell('#c89a46', 3.8, 7.6, 3, 3.2);
    p.px('#e3c079', 2, 6, 1, 2);
    p.ell('#4a3010', 4, 3.5, 4, 2.6);
    p.px('#6b4a1e', 0, 3, 8, 2);
    for (let x = 1; x < 8; x += 2) p.px('#4a3010', x, 2, 1, 3);
    p.px('#4a3010', 3, 0, 2, 2);
  });
  mk('flag-pole', 4, 44, p => {
    p.px('#555a62', 0, 3, 4, 41);
    p.px('#9ca0a8', 0, 3, 2, 41);
    p.px('#d0d3d8', 0, 3, 1, 41);
    disc(p, '#e8e4d8', 2, 2, 2);
  });
  mk('flag-seg', 8, 18, (p) => {
    p.px('#ffffff', 0, 0, 8, 18);
    p.px('#e6e6e6', 0, 0, 8, 2);
    p.px('#d2d2d2', 0, 16, 8, 2);
    p.px('#ececec', 0, 6, 8, 1);
    p.px('#f4f4f4', 0, 11, 8, 1);
  }, 'rgba(0,0,0,0)');
}

export function makeHiResArt(scene, tileDefs) {
  makeTiles(scene, tileDefs);
  makeFigures(scene);
  makeBikes(scene);
  makeArrow(scene);
  makeFx(scene);
  makeProps(scene);
}
