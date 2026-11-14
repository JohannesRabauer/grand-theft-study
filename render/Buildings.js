// Building exteriors in the world (story 16.7, AD-31). The tile art of the walls is baked into the ground (scenes/BuildingArt.js);
// this world system adds what reaches past the tile border or glows: eaves that hang over the ground beside a roof, chimneys,
// shop awnings and the lit windows. It is a world system (`loadMap` / `unloadMap`); the pieces are built once per map.
// - Eaves, chimneys: one image each at the depth of the tile's base line (a kid beside the building walks under the eave, one in
//   front of it stands above). 869 visible images at once cost +40 percent frame time, so a fixed pool of images (made at map
//   load, so the display list never grows) is lent to the chunks of tiles near the view.
// - Awnings: a layer of their own above the objects (see data/buildings.json `awningDepth`).
// - Windows: from the evening on the households switch their lights on, each a little earlier or later (windowLit). A lit pane is
//   a pooled image that fades in; on Medium and High a warm light on the ground below it comes from ctx.lights, nearest to the
//   view first and at most the tier's `windowLights`. Low and Canvas show the panes without the spill. Nothing here is random.
import { BLD_ATLAS, CHIMNEY, AWNING, PALS, litKey, outdoorInfo, rimKey } from '../scenes/BuildingArt.js';
import { clamp01, hex } from './baseMath.js';
import { ROOFS, chimneyTiles, facadeLook, roofEdges, windowList, windowLit } from './buildingMath.js';

const CELL = 16;
const CHUNK = 12; // tiles per side of one blitter
const CULL = 48; // base pixels around the view where a chunk has its images

export class Buildings {
  constructor(scene, ctx, cfg, lightMap) {
    this.scene = scene;
    this.lightMap = lightMap;
    this.ctx = ctx;
    this.cfg = cfg;
    this.objs = []; // awnings
    this.chunks = []; // { pieces, imgs, x0, y0, x1, y1 } of the eaves and chimneys (base pixels); imgs lent from the pool while the chunk is near the view
    this.wins = [];
    this.free = []; // pane images that are not showing
    this.spare = []; // eave and chimney images that are not lent
    this.cand = []; // windows asking for a light this tick
    this.held = 0;
    this.acc = 0;
    this.byDistance = (a, b) => a.d - b.d;
    ctx.world.register(this);
    ctx.events.on('quality:changed', () => this.#dropLights());
    this.loadMap();
  }

  loadMap() {
    const { ctx, scene, cfg } = this;
    const { map } = ctx;
    if (map.indoor) return;
    const { inv } = ctx.res;
    const info = outdoorInfo(map, ctx.world.id);
    const { side, top } = cfg.overhang;
    const grid = new Map();
    const piece = (tx, ty, x, y, frame, depth) => {
      const key = Math.floor(tx / CHUNK) * 1000 + Math.floor(ty / CHUNK);
      let c = grid.get(key);
      if (!c) {
        c = { pieces: [], imgs: null, x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
        grid.set(key, c);
        this.chunks.push(c);
      }
      c.x0 = Math.min(c.x0, x); c.y0 = Math.min(c.y0, y); c.x1 = Math.max(c.x1, x + CELL + 2 * side); c.y1 = Math.max(c.y1, y + CELL + CHIMNEY.h);
      c.pieces.push({ x, y, frame, depth });
    };
    for (const b of info.list) {
      const pal = PALS[b.pal].id;
      const kind = ROOFS[b.roof];
      for (const [tx, ty] of b.cells) {
        const mask = roofEdges(info, tx, ty);
        if (mask) piece(tx, ty, tx * CELL - side, ty * CELL - top, rimKey(pal, kind, mask), (ty + 1) * CELL - 0.5);
        const look = facadeLook(info, tx, ty);
        if (look && look.awning >= 0) this.objs.push(scene.add.image(tx * CELL + AWNING.dx, ty * CELL + AWNING.dy, BLD_ATLAS, `awning-${look.awning}`).setOrigin(0).setScale(inv).setDepth(cfg.awningDepth));
      }
      for (const [tx, ty] of chimneyTiles(info, b)) piece(tx, ty, tx * CELL + (CELL - CHIMNEY.w) / 2, (ty + 1) * CELL - 2 - 22.5, `chim-${pal}`, (ty + 1) * CELL - 1);
    }
    const make = n => Array.from({ length: n }, () => scene.add.image(0, 0, BLD_ATLAS, litKey('w', 0, 0)).setOrigin(0).setScale(inv).setVisible(false));
    this.spare = make(cfg.pool.pieces);
    this.free = make(cfg.pool.panes).map(i => i.setDepth(cfg.windows.depth));
    this.wins = windowList(info).map(w => ({ ...w, level: 0, img: null, handle: null, d: 0 }));
    this.acc = this.cfg.windows.tick; // work out the first state at once
  }

  unloadMap() {
    this.#dropLights();
    for (const c of this.chunks) if (c.imgs) for (const i of c.imgs) i.destroy();
    this.chunks.length = 0;
    for (const i of this.spare) i.destroy();
    this.spare.length = 0;
    for (const o of this.objs) o.destroy();
    for (const i of this.free) i.destroy();
    for (const w of this.wins) w.img?.destroy();
    this.objs.length = 0;
    this.free.length = 0;
    this.wins.length = 0;
  }

  #dropLights() {
    for (const w of this.wins) { w.handle?.release(); w.handle = null; }
    this.held = 0;
  }

  update(dt) {
    const wins = this.wins;
    if (!wins.length) return;
    this.#cull();
    const cfg = this.cfg.windows;
    this.acc += dt;
    if (this.acc < cfg.tick) return;
    const step = this.acc;
    this.acc = 0;
    const { ctx, scene } = this;
    const pool = ctx.lights;
    const minute = ctx.day.minute;
    const view = scene.cameras.main.worldView;
    const dark = clamp01(this.lightMap.dark);
    const bright = cfg.dayLevel + (1 - cfg.dayLevel) * clamp01(dark / cfg.darkness);
    const margin = cfg.light.radius;
    const limit = pool.mapActive ? ctx.quality.tier.windowLights ?? 0 : 0;
    const cx = view.centerX;
    const cy = view.centerY;
    this.cand.length = 0;
    for (const w of wins) {
      const seen = w.x > view.x - 12 && w.x < view.right + 12 && w.y > view.y - 12 && w.y < view.bottom + 12;
      const lit = windowLit(minute, w, cfg);
      const target = lit ? bright : 0;
      if (!seen && !w.img && !w.handle) { w.level = target; continue; }
      w.level += Math.sign(target - w.level) * Math.min(Math.abs(target - w.level), step / cfg.fade);
      if (w.level > 0 && seen) {
        if (!w.img) {
          w.img = this.free.pop();
          if (!w.img) continue;
          w.img.setFrame(litKey(w.style === 4 ? 's' : 'w', w.style === 4 ? 0 : w.curtain, w.tone)).setPosition(w.tx * CELL, w.ty * CELL).setVisible(true);
        }
        w.img.setAlpha(w.level);
      } else if (w.img) { w.img.setVisible(false); this.free.push(w.img); w.img = null; }
      const near = limit > 0 && lit && w.level > cfg.dayLevel && w.x > view.x - margin && w.x < view.right + margin && w.y + cfg.light.drop > view.y - margin && w.y + cfg.light.drop < view.bottom + margin;
      if (near) { w.d = (w.x - cx) ** 2 + (w.y - cy) ** 2; this.cand.push(w); } else if (w.handle) { w.handle.release(); w.handle = null; this.held--; }
    }
    this.#lights(limit);
  }

  // Every frame: the chunks near the view have their images, the others none.
  #cull() {
    const v = this.scene.cameras.main.worldView;
    for (const c of this.chunks) {
      const show = c.x1 > v.x - CULL && c.x0 < v.right + CULL && c.y1 > v.y - CULL && c.y0 < v.bottom + CULL;
      if (show && !c.imgs) this.#lend(c);
      else if (!show && c.imgs) this.#drop(c);
    }
  }

  #lend(c) {
    if (this.spare.length < c.pieces.length) return; // pool exhausted: this chunk stays bare
    c.imgs = c.pieces.map(p => this.spare.pop().setFrame(p.frame).setPosition(p.x, p.y).setDepth(p.depth).setVisible(true));
  }

  #drop(c) {
    for (const i of c.imgs) { i.setVisible(false); this.spare.push(i); }
    c.imgs = null;
  }

  // The nearest candidates get the light slots; windows past the limit lose theirs.
  #lights(limit) {
    const { cand, cfg } = this;
    const lc = cfg.windows.light;
    cand.sort(this.byDistance);
    for (let i = 0; i < cand.length; i++) {
      const w = cand[i];
      if (i >= limit) { if (w.handle) { w.handle.release(); w.handle = null; this.held--; } continue; }
      if (!w.handle) {
        w.handle = this.ctx.lights.add({ x: w.x, y: w.y + lc.drop, radius: lc.radius, color: hex(w.tone ? lc.tvColor : lc.color), intensity: 0, phase: w.jitter * 6 });
        if (!w.handle) continue;
        this.held++;
      }
      w.handle.setIntensity(lc.intensity * w.level);
    }
  }
}
