// Seasonal atmosphere (AD-31, story 16.19): what the season and the hour add on top of render/Atmosphere.js.
// - Snow cover: one value that rises while it snows, holds in winter and melts after. Roof tiles and kerbs (a pooled grid of images for the
//   tiles near the view), hedges and tree crowns (pooled images) turn white tile by tile, each at its own threshold, and covered roofs
//   glint. The ground snow of physics/Weather.js is a separate thing and is not touched.
// - Frost at the screen edge in winter and the heat shimmer over dark paved ground on hot clear afternoons run inside the grade pass
//   of the world camera (render/pipelines/AtmosphereFx.js: no pass of its own). Low and Canvas draw the frost as a pre-drawn border
//   and the shimmer as a few pooled heat wisps over road tiles.
// - God rays: additive beams under the tree crowns in daylight, fading out as it gets dark or grey.
// Every layer eases (data/season.json `fade`, `cover`), so a change of season or weather cross-fades without a pop. The tier switches
// are `atmosphere` in data/quality.json. Rendering only; nothing here reads Math.random.
import { ScaledPen } from '../scenes/NpcArt.js';
import { outdoorInfo } from '../scenes/BuildingArt.js';
import { fx } from './pipelines/AtmosphereFx.js';
import { bayer4 } from './atmosphereMath.js';
import { hex } from './baseMath.js';
import {
  approach, coverTarget, coverStep, frostTarget, heatTarget, raysTarget, snowTiles, snowThreshold, snowAlpha, collectSnow, frostPixels,
  pickRays, pickWisps, hash01, KIND_ROOF
} from './seasonMath.js';

const ATLAS = 'season-atlas';
const FX = 'season-fx';
const FROST = 'season-frost';
const SNOW = { hi: '#ffffff', base: '#e6eefa', lit: '#cfdcf1', shade: '#a3b6d8', deep: '#7f93bd' };
const SPECIES = ['oak', 'pine', 'birch'];
const CAP = { oak: [26, 10], pine: [14, 15], birch: [20, 9] }; // tree cap pictures, base px (two variants each)
const HEDGE = [20, 8]; // hedge cap picture
const RAYS = [[7, 44], [10, 52], [13, 58]]; // beam pictures (width, length), they lean right as they fall
const RAY_LEAN = 0.5;

// One lump of snow: lit body, light top left, shaded lower rim (hard pixels, no outline: white reads on every roof and leaf).
function lump(p, cx, cy, rx, ry) {
  p.ell(SNOW.shade, cx, cy + 0.6, rx, ry);
  p.ell(SNOW.base, cx - 0.3, cy - 0.3, rx - 0.5, ry - 0.5);
  p.ell(SNOW.hi, cx - rx * 0.28, cy - ry * 0.4, Math.max(1, rx * 0.45), Math.max(0.8, ry * 0.4));
}

function drawRoof(p, ox, oy, v) {
  for (let k = 0; k < 7; k++) {
    const cx = ox + hash01(v * 13 + k, 1, 71) * 16;
    const cy = oy + hash01(v * 13 + k, 2, 71) * 16;
    lump(p, cx, cy, 3 + hash01(v * 13 + k, 3, 71) * 4, 2.4 + hash01(v * 13 + k, 4, 71) * 3);
  }
  for (let k = 0; k < 5; k++) p.px(SNOW.hi, ox + Math.floor(hash01(v, k, 73) * 15), oy + Math.floor(hash01(k, v, 74) * 15)); // fresh crystals
}

// A kerb line: ragged, broken snow along each side that faces the road (a gap now and then, the line starts 0 to 2 px off the tile edge,
// so no long straight seam forms along a street).
function drawKerb(p, ox, oy, mask) {
  const col = (side, t) => { // [offset from the edge, depth], depth 0: a gap
    const h = hash01(t, side * 5 + mask, 75);
    const g = hash01(t >> 1, side * 7 + mask, 76);
    return g < 0.22 ? [0, 0] : [h < 0.35 ? 1 : h < 0.55 ? 2 : 0, 1 + Math.floor(hash01(t, side, 77) * 3.4)];
  };
  const put = (x, y, w, h) => p.px(SNOW.base, x, y, w, h);
  for (let t = 0; t < 16; t++) {
    let [o, d] = col(1, t);
    if (mask & 1 && d) { put(ox + t, oy + o, 1, d); p.px(SNOW.hi, ox + t, oy + o); p.px(SNOW.shade, ox + t, oy + o + d - 1); }
    [o, d] = col(2, t);
    if (mask & 4 && d) { put(ox + t, oy + 16 - o - d, 1, d); p.px(SNOW.hi, ox + t, oy + 16 - o - d); p.px(SNOW.shade, ox + t, oy + 15 - o); }
    [o, d] = col(3, t);
    if (mask & 8 && d) { put(ox + o, oy + t, d, 1); p.px(SNOW.hi, ox + o, oy + t); p.px(SNOW.shade, ox + o + d - 1, oy + t); }
    [o, d] = col(4, t);
    if (mask & 2 && d) { put(ox + 16 - o - d, oy + t, d, 1); p.px(SNOW.hi, ox + 16 - o - d, oy + t); p.px(SNOW.shade, ox + 15 - o, oy + t); }
  }
}

function drawHedgeCap(p, ox, oy, v) {
  for (let k = 0; k < 4; k++) lump(p, ox + 3 + k * 4.4 + hash01(v, k, 77) * 1.5, oy + 3.5 + hash01(k, v, 78) * 1.5, 3 + hash01(v, k, 79) * 1.5, 2.2);
}

function drawCap(p, ox, oy, species, v) {
  const [w, h] = CAP[species];
  if (species === 'pine') { // small tufts on the tiers, widening downwards
    for (let i = 0; i < 3; i++) lump(p, ox + w / 2 + (v ? 0.8 : -0.4) * (i - 1), oy + 2.5 + i * 4.2, 2.2 + i * 1.7, 1.9);
    return;
  }
  for (let k = 0; k < 4; k++) {
    const t = (k + 0.5) / 4;
    lump(p, ox + 2.5 + t * (w - 5) + hash01(v, k, 81) * 1.2, oy + h * (0.62 - 0.4 * Math.sin(t * Math.PI)) + hash01(k, v, 82), (species === 'oak' ? 4.4 : 3.4) + hash01(v, k, 83), 2.4 + hash01(k, v, 84) * 0.8);
  }
}

// The snow pictures (roof variants, kerb masks, hedge and crown caps) in one atlas, all in base pixels scaled to the render class.
function snowAtlas(scene, f, cfg) {
  if (scene.textures.exists(ATLAS)) return;
  const V = cfg.cover.variants;
  const p = new ScaledPen(scene, ATLAS, Math.max(16 * (V + 16), 64), 16 + 16 + 15, f);
  const frames = [];
  for (let v = 0; v < V; v++) { drawRoof(p, v * 16, 0, v); frames.push([`r${v}`, v * 16, 0, 16, 16]); }
  for (let m = 1; m < 16; m++) { drawKerb(p, (V + m) * 16, 0, m); frames.push([`k${m}`, (V + m) * 16, 0, 16, 16]); }
  for (let v = 0; v < 3; v++) { drawHedgeCap(p, v * HEDGE[0], 16, v); frames.push([`h${v}`, v * HEDGE[0], 16, HEDGE[0], HEDGE[1]]); }
  let x = 0;
  for (const s of SPECIES) for (let v = 0; v < 2; v++) { drawCap(p, x, 32, s, v); frames.push([`c-${s}-${v}`, x, 32, CAP[s][0], CAP[s][1]]); x += CAP[s][0]; }
  p.done();
  for (const [name, fx0, fy0, fw, fh] of frames) p.tex.add(name, 0, Math.round(fx0 * f), Math.round(fy0 * f), Math.round(fw * f), Math.round(fh * f));
}

// Glints, heat wisps and light beams (white, additive): the beams are flat bands of lit pixels with a dithered edge, strongest at the top.
function fxAtlas(scene, f) {
  if (scene.textures.exists(FX)) return;
  const RW = Math.ceil(RAYS[2][0] + RAYS[2][1] * RAY_LEAN) + 1;
  const p = new ScaledPen(scene, FX, Math.max(RW * 3, 24), 58 + 8, f);
  const frames = [];
  for (let k = 0; k < 2; k++) { // glints: a cross, then a lone point
    const ox = k * 5;
    p.px('#ffffff', ox + 2, 2);
    if (k === 0) p.px('#dfeaff', ox + 1, 2).px('#dfeaff', ox + 3, 2).px('#dfeaff', ox + 2, 1).px('#dfeaff', ox + 2, 3);
    frames.push([`s${k}`, ox, 0, 5, 5]);
  }
  for (let k = 0; k < 2; k++) { // wisps: a few broken lines of light
    const ox = 10 + k * 14;
    for (let x = 0; x < 13; x++) if ((x + k * 3) % 5 !== 4) p.px('#fff6e0', ox + x, k === 0 ? 1 : 2);
    frames.push([`w${k}`, ox, 0, 14, 4]);
  }
  RAYS.forEach(([w, len], v) => {
    const ox = v * RW;
    for (let y = 0; y < len; y++) {
      const along = 1 - y / len;
      const x0 = y * RAY_LEAN;
      for (let x = 0; x < w; x++) {
        const across = 1 - Math.abs((x + 0.5) / w - 0.5) * 2;
        const level = across * (0.35 + 0.65 * along);
        if (level + (bayer4(x, y) - 0.5) * 0.55 > 0.42) p.px(level > 0.62 ? '#ffffff' : '#ffe9b0', ox + Math.round(x0 + x), 8 + y);
      }
    }
    frames.push([`b${v}`, ox, 8, RW, len]);
  });
  p.done();
  for (const [name, fx0, fy0, fw, fh] of frames) p.tex.add(name, 0, Math.round(fx0 * f), Math.round(fy0 * f), Math.round(fw * f), Math.round(fh * f));
}

export class Season {
  constructor(scene, ctx, cfg, postFx, lightMap, vegetation) {
    this.scene = scene;
    this.ctx = ctx;
    this.cfg = cfg;
    this.postFx = postFx;
    this.lightMap = lightMap;
    this.veg = vegetation;
    this.L = { cover: 0, frost: 0, heat: 0, rays: 0 };
    this.time = 0;
    this.seed = 0x7e57ab1e;
    this.map = null; // the map the lists below belong to
    this.tiles = null;
    this.hedgeCaps = [];
    this.sel = new Int32Array(3 * 800); // collected snow tiles of the view
    this.th = new Float32Array(800);
    this.snowN = 0;
    this.layoutKey = '';
    this.painted = -1;
    this.bobs = []; // the tile snow images
    this.hedgeImgs = [];
    this.crownImgs = [];
    this.sparks = [];
    this.sparkAge = new Float32Array(64);
    this.sparkAcc = 0;
    this.sparkLive = 0;
    this.beams = [];
    this.wisps = [];
    this.wispN = 0;
    this.wispKey = '';
    this.wispXY = new Int32Array(2 * 64);
    this.treePick = new Array(64);
    this.frostImg = null;
    const f = ctx.res.scale;
    snowAtlas(scene, f, cfg);
    fxAtlas(scene, f);
    const V = cfg.cover.variants;
    this.names = Array.from({ length: V + 16 }, (_, i) => (i < V ? `r${i}` : `k${i - V}`));
    ctx.world.register(this);
    ctx.events.on('quality:changed', () => this.#tier()); // GameScene removes every listener when a run ends
    this.#tier();
  }

  get tier() { return this.ctx.quality.tier.atmosphere; }

  rnd() { this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0; return this.seed / 4294967296; }

  loadMap() { this.map = null; }

  unloadMap() {
    this.map = null;
    this.tiles = null;
    this.hedgeCaps.length = 0;
    this.#hideAll();
  }

  #hideAll() {
    for (const b of this.bobs) b.setVisible(false);
    for (const list of [this.hedgeImgs, this.crownImgs, this.sparks, this.beams, this.wisps]) for (const s of list) s.setVisible(false);
    this.snowN = 0;
    this.sparkLive = 0;
    this.wispN = 0;
    this.layoutKey = '';
    this.wispKey = '';
  }

  // A quality switch: pools grow to the tier's caps (extra pieces hide), the fallbacks follow the tier.
  #tier() {
    const t = this.tier;
    const { scene, cfg, ctx } = this;
    const inv = ctx.res.inv;
    const grow = (list, n, make) => { while (list.length < n) list.push(make()); for (let i = n; i < list.length; i++) list[i].setVisible(false); };
    grow(this.bobs, Math.min(t.snow ?? 0, 800), () => scene.add.image(0, 0, ATLAS, 'r0').setOrigin(0).setScale(inv).setDepth(cfg.cover.depth).setVisible(false));
    grow(this.hedgeImgs, t.hedges ?? 0, () => scene.add.image(0, 0, ATLAS, 'h0').setOrigin(0).setScale(inv).setVisible(false));
    grow(this.crownImgs, t.crowns ?? 0, () => scene.add.image(0, 0, ATLAS, 'c-oak-0').setScale(inv).setVisible(false));
    grow(this.sparks, Math.min(t.sparkle ?? 0, 64), () => scene.add.image(0, 0, FX, 's0').setScale(inv).setDepth(cfg.sparkle.depth).setBlendMode(Phaser.BlendModes.ADD).setVisible(false));
    grow(this.beams, t.rays ?? 0, () => scene.add.image(0, 0, FX, 'b0').setOrigin(0).setScale(inv).setDepth(cfg.rays.depth).setTint(hex(cfg.rays.color)).setBlendMode(Phaser.BlendModes.ADD).setVisible(false));
    grow(this.wisps, Math.min(t.shimmer ?? 0, 64), () => scene.add.image(0, 0, FX, 'w0').setOrigin(0).setScale(inv).setDepth(cfg.heat.wisp.depth).setBlendMode(Phaser.BlendModes.ADD).setVisible(false));
    this.sparkLive = 0;
    this.layoutKey = '';
    this.wispKey = '';
    this.painted = -1;
  }

  // The lists that belong to the map: its snow tiles and the tops of its hedge runs.
  #build() {
    const { ctx, cfg } = this;
    const { map } = ctx;
    this.map = map;
    this.hedgeCaps.length = 0;
    this.tiles = null;
    this.layoutKey = '';
    if (map.indoor) return;
    this.tiles = snowTiles(map, outdoorInfo(map, ctx.world.id), cfg.cover.variants);
    const hedge = (x, y) => map.legend[map.rows[y]?.[x]] === 'hedge';
    for (const run of this.veg.runs) {
      for (const [tx, ty] of run.tiles) {
        if (hedge(tx, ty - 1)) continue;
        this.hedgeCaps.push({ run, x: tx * map.tileSize, y: ty * map.tileSize - 4, depth: (ty + 1) * map.tileSize + 0.05, th: snowThreshold(tx, ty), frame: `h${Math.floor(hash01(tx, ty, 85) * 3)}` });
      }
    }
  }

  // ---- layers ----------------------------------------------------------------------------------------------------------------------
  #layers(dt) {
    const { ctx, cfg, L } = this;
    const w = ctx.weather;
    const t = this.tier;
    const indoor = ctx.map.indoor;
    const s = { season: ctx.day.season, snowing: w.state === 'snow', state: w.state, minute: ctx.day.minute, indoor, dark: this.lightMap.dark };
    L.cover = t.snow ? coverStep(L.cover, coverTarget(cfg, s), dt, cfg, indoor) : 0;
    L.frost = approach(L.frost, t.frost ? frostTarget(cfg, s) : 0, dt, cfg.fade.frost);
    L.heat = approach(L.heat, t.shimmer ? heatTarget(cfg, s) : 0, dt, cfg.fade.heat);
    L.rays = approach(L.rays, t.rays ? raysTarget(cfg, s) : 0, dt, cfg.fade.rays);
  }

  // Jumps every layer to where the season, weather and hour send it (the screenshot and frame scripts; a game never calls it).
  settle() {
    const { ctx, cfg, L } = this;
    const t = this.tier;
    const indoor = ctx.map.indoor;
    const s = { season: ctx.day.season, snowing: ctx.weather.state === 'snow', state: ctx.weather.state, minute: ctx.day.minute, indoor, dark: this.lightMap.dark };
    L.cover = t.snow ? coverTarget(cfg, s) * (indoor ? 0 : 1) : 0;
    L.frost = t.frost ? frostTarget(cfg, s) : 0;
    L.heat = t.shimmer ? heatTarget(cfg, s) : 0;
    L.rays = t.rays ? raysTarget(cfg, s) : 0;
  }

  // The grade pass carries the frost and the shimmer.
  #pass() {
    const { L, cfg } = this;
    const on = this.postFx.atmosphereAllowed;
    fx.frost[0] = on ? L.frost : 0; fx.frost[1] = cfg.frost.reach; fx.frost[2] = cfg.frost.alpha; fx.frost[3] = cfg.frost.steps;
    for (let i = 0; i < 3; i++) fx.frostRgb[i] = cfg.frost.rgb[i];
    fx.heat[0] = on ? L.heat : 0; fx.heat[1] = cfg.heat.band; fx.heat[2] = cfg.heat.lift;
  }

  // Low and Canvas: the frost as a border picture that follows the view.
  #frostBorder(view) {
    const show = !this.postFx.atmosphereAllowed && this.L.frost > 0.004;
    if (!show) { if (this.frostImg?.visible) this.frostImg.setVisible(false); return; }
    if (!this.frostImg) {
      const { scene, cfg } = this;
      const tex = scene.textures.exists(FROST) ? scene.textures.get(FROST) : scene.textures.createCanvas(FROST, 480, 270);
      if (tex.getContext) { tex.getContext().putImageData(new ImageData(frostPixels(480, 270, cfg), 480, 270), 0, 0); tex.refresh(); tex.setFilter(Phaser.Textures.FilterMode.NEAREST); }
      this.frostImg = scene.add.image(0, 0, FROST).setOrigin(0).setDepth(9297);
    }
    this.frostImg.setPosition(view.x, view.y).setDisplaySize(view.width, view.height).setAlpha(this.L.frost).setVisible(true);
  }

  // ---- snow cover ------------------------------------------------------------------------------------------------------------------
  #cover(view) {
    const { ctx, cfg } = this;
    const cap = Math.min(this.bobs.length, this.tier.snow ?? 0);
    if (this.L.cover <= 0.004 || !this.tiles || cap === 0) {
      if (this.snowN) { for (let i = 0; i < this.snowN; i++) this.bobs[i].setVisible(false); this.snowN = 0; this.layoutKey = ''; }
      return;
    }
    const ts = ctx.map.tileSize;
    const cols = this.tiles.kind.length / ctx.map.rows.length;
    const key = `${Math.floor(view.x / ts)},${Math.floor(view.y / ts)},${Math.floor(view.right / ts)},${Math.floor(view.bottom / ts)},${cap}`;
    if (key !== this.layoutKey) {
      this.layoutKey = key;
      const n = collectSnow(this.sel, cap, view, ts, cols, ctx.map.rows.length, this.tiles);
      for (let i = 0; i < n; i++) {
        const tx = this.sel[i * 3], ty = this.sel[i * 3 + 1];
        const b = this.bobs[i];
        this.th[i] = snowThreshold(tx, ty);
        b.setFrame(this.names[this.sel[i * 3 + 2]]);
        b.setPosition(tx * ts, ty * ts);
      }
      for (let i = n; i < this.snowN; i++) this.bobs[i].setVisible(false);
      this.snowN = n;
      this.painted = -1;
    }
    if (Math.abs(this.L.cover - this.painted) < 0.004) return;
    this.painted = this.L.cover;
    for (let i = 0; i < this.snowN; i++) {
      const a = snowAlpha(this.L.cover, this.th[i], cfg.cover.soft);
      const b = this.bobs[i];
      if (a > 0) { b.setAlpha(a); if (!b.visible) b.setVisible(true); } else if (b.visible) b.setVisible(false);
    }
  }

  // Hedge tops and tree caps follow their sprites (the hedge run's lean, the crown's fade behind a kid).
  #caps(view) {
    const { cfg, L } = this;
    const show = L.cover > 0.004;
    let n = 0;
    const hs = this.hedgeImgs;
    for (let i = 0; i < hs.length; i++) {
      let hide = true;
      if (show) {
        while (n < this.hedgeCaps.length) {
          const c = this.hedgeCaps[n++];
          if (c.x < view.x - 24 || c.x > view.right + 8 || c.y < view.y - 12 || c.y > view.bottom + 12) continue;
          const a = snowAlpha(L.cover, c.th, cfg.cover.soft);
          if (a <= 0) continue;
          hs[i].setFrame(c.frame).setPosition(c.x - 2 + c.run.shift, c.y).setDepth(c.depth).setAlpha(a).setVisible(true);
          hide = false;
          break;
        }
      }
      if (hide && hs[i].visible) hs[i].setVisible(false);
    }
    const cs = this.crownImgs;
    const trees = this.veg.trees;
    let k = 0;
    for (let i = 0; i < cs.length; i++) {
      let hide = true;
      if (show) {
        while (k < trees.length) {
          const t = trees[k++];
          if (t.cx < view.x - 24 || t.cx > view.right + 24 || t.cy < view.y - 28 || t.cy > view.bottom + 28) continue;
          const a = snowAlpha(L.cover, snowThreshold(t.tx, t.ty), cfg.cover.soft) * t.fade;
          if (a <= 0) continue;
          cs[i].setFrame(`c-${t.species}-${t.shape & 1}`).setPosition(t.cx + t.shift, t.cy - t.ry + CAP[t.species][1] * 0.5 - 1).setDepth(8000.5).setAlpha(a).setVisible(true);
          hide = false;
          break;
        }
      }
      if (hide && cs[i].visible) cs[i].setVisible(false);
    }
  }

  // Glints on covered roofs: short-lived stars at fixed pseudo-random places.
  #sparkle(dt, view) {
    const pool = this.sparks;
    const life = this.cfg.sparkle.life;
    for (let i = 0; i < pool.length; i++) {
      const s = pool[i];
      if (!s.visible) continue;
      this.sparkAge[i] += dt;
      const u = this.sparkAge[i] / life;
      if (u >= 1) { s.setVisible(false); this.sparkLive--; continue; }
      s.setFrame(u > 0.35 && u < 0.65 ? 's0' : 's1').setAlpha(1 - Math.abs(u - 0.5) * 1.4);
    }
    const cap = Math.min(pool.length, this.tier.sparkle ?? 0);
    if (window.SCHULWEG_GAME?.sparkleOff || this.L.cover < 0.3 || !this.tiles || cap === 0) return; // sparkleOff: test hook
    this.sparkAcc += this.cfg.sparkle.rate * this.L.cover * (cap / 12) * dt;
    const ts = this.ctx.map.tileSize;
    const cols = this.tiles.kind.length / this.ctx.map.rows.length;
    for (; this.sparkAcc >= 1; this.sparkAcc--) {
      const x = view.x + this.rnd() * view.width, y = view.y + this.rnd() * view.height;
      const tx = Math.floor(x / ts), ty = Math.floor(y / ts);
      if (tx < 0 || ty < 0 || tx >= cols || ty >= this.ctx.map.rows.length || this.tiles.kind[ty * cols + tx] !== KIND_ROOF) continue;
      if (snowAlpha(this.L.cover, snowThreshold(tx, ty), this.cfg.cover.soft) < 0.6) continue;
      for (let i = 0; i < cap; i++) {
        if (pool[i].visible) continue;
        this.sparkAge[i] = 0;
        pool[i].setPosition(Math.round(x), Math.round(y)).setFrame('s1').setAlpha(0.1).setVisible(true);
        this.sparkLive++;
        break;
      }
    }
  }

  // ---- god rays: two beams per picked tree, breathing slowly ---------------------------------------------------------------------
  #rays(view) {
    const { cfg, L, beams } = this;
    const on = L.rays > 0.004 && beams.length > 0;
    const n = on ? pickRays(this.veg.trees, view, Math.min(64, beams.length >> 1), this.treePick, cfg.rays.share) : 0;
    const base = L.rays * cfg.rays.alpha;
    for (let i = 0; i < beams.length; i++) {
      const s = beams[i];
      const t = this.treePick[i >> 1];
      if ((i >> 1) >= n) { if (s.visible) s.setVisible(false); continue; }
      const j = i & 1;
      const ph = hash01(t.tx, t.ty, 59 + j) * 6.28;
      const w = Math.floor(hash01(t.tx, t.ty, 61 + j) * 3);
      s.setFrame(`b${w}`).setPosition(Math.round(t.cx - t.rx * 0.5 + j * t.rx * 0.55 + t.shift), Math.round(t.cy - t.ry * 0.15)).setAlpha(base * (0.65 + 0.35 * Math.sin(this.time * 0.6 + ph))).setVisible(true);
    }
  }

  // ---- heat wisps (Low and Canvas): the shimmer as a few drifting lines over road tiles --------------------------------------------
  #wisps(view) {
    const { cfg, ctx, L, wisps } = this;
    const cap = Math.min(wisps.length, this.tier.shimmer ?? 0);
    if (this.postFx.atmosphereAllowed || L.heat < 0.004 || cap === 0 || !this.tiles) {
      if (this.wispN) { for (let i = 0; i < this.wispN; i++) wisps[i].setVisible(false); this.wispN = 0; this.wispKey = ''; }
      return;
    }
    const ts = ctx.map.tileSize;
    const rows = ctx.map.rows.length;
    const key = `${Math.floor(view.x / ts)},${Math.floor(view.y / ts)},${Math.floor(view.right / ts)},${Math.floor(view.bottom / ts)},${cap}`;
    if (key !== this.wispKey) {
      this.wispKey = key;
      const { surfaces } = ctx;
      const n = pickWisps(this.wispXY, cap, view, ts, ctx.map.rows[0].length, rows, (x, y) => { const b = surfaces.base(x, y); return b === 'asphalt' || b === 'lane'; }, cfg.heat.wisp.share);
      for (let i = n; i < this.wispN; i++) wisps[i].setVisible(false);
      this.wispN = n;
    }
    for (let i = 0; i < this.wispN; i++) {
      const rise = (this.time * 0.25 + i * 0.37) % 1;
      wisps[i].setFrame(i & 1 ? 'w1' : 'w0').setPosition(this.wispXY[i * 2], this.wispXY[i * 2 + 1] - rise * 5)
        .setAlpha(L.heat * cfg.heat.wisp.alpha * (0.5 + 0.5 * Math.sin(this.time * 2.2 + i)) * Math.sin(rise * Math.PI)).setVisible(true);
    }
  }

  update(dt) {
    const view = this.scene.cameras.main.worldView;
    this.time += dt;
    if (this.map !== this.ctx.map) this.#build();
    this.#layers(dt);
    this.#pass();
    this.#frostBorder(view);
    this.#cover(view);
    this.#caps(view);
    this.#sparkle(dt, view);
    this.#rays(view);
    this.#wisps(view);
  }
}
