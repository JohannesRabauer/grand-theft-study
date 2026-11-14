// Interiors in the world (story 16.10, AD-31, CAP-35): the home, the school and the dojo. The walls and floors are baked into the
// ground (scenes/InteriorArt.js); this world system adds what stands in the room and what shines in it, all built once per map:
// - furniture and clutter from data/interiors.json `rooms.<map>.items` (images from the interior atlas, depth by their base line),
//   and a brick backdrop beyond the walls so a room smaller than the view never shows a flat black margin;
// - ceiling lamps (pendant, tube, paper, table, andon) that switch on in the evening, when it is dark or gloomy outside, each a
//   little earlier or later;
// - window light: a shaft of daylight on the floor under every window, leaning with the sun, as strong as the daylight and the
//   weather allow.
// Light goes through ctx.lights (a pooled light per lamp and per window) on Medium and High, where the light map runs indoors with
// the interior ambient; on Low and Canvas the same shafts are additive images, the lamps get an additive glow image and a dim
// rectangle carries the night mood. Nothing here is random, nothing is created while playing, nothing touches collision.
import { ATLAS, GLOW, LAMPS, PROPS, SHAFT, lampKey, propKey, shaftKey } from '../scenes/InteriorProps.js';
import { BACKDROP } from '../scenes/InteriorArt.js';
import { clamp01, hex } from './baseMath.js';
import { daylight, interiorNight, isInterior, itemsOf, lampSchedule, lampTarget, shaftSkew, windowList } from './interiorMath.js';

const MARGIN = 640; // base pixels of backdrop around the map

export class Interiors {
  constructor(scene, ctx, cfg, lightMap) {
    this.scene = scene;
    this.ctx = ctx;
    this.cfg = cfg;
    this.lightMap = lightMap;
    this.sched = lampSchedule(cfg);
    this.parts = [];
    this.wins = [];
    this.lamps = [];
    this.back = [];
    this.tintBack = -1;
    this.dim = null;
    this.day = 0;
    this.skew = -1;
    this.room = null;
    ctx.world.register(this);
    ctx.events.on('quality:changed', () => this.#dropLights());
    this.loadMap();
  }

  get active() { return !!this.room; }

  loadMap() {
    const { ctx, scene, cfg } = this;
    const id = ctx.world.id;
    if (!ctx.map.indoor || !isInterior(id)) return;
    const room = cfg.rooms[id];
    if (!room) return;
    this.room = room;
    const { inv } = ctx.res;
    const ts = ctx.map.tileSize;
    const W = ctx.map.rows[0].length * ts;
    const H = ctx.map.rows.length * ts;
    // the backdrop: four strips round the map above the light map (it is not lit by the room's lamps; `tintBack` darkens it at night)
    for (const [x, y, w, h] of [[-MARGIN, -MARGIN, W + 2 * MARGIN, MARGIN], [-MARGIN, H, W + 2 * MARGIN, MARGIN], [-MARGIN, 0, MARGIN, H], [W, 0, MARGIN, H]]) {
      this.back.push(scene.add.tileSprite(x, y, w, h, BACKDROP).setOrigin(0).setDepth(9301).setTileScale(inv, inv));
    }
    this.parts.push(...this.back);
    // furniture and clutter
    for (const it of itemsOf(room)) {
      const m = PROPS[it.t];
      if (!m) continue;
      const frame = propKey(it.t, it.v % m.n);
      let left, top, depth;
      if (m.kind === 'wall') {
        const bottom = it.y * ts + 8 - (m.lift ?? 0);
        left = it.x * ts - 1; top = bottom - m.h - 1; depth = it.y * ts + cfg.depth.wall;
      } else if (m.kind === 'desk') {
        left = it.x * ts - 1; top = it.y * ts; depth = it.y * ts + 26;
      } else {
        const feet = it.y * ts + 14;
        left = it.x * ts + ts / 2 - m.w / 2 - 1; top = feet - m.h - 1; depth = feet;
      }
      this.parts.push(scene.add.image(left, top, ATLAS, frame).setOrigin(0).setScale(inv).setDepth(depth));
    }
    // windows: a shaft each, and a light
    const d = cfg.daylight;
    for (const w of windowList(ctx.map, id, room)) {
      const wide = w.w > 1;
      const sw = SHAFT.w[wide ? 1 : 0];
      const img = scene.add.image(0, 0, ATLAS, shaftKey(wide, 1)).setOrigin(0).setScale(inv).setDepth(cfg.shaft.depth).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
      this.parts.push(img);
      this.wins.push({ ...w, img, sw, wide, handle: null, level: 0, left: w.x - sw / 2, top: w.ty * ts + 7, lx: w.x, ly: w.ty * ts + 7 + d.drop });
    }
    // lamps: the fixture, its lit twin that fades in, the Low glow, the light
    for (const l of room.lamps) {
      const m = LAMPS[l.t];
      const x = l.x * ts;
      const y = Math.round(l.y * ts);
      const depth = m.lift ? cfg.depth.lamp : y;
      const mk = lit => scene.add.image(x, y - m.lift + 1, ATLAS, lampKey(l.t, lit)).setOrigin(0.5, 1).setScale(inv).setDepth(depth + (lit ? 1 : 0));
      const base = m.base ? mk(false) : null;
      const lit = mk(true).setAlpha(0).setVisible(false);
      const glow = scene.add.image(x, y, GLOW).setScale(inv * ((l.radius ?? cfg.lamp.radius) / 48)).setDepth(9291).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
      if (base) this.parts.push(base);
      this.parts.push(lit, glow);
      this.lamps.push({ ...l, x, y, radius: l.radius ?? cfg.lamp.radius, lit, glow, handle: null, level: 0 });
    }
    this.dim = scene.add.rectangle(0, 0, 10, 10, hex(cfg.lowDim.color)).setOrigin(0).setDepth(9290).setVisible(false);
    this.parts.push(this.dim);
    this.day = 0;
    this.skew = -1;
    this.tintBack = -1;
  }

  unloadMap() {
    this.#dropLights();
    for (const p of this.parts) p.destroy();
    this.parts.length = this.wins.length = this.lamps.length = this.back.length = 0;
    this.dim = null;
    this.room = null;
  }

  #dropLights() {
    for (const w of this.wins) { w.handle?.release(); w.handle = null; }
    for (const l of this.lamps) { l.handle?.release(); l.handle = null; }
  }

  update(dt) {
    if (!this.room) return;
    const { ctx, cfg, lightMap, scene } = this;
    const pool = ctx.lights;
    const lit = pool.mapActive;
    const dark = lightMap.dark;
    const minute = ctx.day.minute;
    const weather = ctx.weather.state;
    const fade = cfg.lamp.fade;
    // window light follows the daylight
    this.day += Math.sign(daylight(cfg, dark, weather) - this.day) * Math.min(Math.abs(daylight(cfg, dark, weather) - this.day), dt / 1.5);
    const skew = shaftSkew(cfg, minute);
    const sk = SHAFT.skew[skew];
    if (skew !== this.skew) { // the sun moved on: other lean, other place
      for (const w of this.wins) {
        w.img.setFrame(shaftKey(w.wide, skew)).setPosition(w.left - Math.max(0, -sk), w.top);
        w.handle?.move(w.lx + sk * 0.5, w.ly);
      }
    }
    const a = cfg.shaft.alpha * this.day;
    for (const w of this.wins) {
      const show = this.day > 0.03;
      if (show !== w.img.visible) w.img.setVisible(show);
      if (show) w.img.setAlpha(a);
      if (lit && show) {
        if (!w.handle) w.handle = pool.add({ x: w.lx + sk * 0.5, y: w.ly, radius: cfg.daylight.radius * (w.wide ? 1.5 : 1), color: hex(cfg.daylight.color), intensity: 0 });
        w.handle?.setIntensity(cfg.daylight.intensity * this.day);
      } else if (w.handle) { w.handle.release(); w.handle = null; }
    }
    this.skew = skew;
    // lamps
    for (const l of this.lamps) {
      const target = lampTarget(cfg, this.sched, minute, dark, weather, l.jitter);
      l.level += Math.sign(target - l.level) * Math.min(Math.abs(target - l.level), dt / fade);
      const on = l.level > 0.01;
      if (on !== l.lit.visible) l.lit.setVisible(on);
      if (on) l.lit.setAlpha(l.level);
      l.glow.setVisible(on && !lit);
      if (on && !lit) l.glow.setAlpha(l.level);
      if (lit && on) {
        if (!l.handle) l.handle = pool.add({ x: l.x, y: l.y, radius: l.radius, color: hex(cfg.lamp.color), intensity: 0 });
        l.handle?.setIntensity(cfg.lamp.intensity * l.level);
      } else if (l.handle) { l.handle.release(); l.handle = null; }
    }
    const night = interiorNight(cfg, dark);
    if (Math.abs(night - this.tintBack) > 0.004) {
      this.tintBack = night;
      const t = Math.round(255 * (1 - night * cfg.backdropNight));
      const tint = (t << 16) | (t << 8) | Math.min(255, Math.round(t * 1.06));
      for (const b of this.back) b.setTint(tint);
    }
    // Low and Canvas: no light map, so a dim rectangle carries the night
    const dim = this.dim;
    const dimA = night * cfg.lowDim.alpha;
    if (!lit && dimA > 0.01) {
      const v = scene.cameras.main.worldView;
      dim.setVisible(true).setPosition(v.x, v.y).setSize(v.width, v.height).setAlpha(dimA);
    } else if (dim.visible) dim.setVisible(false);
  }
}
