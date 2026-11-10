// Vegetation (story 16.6, AD-31, CAP-35): the pure part. No Phaser, no DOM.
// Trees: every `tree` tile gets a species and a crown shape (clustered, so a grove is mostly one kind) and a crown that
// reaches past the tile on every side; the crown is a sprite of its own (render/Vegetation.js) that sorts by the trunk's
// base line. Hedges: connected hedge tiles form runs that are drawn as one lumpy mass and sliced per tile.
export const TILE = 16;
export const SPECIES = ['oak', 'pine', 'birch'];
export const MARGIN = 4; // transparent border of a crown texture: room for the sway shift

function hash3(a, b, c) {
  let h = (Math.imul(a, 73856093) ^ Math.imul(b, 19349663) ^ Math.imul(c, 83492791)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  return (Math.imul(h, 3266489917) >>> 0) / 4294967296;
}
export const seeded = hash3;

// A grove (a 4x4 block of tiles) leans towards one species; every third tree is its own pick.
export function speciesOf(tx, ty) {
  const own = hash3(tx, ty, 5);
  const pick = hash3(own < 0.3 ? tx : tx >> 2, own < 0.3 ? ty : ty >> 2, 7);
  return SPECIES[Math.floor(pick * SPECIES.length)];
}

// Texture box of a crown: the bounding ellipse plus the margin, origin at the trunk's base point.
export function crownBox(crown) {
  const w = 2 * Math.ceil(crown.rx + MARGIN);
  const top = crown.cy - crown.ry - MARGIN;
  return { w, h: -top + 2, ox: w / 2, oy: -top };
}

// One box for every crown (they share one atlas, so one texture size and one origin serve them all).
export function commonBox(cfg) {
  const boxes = Object.values(cfg.species).map(s => crownBox(s.crown));
  const oy = Math.max(...boxes.map(b => b.oy));
  return { w: Math.max(...boxes.map(b => b.w)), h: oy + 2, ox: Math.max(...boxes.map(b => b.w)) / 2, oy };
}

// The crowns of a map: one entry per tree tile. (x, y) is the trunk's base point in world pixels, (cx, cy) the crown's centre.
export function placeTrees(map, cfg) {
  const out = [];
  const ts = map.tileSize ?? TILE;
  for (let ty = 0; ty < map.rows.length; ty++) {
    for (let tx = 0; tx < map.rows[ty].length; tx++) {
      if (map.legend[map.rows[ty][tx]] !== 'tree') continue;
      const species = speciesOf(tx, ty);
      const sp = cfg.species[species];
      const dx = Math.round((hash3(tx, ty, 11) - 0.5) * 2 * sp.jitter);
      const x = (tx + 0.5) * ts + dx;
      const y = (ty + 1) * ts - 1;
      out.push({
        tx, ty, species,
        shape: Math.floor(hash3(tx, ty, 13) * cfg.shapes),
        phase: hash3(tx, ty, 17) * cfg.sway.phaseSpread,
        x, y, cx: x, cy: y + sp.crown.cy, rx: sp.crown.rx, ry: sp.crown.ry
      });
    }
  }
  return out;
}

// Connected hedge tiles (4 neighbours). Each run: { id, x0, y0, x1, y1 (tile bounds, inclusive), tiles: [[tx, ty]] }.
export function hedgeRuns(map) {
  const rows = map.rows.length;
  const cols = map.rows[0].length;
  const hedge = (x, y) => x >= 0 && y >= 0 && x < cols && y < rows && map.legend[map.rows[y][x]] === 'hedge';
  const seen = new Set();
  const runs = [];
  for (let ty = 0; ty < rows; ty++) {
    for (let tx = 0; tx < cols; tx++) {
      if (!hedge(tx, ty) || seen.has(ty * cols + tx)) continue;
      const run = { id: runs.length, x0: tx, y0: ty, x1: tx, y1: ty, tiles: [] };
      const todo = [[tx, ty]];
      seen.add(ty * cols + tx);
      while (todo.length) {
        const [x, y] = todo.pop();
        run.tiles.push([x, y]);
        run.x0 = Math.min(run.x0, x); run.x1 = Math.max(run.x1, x);
        run.y0 = Math.min(run.y0, y); run.y1 = Math.max(run.y1, y);
        for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + ox;
          const ny = y + oy;
          if (hedge(nx, ny) && !seen.has(ny * cols + nx)) { seen.add(ny * cols + nx); todo.push([nx, ny]); }
        }
      }
      runs.push(run);
    }
  }
  return runs;
}

// Is a kid standing at (px, py) (feet) behind this crown? Torso height is where the crown has to cover.
export function underCrown(t, px, py, torso) {
  if (py >= t.y) return false; // in front of the trunk's base line: the kid is drawn over the crown
  const dx = (px - t.cx) / t.rx;
  const dy = (py - torso - t.cy) / t.ry;
  return dx * dx + dy * dy < 1;
}

// Moves a fade value towards its target at `speed` per second (linear, so the step is predictable).
export function stepFade(a, target, dt, speed) {
  const d = target - a;
  const s = speed * dt;
  return Math.abs(d) <= s ? target : a + Math.sign(d) * s;
}

// Sway in whole base pixels at relative height h (0 at the base .. 1 at the crown's top): a steady lean along the wind and a
// flutter that follows its strength. The shader (render/pipelines/WindFx.js) evaluates the same formula per texture row.
export function swayShift(time, phase, h, windX, strength, amp, sway) {
  const flutter = Math.sin(time * sway.freq + phase + h * 1.3) * strength;
  return Math.round(amp * h * h * (sway.lean * windX + flutter));
}
