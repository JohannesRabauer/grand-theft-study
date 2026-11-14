// Street lights, signs and moving lights (AD-31, story 16.3). Everything here asks ctx.lights (render/lightMath.js LightPool)
// for handles; nothing creates a light sprite by hand.
// - Street lamps: posts (3 shape variants, procedural, y-sorted) at the positions of data/lighting.json `street.lamps`, plus
//   the map's own lamp objects (`sources`) and the shop and tram-stop signs (`signs`). A fixed light switches on at dusk and off
//   at dawn on its schedule (each a little earlier or later than the next) and flickers for a moment when it comes on.
// - Vehicles: the buses, cars, vans and trams of GrabTargets get a headlight and a tail light that move with them; a rider
//   on the bike gets a lamp. They follow the ambient darkness of the light map.
// Fixed lights are culled to the camera and held to `limit - reserve`; moving lights use the reserve, so the active count never
// passes the tier cap (the pool refuses past `limit`). The lit lamp heads are plain sprites, so they also glow on Low and Canvas.
import { ScaledPen } from '../scenes/NpcArt.js';
import { OUT } from '../scenes/HiResArt.js';
import { hex } from './baseMath.js';
import { fixedBudget, lampLit, warmupLevel } from './lightMath.js';

const parse = t => { const [h, m] = t.split(':'); return h * 60 + +m; };
const W = 14, H = 40, CX = 7, FEET = 37;
const IRON = { shadow: '#2c2e38', dark: '#3c3f48', base: '#4a4d55', light: '#5a5d66', high: '#7c7f88' };
const GLASS = '#c9b98a';

const hash = (a, b) => (Math.imul(a + 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35)) >>> 0;

// the post: a 2 px pole on a plinth with a lantern hanging to one side, or a globe on top
function post(p, v) {
  p.px(IRON.dark, CX - 2, FEET - 3, 5, 3).px(IRON.light, CX - 2, FEET - 3, 5, 1);
  p.px(IRON.dark, CX, 6, 2, FEET - 8).px(IRON.light, CX - 1, 6, 1, FEET - 8).px(IRON.high, CX - 1, 12, 1, 8).px(IRON.shadow, CX + 1, 20, 1, FEET - 22);
  p.px(IRON.base, CX - 2, 24, 5, 1).px(IRON.shadow, CX - 2, 25, 5, 1); // a collar
  if (v === 2) {
    p.px(IRON.base, CX - 2, 5, 5, 2);
    p.ell(GLASS, CX + 0.5, 2.5, 3.5, 3);
    p.px(IRON.dark, CX - 3, 6, 7, 1);
  } else {
    const d = v === 0 ? 1 : -1;
    const x0 = v === 0 ? CX : CX - 6;
    p.px(IRON.base, x0, 4, 7, 2).px(IRON.high, x0, 4, 7, 1);
    const lx = v === 0 ? CX + 3 : CX - 7;
    p.px(IRON.dark, lx, 5, 5, 1).px(GLASS, lx + 1, 6, 3, 2).px(IRON.dark, lx, 8, 5, 1).px(IRON.shadow, lx + 4 * (d < 0 ? 0 : 1), 6, 1, 2);
  }
  p.outline(OUT).shadow(CX + 1, FEET + 0.5, 4.5 * p.f, 1.8 * p.f, 0.28);
}

// the lit head only (same canvas, so it sits exactly on the post): warm core, amber rim
function glow(p, v) {
  if (v === 2) {
    p.ell('#ffd9a0', CX + 0.5, 2.5, 3, 2.5).px('#fff3c8', CX - 1, 1, 2, 1).px('#ffb347', CX - 1, 4, 4, 1);
    return;
  }
  const lx = v === 0 ? CX + 4 : CX - 6;
  p.px('#ffd9a0', lx, 6, 3, 2).px('#fff3c8', lx + 1, 6, 1, 1).px('#ffb347', lx, 7, 3, 1);
}

function makeArt(scene, f, variants) {
  for (let v = 0; v < variants; v++) {
    if (!scene.textures.exists(`street-lamp-${v}`)) { const p = new ScaledPen(scene, `street-lamp-${v}`, W, H, f); post(p, v); p.done(); }
    if (!scene.textures.exists(`street-lamp-lit-${v}`)) { const p = new ScaledPen(scene, `street-lamp-lit-${v}`, W, H, f); glow(p, v); p.done(); }
  }
}

export class StreetLights {
  constructor(scene, ctx, cfg, lightMap) {
    this.scene = scene;
    this.ctx = ctx;
    this.cfg = cfg;
    this.lightMap = lightMap;
    this.sched = {};
    for (const [id, s] of Object.entries(cfg.schedules)) this.sched[id] = { on: parse(s.on), onSpread: s.onSpread, off: parse(s.off), offSpread: s.offSpread, warm: s.warm };
    this.sets = new Map(); // map id -> fixed lights (built once, hidden while the map is not loaded)
    this.live = null;
    this.vslots = Array.from({ length: Math.floor(cfg.vehicles.reserve / 2) }, () => ({ t: null, head: null, tail: null })); // vehicles holding lights
    this.bikes = new Array(ctx.maxPlayers).fill(null);
    this.fixed = 0; // fixed lights held
    this.minute = -1;
    this.dyn = 0; // moving lights held
    makeArt(scene, ctx.res.scale, cfg.street.variants);
    ctx.events.on('clock:tick', () => this.#tick(false));
    ctx.events.on('quality:changed', () => this.#dropLights());
    ctx.world.register(this);
    this.loadMap();
  }

  loadMap() {
    const id = this.ctx.world.id;
    if (!this.sets.has(id)) this.sets.set(id, this.#build(id));
    this.live = this.sets.get(id);
    for (const l of this.live) l.img?.setVisible(true);
    this.#tick(true);
  }

  unloadMap() {
    this.#dropLights();
    for (const l of this.live ?? []) { l.img?.setVisible(false); l.glow?.setVisible(false); }
    this.live = null;
  }

  // The fixed lights of one map: lamp posts with sprites, lamp objects and signs without.
  #build(mapId) {
    const { cfg, ctx, scene } = this;
    const ts = ctx.map.tileSize;
    const out = [];
    const f = ctx.res;
    const add = (x, y, o, sched, variant) => {
      const j = (hash(Math.round(x), Math.round(y)) % 1000) / 1000;
      const l = { x, y, radius: o.radius, color: hex(o.color), intensity: o.intensity, flicker: o.flicker ?? 0, sched: this.sched[sched], jitter: j, seed: hash(Math.round(y), Math.round(x)) & 0xffff, lit: false, since: 0, handle: null, img: null, glow: null, shown: false };
      if (variant !== undefined) {
        const base = { x: x - cfg.street.head[variant][0], y: y - cfg.street.head[variant][1] }; // the foot of the post
        l.img = scene.add.image(base.x, base.y, `street-lamp-${variant}`).setOrigin(CX / W, FEET / H).setScale(f.inv).setDepth(base.y);
        l.glow = scene.add.image(base.x, base.y, `street-lamp-lit-${variant}`).setOrigin(CX / W, FEET / H).setScale(f.inv).setDepth(base.y + 0.01).setVisible(false);
      }
      out.push(l);
    };
    for (const [tx, ty] of cfg.street.lamps[mapId] ?? []) {
      const h = hash(tx, ty);
      const v = h % cfg.street.variants;
      const jx = ((h >>> 8) % 5) - 2;
      add((tx + 0.5) * ts + jx + cfg.street.head[v][0], (ty + 1) * ts - 2 + cfg.street.head[v][1], cfg.street, 'street', v);
    }
    const byId = id => ctx.map.objects.find(o => o.id === id);
    for (const s of cfg.sources) {
      const o = s.map === mapId && byId(s.id);
      if (o) add((o.x + 0.5) * ts + s.offset[0], (o.y + 0.5) * ts + 3 + s.offset[1], s, s.schedule);
    }
    for (const s of cfg.signs) {
      const o = s.map === mapId && byId(s.id);
      if (o) add((o.x + 0.5) * ts + s.offset[0], (o.y + 0.5) * ts + s.offset[1], s, s.schedule);
    }
    return out;
  }

  // Once per game minute (and when the map loads): which fixed lights are lit. A jump in time snaps them, a normal minute flickers.
  #tick(snap) {
    const minute = this.ctx.day.minute;
    const jump = snap || this.minute < 0 || Math.abs(minute - this.minute) > 3;
    this.minute = minute;
    for (const l of this.live ?? []) {
      const lit = lampLit(minute, l.sched, l.jitter);
      if (lit === l.lit && !jump) continue;
      l.since = lit && !jump ? 0 : l.sched.warm;
      l.lit = lit;
    }
  }

  #dropLights() {
    for (const l of this.live ?? []) { l.handle?.release(); l.handle = null; }
    for (const v of this.vslots) { v.head?.release(); v.tail?.release(); v.t = v.head = v.tail = null; }
    for (let i = 0; i < this.bikes.length; i++) { this.bikes[i]?.release(); this.bikes[i] = null; }
    this.fixed = 0;
    this.dyn = 0;
  }

  update(dt) {
    const pool = this.ctx.lights;
    const view = this.scene.cameras.main.worldView;
    if (!pool.mapActive && this.fixed + this.dyn > 0) this.#dropLights();
    const budget = fixedBudget(pool.limit, this.cfg.vehicles.reserve) - (this.ctx.quality.tier.windowLights ?? 0); // the window lights of render/Buildings.js have their own slots
    for (const l of this.live ?? []) {
      if (l.lit && l.since < l.sched.warm) l.since += dt;
      const level = l.lit ? warmupLevel(l.since, l.sched.warm, l.seed) : 0;
      if (l.glow) {
        const show = level > 0 && this.#inView(l.x, l.y, view, 12);
        if (show !== l.shown) { l.glow.setVisible(show); l.shown = show; }
        if (show) l.glow.setAlpha(level);
      }
      if (!pool.mapActive) continue;
      if (level > 0 && this.#inView(l.x, l.y, view, l.radius)) {
        if (!l.handle && this.fixed < budget) { l.handle = pool.add(l); if (l.handle) this.fixed++; }
        l.handle?.setIntensity(l.intensity * level);
      } else if (l.handle) { l.handle.release(); l.handle = null; this.fixed--; }
    }
    if (pool.mapActive) this.#moving(view);
  }

  // Headlights, tail lights and bike lamps follow the ambient darkness: nothing at noon, full once it is dusk.
  #moving(view) {
    const { ctx, cfg } = this;
    const v = cfg.vehicles;
    const pool = ctx.lights;
    const k = Math.min(1, this.lightMap.dark / 0.3);
    const on = this.lightMap.dark > v.darkness;
    const slots = this.vslots;
    for (const s of slots) {
      if (s.t && (!s.t.active || !on || !this.#inView(s.t.x, s.t.y, view, 80))) {
        this.dyn -= (s.head ? 1 : 0) + (s.tail ? 1 : 0);
        s.head?.release(); s.tail?.release();
        s.t = s.head = s.tail = null;
      }
    }
    if (on && ctx.grabs) {
      for (const t of ctx.grabs.pool) {
        if (!t.active || !this.#inView(t.x, t.y, view, 80)) continue;
        let s = null, free = null;
        for (const q of slots) { if (q.t === t) { s = q; break; } if (!q.t && !free) free = q; }
        if (!s) {
          if (!free || this.dyn + 2 > v.reserve - this.bikes.length) continue;
          s = free;
          s.t = t;
          s.head = pool.add({ x: t.x, y: t.y, radius: v.head.radius, color: hex(v.head.color), intensity: 0 });
          s.tail = pool.add({ x: t.x, y: t.y, radius: v.tail.radius, color: hex(v.tail.color), intensity: 0 });
          this.dyn += (s.head ? 1 : 0) + (s.tail ? 1 : 0);
        }
        const c = Math.cos(t.heading), sn = Math.sin(t.heading), half = t.kcfg.length / 2;
        s.head?.move(t.x + c * (half + v.head.ahead), t.y + sn * (half + v.head.ahead)).setIntensity(v.head.intensity * k);
        s.tail?.move(t.x - c * (half + v.tail.behind), t.y - sn * (half + v.tail.behind)).setIntensity(Math.min(1, v.tail.intensity * k * (t.braking ? v.tail.brake : 1))); // brake lights are brighter
      }
    }
    for (const p of ctx.players) {
      const riding = on && p.vehicle === 'bike' && this.#inView(p.x, p.y, view, 60);
      let h = this.bikes[p.index];
      if (!riding) { if (h) { h.release(); this.bikes[p.index] = null; this.dyn--; } continue; }
      if (!h) {
        h = pool.add({ x: p.x, y: p.y, radius: v.bike.radius, color: hex(v.bike.color), intensity: 0 });
        if (!h) continue;
        this.bikes[p.index] = h;
        this.dyn++;
      }
      const hd = p.move.heading;
      h.move(p.x + Math.cos(hd) * v.bike.ahead, p.y + Math.sin(hd) * v.bike.ahead).setIntensity(v.bike.intensity * k);
    }
  }

  #inView(x, y, view, m) {
    return x > view.x - m && x < view.right + m && y > view.y - m && y < view.bottom + m;
  }
}
