// Cast shadows and ambient occlusion (story 16.4, AD-31, CAP-35): the pure part. No Phaser, no DOM.
//
// `buildShadowMask` bakes one RGBA buffer per map at *base pixel* resolution (16 per tile), once at map load:
//   R  tall casters (buildings, tree canopies, phone booths): 255 where something tall stands
//   G  low casters (fences, hedges, dumpsters)
//   B  255 on the casters' own footprint (a shadow never lies on the thing that casts it), else an ambient-occlusion
//      level (AO_STRONG / AO_WEAK) on open ground next to a wall or a booth
//   A  always 255, so the texture upload never touches the data
// The sun only moves a copy of R and G (render/pipelines/ShadowFx.js samples the mask at `uv - offset`), so shadows
// get longer in the morning and evening without any redraw. `shadowOffsets` turns the sun into whole base pixels.
export const TILE = 16; // base pixels per tile
export const AO_STRONG = 110;
export const AO_WEAK = 55;

const TALL = new Set(['wall', 'booth']);
const LOW = new Set(['fence', 'hedge', 'dumpster']);
const OCCLUDING = new Set(['wall', 'booth']); // casters that get an ambient-occlusion band on the ground next to them
const NOT_GROUND = new Set(['wall', 'booth', 'tree', 'fence', 'hedge', 'dumpster', 'water']);

// Caster kinds of a tile id: 'tall', 'low' or '' (tree is handled as a canopy ellipse).
export const casterOf = id => (TALL.has(id) ? 'tall' : LOW.has(id) ? 'low' : '');

function fillRect(data, w, x0, y0, rw, rh, ch, v) {
  for (let y = y0; y < y0 + rh; y++) {
    let i = (y * w + x0) * 4 + ch;
    for (let x = 0; x < rw; x++, i += 4) data[i] = v;
  }
}

function fillEllipse(data, w, ox, oy, e, ch, v) {
  for (let y = Math.floor(e.y - e.ry); y < Math.ceil(e.y + e.ry); y++) {
    const dy = (y + 0.5 - e.y) / e.ry;
    if (Math.abs(dy) >= 1) continue;
    const half = e.rx * Math.sqrt(1 - dy * dy);
    const x0 = Math.round(e.x - half);
    const x1 = Math.round(e.x + half);
    if (x1 > x0) fillRect(data, w, ox + x0, oy + y, x1 - x0, 1, ch, v);
  }
}

// Raises the AO level of the tile-local rectangle (never touches a footprint, never lowers a level).
function aoRect(data, w, ox, oy, x0, y0, rw, rh, v) {
  for (let y = oy + y0; y < oy + y0 + rh; y++) {
    for (let x = ox + x0; x < ox + x0 + rw; x++) {
      const i = (y * w + x) * 4 + 2;
      if (data[i] !== 255 && data[i] < v) data[i] = v;
    }
  }
}

// map: { rows, legend }. cfg: data/lighting.json `shadows`. Returns { w, h, data, casters } or null (nothing to cast).
export function buildShadowMask(map, cfg) {
  if (map.indoor) return null;
  const cols = map.rows[0].length;
  const rows = map.rows.length;
  const w = cols * TILE;
  const h = rows * TILE;
  const id = (tx, ty) => (tx < 0 || ty < 0 || tx >= cols || ty >= rows ? 'wall' : map.legend[map.rows[ty][tx]]);
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  let casters = 0;
  for (let ty = 0; ty < rows; ty++) {
    for (let tx = 0; tx < cols; tx++) {
      const t = id(tx, ty);
      const ox = tx * TILE;
      const oy = ty * TILE;
      if (t === 'tree') {
        fillEllipse(data, w, ox, oy, cfg.tree, 0, 255);
        fillEllipse(data, w, ox, oy, cfg.tree, 2, 255);
        casters++;
        continue;
      }
      const kind = casterOf(t);
      if (!kind) continue;
      casters++;
      fillRect(data, w, ox, oy, TILE, TILE, kind === 'tall' ? 0 : 1, 255);
      fillRect(data, w, ox, oy, TILE, TILE, 2, 255);
    }
  }
  if (!casters) return null;
  // ambient occlusion on open ground: the strongest band at the foot of a wall (south), narrower at its sides, a faint
  // one behind it; dithered in the shader by level
  for (let ty = 0; ty < rows; ty++) {
    for (let tx = 0; tx < cols; tx++) {
      if (!OCCLUDING.has(id(tx, ty))) continue;
      const open = (x, y) => x >= 0 && y >= 0 && x < cols && y < rows && !NOT_GROUND.has(id(x, y));
      if (open(tx, ty + 1)) { aoRect(data, w, tx * TILE, (ty + 1) * TILE, 0, 0, TILE, 2, AO_STRONG); aoRect(data, w, tx * TILE, (ty + 1) * TILE, 0, 2, TILE, 2, AO_WEAK); }
      if (open(tx - 1, ty)) { aoRect(data, w, (tx - 1) * TILE, ty * TILE, TILE - 2, 0, 2, TILE, AO_STRONG); aoRect(data, w, (tx - 1) * TILE, ty * TILE, TILE - 4, 0, 2, TILE, AO_WEAK); }
      if (open(tx + 1, ty)) { aoRect(data, w, (tx + 1) * TILE, ty * TILE, 0, 0, 2, TILE, AO_STRONG); aoRect(data, w, (tx + 1) * TILE, ty * TILE, 2, 0, 2, TILE, AO_WEAK); }
      if (open(tx, ty - 1)) aoRect(data, w, tx * TILE, (ty - 1) * TILE, 0, TILE - 2, TILE, 2, AO_WEAK);
    }
  }
  return { w, h, data, casters };
}

// The sun ({ length 0..1, angle in degrees below +x }) as whole base pixels for the tall and the low casters.
export function shadowOffsets(sun, cfg, out = { tall: [0, 0], low: [0, 0] }) {
  const a = (sun.angle * Math.PI) / 180;
  const dx = Math.cos(a) * sun.length;
  const dy = Math.sin(a) * sun.length;
  out.tall[0] = Math.round(dx * cfg.tall);
  out.tall[1] = Math.round(dy * cfg.tall);
  out.low[0] = Math.round(dx * cfg.low);
  out.low[1] = Math.round(dy * cfg.low);
  return out;
}

// How strong the cast shadow is: full under a bright sky, gone once the light map's darkness (`dark`, 0..1) reaches `fadeEnd`, softer when overcast.
export function shadowStrength(cfg, dark, overcast = false) {
  const day = Math.max(0, 1 - dark / cfg.fadeEnd);
  return cfg.strength * day * (overcast ? cfg.overcast : 1);
}
