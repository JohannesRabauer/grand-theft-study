// Atmosphere (AD-31, story 16.12): everything the weather and the hour put between the player and the ground.
// - Haze: the fog state (banks) and the morning mist, drifting with the wind. Medium and High draw it, the drifting cloud shadows of a
//   sunny day and a faint veil of distant rain inside the grade pass of the world camera (render/pipelines/AtmosphereFx.js, carried by
//   GradeFx.js: no pass of its own). Low and Canvas draw the same layers as scrolling pre-drawn noise banks under the light map.
// - Wet ground: in rain the paved tiles near the camera shine one after the other (a pooled grid of sheen tiles from one atlas) and dry
//   again slowly; lit lamp posts mirror a streak on wet ground (Medium and High) and rain rings run on the puddles (every tier, fewer on Low).
// Every layer eases (data/atmosphere.json `fade`), so a change of weather cross-fades without a pop. The tier switches are `atmosphere`
// in data/quality.json. Rendering only; surfaces, collision and the puddles of physics/Weather.js are not touched.
import { ScaledPen } from '../scenes/NpcArt.js';
import { fx } from './pipelines/AtmosphereFx.js';
import {
  approach, layerTargets, hazeBlend, wetStep, wetThreshold, wetAlpha, collectWet, noiseTile, hazePixels, shadowPixels,
  rippleFrame, pickReflections, drift, hash01
} from './atmosphereMath.js';
import { hex, rgba } from './baseMath.js';

const rgbHex = c => (Math.round(c[0] * 255) << 16) | (Math.round(c[1] * 255) << 8) | Math.round(c[2] * 255);
const SHEEN = 'atmo-sheen';
const RIPPLE = 'atmo-ripple';
const RFRAMES = 3;
const FRAMES = ['0', '1', '2']; // frame names without building a string per frame
const RW = 14, RH = 8; // ripple picture, base px
const FW = 7, FH = 26; // reflection picture, base px

// One atlas of sheen tiles: 2 classes (dark ground, light ground) x `variants`, each 16x16 base px.
function sheenAtlas(scene, f, cfg) {
  if (scene.textures.exists(SHEEN)) return;
  const n = cfg.wet.variants;
  const c = cfg.wet.colors;
  const p = new ScaledPen(scene, SHEEN, 16 * n, 32, f);
  for (let cls = 0; cls < 2; cls++) {
    for (let v = 0; v < n; v++) {
      const ox = v * 16, oy = cls * 16;
      const shade = cls === 0 ? c.shade : c.dryShade;
      const specks = cls === 0 ? 11 : 7; // darker wet patches, scattered (a regular dither would read as a screen door)
      for (let k = 0; k < specks; k++) {
        const x = Math.floor(hash01(v * 31 + k, cls, 21) * 15), y = Math.floor(hash01(v * 17 + k, cls, 22) * 16);
        p.px(shade[k & 1], ox + x, oy + y, 1 + (k % 3 === 0 ? 1 : 0), 1);
      }
      const streaks = 2 + (v & 1);
      for (let k = 0; k < streaks; k++) {
        const y = 1 + Math.floor(hash01(v * 7 + k, cls, 11) * 13);
        const x = Math.floor(hash01(v * 5 + k, cls, 12) * 9);
        const len = 3 + Math.floor(hash01(v * 3 + k, cls, 13) * 5);
        p.px(c.sky, ox + x, oy + y, len, 1).px(c.high, ox + x, oy + y, 1, 1);
        if (k === 0) p.px(c.sky, ox + x + 2, oy + y + 1, Math.max(1, len - 3), 1);
      }
    }
  }
  p.done();
  for (let cls = 0; cls < 2; cls++) for (let v = 0; v < n; v++) p.tex.add(`${cls}-${v}`, 0, Math.round(v * 16 * f), Math.round(cls * 16 * f), Math.round(16 * f), Math.round(16 * f));
}

// Rings on a puddle: three frames growing from a dot to a flat ellipse.
function rippleAtlas(scene, f, cfg) {
  if (scene.textures.exists(RIPPLE)) return;
  const col = cfg.ripples.color;
  const p = new ScaledPen(scene, RIPPLE, RW * RFRAMES, RH, f);
  const radii = [[1.5, 0.8], [3.5, 1.8], [6, 3]];
  for (let k = 0; k < RFRAMES; k++) {
    const [rx, ry] = radii[k];
    const seen = new Set();
    for (let a = 0; a < 6.3; a += 0.12) {
      const x = Math.round(k * RW + RW / 2 + Math.cos(a) * rx);
      const y = Math.round(RH / 2 + Math.sin(a) * ry);
      if (seen.has(x * 64 + y)) continue;
      seen.add(x * 64 + y);
      p.px(col, x, y);
    }
  }
  p.done();
  for (let k = 0; k < RFRAMES; k++) p.tex.add(`${k}`, 0, Math.round(k * RW * f), 0, Math.round(RW * f), Math.round(RH * f));
}

// The mirror of a lamp on wet ground (white, tinted by the lamp): a streak that thins out and breaks up; two frames swap slowly.
function reflectAtlas(scene, f) {
  if (scene.textures.exists('atmo-reflect')) return;
  const p = new ScaledPen(scene, 'atmo-reflect', FW * 2, FH, f);
  for (let k = 0; k < 2; k++) {
    for (let y = 0; y < FH; y++) {
      if (y > 7 && (y + k) % 3 === 2) continue;
      const w = y < 6 ? 5 : y < 15 ? 3 : 1;
      const col = y < 4 ? '#ffffff' : y < 12 ? '#d6d6d6' : '#8c8c8c';
      p.px(col, k * FW + (FW - w) / 2, y, w, 1);
    }
  }
  p.done();
  for (let k = 0; k < 2; k++) p.tex.add(`${k}`, 0, Math.round(k * FW * f), 0, Math.round(FW * f), Math.round(FH * f));
}

export class Atmosphere {
  constructor(scene, ctx, cfg, postFx, lightMap, streetLights) {
    this.scene = scene;
    this.ctx = ctx;
    this.cfg = cfg;
    this.postFx = postFx;
    this.lightMap = lightMap;
    this.streetLights = streetLights;
    this.L = { fog: 0, mist: 0, clouds: 0, curtain: 0 };
    this.haze = { density: 0, lo: 0, hi: 1, scale: 1, color: [1, 1, 1] };
    this.wet = 0;
    this.time = 0;
    this.hx = 0; this.hy = 0; this.cx = 0; this.cy = 0; // haze and cloud offsets
    this.shade = rgba(hex('#28345c')).slice(0, 3);
    this.ambient = [1, 1, 1];
    this.seed = 0x5eed1234;
    this.spr = []; // wet sheen sprites
    this.tiles = new Int32Array(4 * 800);
    this.th = new Float32Array(800);
    this.wetN = 0;
    this.layoutKey = '';
    this.paintedWet = -1;
    this.refl = [];
    this.picked = new Array(32);
    this.rip = [];
    this.ripAge = new Float32Array(64);
    this.ripLive = 0;
    this.ripAcc = 0;
    this.sheets = null;
    const f = ctx.res.scale;
    sheenAtlas(scene, f, cfg);
    rippleAtlas(scene, f, cfg);
    reflectAtlas(scene, f);
    const spots = new WeakMap(); // lamp -> does its foot stand on wettable ground (a lamp never moves)
    this.footX = l => (l.img ? l.img.x : l.x - 4.5); // lamp posts carry their picture; the park lamps are map objects with a head 33 px over the foot
    this.footY = l => (l.img ? l.img.y : l.y + 33);
    this.isReflecting = l => {
      if (l.radius < 50 || !(l.shown || l.handle)) return false; // a lit lamp in view (signs and windows stand on walls)
      let v = spots.get(l);
      if (v === undefined) {
        const { surfaces } = ctx;
        v = cfg.wet.classes[surfaces.base(Math.floor(this.footX(l) / surfaces.tileSize), Math.floor((this.footY(l) + 4) / surfaces.tileSize))] !== undefined;
        spots.set(l, v);
      }
      return v;
    };
    ctx.world.register(this);
    ctx.events.on('quality:changed', () => this.#tier()); // GameScene removes every listener when a run ends
    this.#tier();
  }

  loadMap() { this.layoutKey = ''; }

  unloadMap() {
    for (const s of this.spr) s.setVisible(false);
    for (const s of this.rip) s.setVisible(false);
    for (const s of this.refl) s.setVisible(false);
    this.ripLive = 0;
    this.wetN = 0;
    this.layoutKey = '';
  }

  get tier() { return this.ctx.quality.tier.atmosphere; }

  rnd() { this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0; return this.seed / 4294967296; }

  // A quality switch: pools grow to the tier's caps (extra sprites hide), the fallback banks follow the tier.
  #tier() {
    const t = this.tier;
    const { scene, cfg } = this;
    const grow = (list, n, make) => { while (list.length < n) list.push(make()); for (let i = n; i < list.length; i++) list[i].setVisible(false); };
    const depth = cfg.wet.depth;
    grow(this.spr, Math.min(t.wet, 800), () => scene.add.image(0, 0, SHEEN, '0-0').setOrigin(0).setScale(this.ctx.res.inv).setDepth(depth).setVisible(false));
    grow(this.refl, t.reflections, () => scene.add.image(0, 0, 'atmo-reflect', '0').setOrigin(0.5, 0).setScale(this.ctx.res.inv).setDepth(cfg.reflect.depth).setBlendMode(Phaser.BlendModes.ADD).setVisible(false));
    grow(this.rip, Math.min(t.ripples, 64), () => scene.add.image(0, 0, RIPPLE, '0').setScale(this.ctx.res.inv).setDepth(cfg.ripples.depth).setVisible(false));
    this.ripLive = 0;
    this.layoutKey = '';
    this.paintedWet = -1;
    this.#sheets();
  }

  // Low and Canvas: the haze and the cloud shadows as scrolling tile sprites (built when first needed).
  #sheets() {
    if (this.postFx.atmosphereAllowed) {
      if (this.sheets) for (const k of ['fog', 'mist', 'clouds']) this.sheets[k].setVisible(false);
      return;
    }
    if (this.sheets) return;
    this.#banks();
    const mk = (key, depth) => this.scene.add.tileSprite(0, 0, 480, 270, key).setOrigin(0).setDepth(depth).setVisible(false);
    this.sheets = { fog: mk('atmo-fog', 9296), mist: mk('atmo-mist', 9296.1), clouds: mk('atmo-clouds', 9295.9) };
  }

  #banks() {
    const { scene, cfg } = this;
    if (scene.textures.exists('atmo-clouds')) return;
    const size = cfg.bank;
    const make = (key, px) => {
      if (scene.textures.exists(key)) return;
      const tex = scene.textures.createCanvas(key, size, size);
      tex.getContext().putImageData(new ImageData(px, size, size), 0, 0);
      tex.refresh();
      tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
    };
    const white = [255, 255, 255];
    make('atmo-fog', hazePixels(noiseTile(size, 11, 3, 3), size, cfg.fog.lo, cfg.fog.hi, cfg.steps, white));
    make('atmo-mist', hazePixels(noiseTile(size, 23, 3, 4), size, cfg.mist.lo, cfg.mist.hi, cfg.steps, white));
    make('atmo-clouds', shadowPixels(noiseTile(size, 37, 3, 3), size, cfg.clouds.lo, cfg.clouds.hi, this.shade));
  }

  // ---- the layers ----------------------------------------------------------------------------------------------------------------
  #targets() {
    const { ctx, cfg } = this;
    const t = this.tier;
    const w = ctx.weather;
    const r = layerTargets(cfg, { state: w.state, minute: ctx.day.minute, dark: this.lightMap.dark, indoor: ctx.map.indoor, rain: w.intensity });
    if (!t.fog) r.fog = 0;
    if (!t.mist) r.mist = 0;
    if (!t.clouds) r.clouds = 0;
    if (!t.curtain) r.curtain = 0;
    return r;
  }

  #layers(dt) {
    const { ctx, cfg, L } = this;
    const target = this.#targets();
    L.fog = approach(L.fog, target.fog, dt, cfg.fade.fog);
    L.mist = approach(L.mist, target.mist, dt, cfg.fade.mist);
    L.clouds = approach(L.clouds, target.clouds, dt, cfg.fade.clouds);
    L.curtain = approach(L.curtain, target.curtain, dt, cfg.fade.curtain);
    this.wet = wetStep(this.wet, ctx.map.indoor ? 0 : ctx.weather.intensity, dt, cfg);
    const d = drift(ctx.wind.vector, cfg);
    this.hx += d.x * dt; this.hy += d.y * dt;
    this.cx += d.x * cfg.clouds.driftMul * dt; this.cy += d.y * cfg.clouds.driftMul * dt;
    hazeBlend(cfg, L.fog, L.mist, this.haze);
  }

  // Jumps every layer to where the current weather and hour send it (the screenshot and frame scripts; a game never calls it).
  settle() {
    Object.assign(this.L, this.#targets());
    this.L.curtain = this.ctx.weather.raining && this.tier.curtain ? 1 : 0;
    this.wet = this.ctx.weather.raining && !this.ctx.map.indoor ? 1 : 0;
    hazeBlend(this.cfg, this.L.fog, this.L.mist, this.haze);
  }

  #ambient() {
    const a = this.ctx.lights.mapActive ? this.lightMap.amb : null;
    this.ambient[0] = a ? a.r : 1; this.ambient[1] = a ? a.g : 1; this.ambient[2] = a ? a.b : 1;
  }

  // The grade pass carries the layers: set its shared values (a layer at zero costs nothing in the shader).
  #pass(view) {
    const { L, haze, cfg } = this;
    const a = this.ambient;
    fx.view[0] = view.x; fx.view[1] = view.y; fx.view[2] = view.width; fx.view[3] = view.height;
    fx.haze[0] = haze.density; fx.haze[1] = haze.color[0] * a[0]; fx.haze[2] = haze.color[1] * a[1]; fx.haze[3] = haze.color[2] * a[2];
    fx.band[0] = haze.lo; fx.band[1] = haze.hi; fx.band[2] = haze.scale; fx.band[3] = cfg.steps;
    fx.cloud[0] = L.clouds * cfg.clouds.strength; fx.cloud[1] = cfg.clouds.scale; fx.cloud[2] = this.cx; fx.cloud[3] = this.cy;
    fx.shade[0] = cfg.clouds.rgb[0]; fx.shade[1] = cfg.clouds.rgb[1]; fx.shade[2] = cfg.clouds.rgb[2]; fx.shade[3] = cfg.clouds.lo;
    fx.hi = cfg.clouds.hi;
    fx.veil[0] = L.curtain * cfg.curtain.alpha * 5; fx.veil[1] = cfg.curtain.slant; fx.veil[2] = cfg.curtain.speed;
    fx.amb[0] = a[0]; fx.amb[1] = a[1]; fx.amb[2] = a[2];
    fx.time = this.time; fx.drift[0] = this.hx; fx.drift[1] = this.hy;
  }

  // Low and Canvas: the same layers as sprites that follow the view.
  #sprites(view) {
    const s = this.sheets;
    if (!s) return;
    const { L, haze, cfg } = this;
    const fit = (spr, alpha, ox, oy, tint) => {
      const show = alpha > 0.004;
      if (spr.visible !== show) spr.setVisible(show);
      if (!show) return;
      const w = Math.ceil(view.width) + 2, h = Math.ceil(view.height) + 2;
      if (spr.width !== w || spr.height !== h) spr.setSize(w, h);
      spr.setPosition(Math.floor(view.x), Math.floor(view.y)).setTilePosition(Math.floor(view.x - ox), Math.floor(view.y - oy)).setAlpha(alpha);
      if (tint !== undefined) spr.setTint(tint);
    };
    const col = rgbHex(haze.color);
    fit(s.fog, L.fog * cfg.fog.density, this.hx, this.hy, col);
    fit(s.mist, L.mist * cfg.mist.density * (1 - L.fog * 0.6), this.hx * 0.8, this.hy * 0.8, col);
    fit(s.clouds, L.clouds * cfg.clouds.strength, this.cx, this.cy);
  }

  // ---- wet ground ----------------------------------------------------------------------------------------------------------------
  #wetGround(view) {
    const { ctx } = this;
    const cap = Math.min(this.spr.length, this.tier.wet);
    if (this.wet <= 0 || ctx.map.indoor || cap === 0) {
      if (this.wetN) { for (let i = 0; i < this.wetN; i++) this.spr[i].setVisible(false); this.wetN = 0; this.layoutKey = ''; }
      return;
    }
    const { surfaces } = ctx;
    const ts = surfaces.tileSize;
    const key = `${Math.floor(view.x / ts)},${Math.floor(view.y / ts)},${Math.floor(view.right / ts)},${Math.floor(view.bottom / ts)},${surfaces.over.size},${cap}`;
    if (key !== this.layoutKey) {
      this.layoutKey = key;
      const n = collectWet(this.tiles, cap, view, ts, surfaces.cols, surfaces.rowCount, (x, y) => surfaces.base(x, y), (x, y) => surfaces.at(x * ts, y * ts), this.cfg.wet.classes, this.cfg.wet.variants);
      for (let i = 0; i < n; i++) {
        const tx = this.tiles[i * 4], ty = this.tiles[i * 4 + 1];
        this.th[i] = wetThreshold(tx, ty);
        this.spr[i].setFrame(`${this.tiles[i * 4 + 2]}-${this.tiles[i * 4 + 3]}`).setPosition(tx * ts, ty * ts);
      }
      for (let i = n; i < this.wetN; i++) this.spr[i].setVisible(false);
      this.wetN = n;
      this.paintedWet = -1;
    }
    if (Math.abs(this.wet - this.paintedWet) < 0.004) return;
    this.paintedWet = this.wet;
    for (let i = 0; i < this.wetN; i++) {
      const a = wetAlpha(this.wet, this.th[i]);
      const s = this.spr[i];
      if (a > 0) { s.setAlpha(a); if (!s.visible) s.setVisible(true); } else if (s.visible) s.setVisible(false);
    }
  }

  // Lit lamp posts on wet ground mirror a streak below their foot.
  #reflections(view) {
    const cap = Math.min(this.refl.length, this.tier.reflections);
    const lamps = this.streetLights.live;
    const k = Math.min(1, this.lightMap.dark / this.cfg.reflect.darkness) * this.wet;
    let n = 0;
    if (cap > 0 && lamps && k > 0.02 && this.ctx.lights.mapActive) {
      n = pickReflections(lamps, cap, this.picked, this.isReflecting);
    }
    const frame = FRAMES[Math.floor(this.time * 1.6) & 1];
    for (let i = 0; i < this.refl.length; i++) {
      const s = this.refl[i];
      if (i >= n) { if (s.visible) s.setVisible(false); continue; }
      const l = this.picked[i];
      s.setPosition(this.footX(l), this.footY(l) + 1).setFrame(frame).setTint(l.color).setAlpha((l.glow ? l.glow.alpha : 1) * this.cfg.reflect.intensity * k).setVisible(true);
    }
  }

  // Rings on the puddles of physics/Weather.js while it rains.
  #ripples(dt, view) {
    const { cfg, ctx } = this;
    const w = ctx.weather;
    const pool = this.rip;
    const life = cfg.ripples.life;
    for (let i = 0; i < pool.length; i++) {
      const s = pool[i];
      if (!s.visible) continue;
      this.ripAge[i] += dt;
      const fr = rippleFrame(this.ripAge[i], life, RFRAMES);
      if (fr < 0) { s.setVisible(false); this.ripLive--; continue; }
      s.setFrame(FRAMES[fr]).setAlpha(1 - this.ripAge[i] / life * 0.6);
    }
    const cap = Math.min(pool.length, this.tier.ripples);
    if (window.SCHULWEG_GAME?.ripplesOff || w.intensity < 0.3 || w.count === 0 || cap === 0 || ctx.map.indoor) return; // ripplesOff: test hook
    this.ripAcc += cfg.ripples.rate * w.intensity * (cap / 12) * dt;
    const ts = ctx.surfaces.tileSize;
    for (; this.ripAcc >= 1; this.ripAcc--) {
      const j = (w.head + Math.floor(this.rnd() * w.count)) % w.cfg.maxWet;
      const tx = w.tx[j], ty = w.ty[j];
      const x = tx * ts + 4 + this.rnd() * (ts - 8), y = ty * ts + 5 + this.rnd() * (ts - 9);
      if (x < view.x || x > view.right || y < view.y || y > view.bottom) continue;
      for (let i = 0; i < cap; i++) {
        if (pool[i].visible) continue;
        this.ripAge[i] = 0;
        pool[i].setPosition(Math.round(x), Math.round(y)).setFrame(FRAMES[0]).setAlpha(1).setVisible(true);
        this.ripLive++;
        break;
      }
    }
  }

  update(dt) {
    const view = this.scene.cameras.main.worldView;
    this.time += dt;
    this.#layers(dt);
    this.#ambient();
    if (this.postFx.atmosphereAllowed) this.#pass(view);
    else this.#sprites(view);
    this.#wetGround(view);
    this.#reflections(view);
    this.#ripples(dt, view);
  }
}
