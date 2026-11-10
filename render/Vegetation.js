// Vegetation (story 16.6, AD-31): the crown sprites of the tree tiles and the lumpy hedge runs of the current outdoor map. It is
// a world system (`loadMap` / `unloadMap`). The crowns are one layer above every object (so they batch in the wind pipeline), and a
// crown fades see-through while a kid or a chasing bully stands behind its trunk. Wind: Medium and High sway the crowns in the WindFx
// pipeline (the shared values change once per frame, nothing is redrawn); Low and Canvas nudge the visible crowns by whole
// pixels. Hedge runs lean as one piece by a pixel on every tier. Deciduous crowns follow the season of the day clock. Ground
// trunks and grass come from scenes/EnvArt.js.
import { placeTrees, hedgeRuns, commonBox, underCrown, stepFade, swayShift } from './vegetationMath.js';
import { crownKey, crownLook, makeHedgeRun, CROWN_ATLAS, HEDGE_MARGIN } from '../scenes/VegArt.js';
import { mapSeed } from '../scenes/GroundArt.js';
import { fx } from './pipelines/WindFx.js';

const TAU = Math.PI * 2;
const NUDGE_RANGE = 40; // base pixels beyond the view where a crown still gets nudged on Low

export class Vegetation {
  constructor(scene, ctx, cfg) {
    this.scene = scene;
    this.ctx = ctx;
    this.cfg = cfg;
    this.webgl = scene.game.renderer.type === Phaser.WEBGL;
    this.box = commonBox(cfg);
    this.trees = [];
    this.hedges = [];
    this.runs = [];
    this.hedgeKeys = [];
    this.season = '';
    this.time = 0;
    this.shader = false;
    ctx.world.register(this);
    ctx.events.on('quality:changed', () => this.#applyWind());
    this.loadMap();
  }

  loadMap() {
    const { ctx, scene, cfg, box } = this;
    const { map } = ctx;
    if (map.indoor) return;
    const { inv, scale } = ctx.res;
    this.season = ctx.day.season;
    for (const t of placeTrees(map, cfg)) {
      t.sprite = scene.add.image(t.x, t.y, CROWN_ATLAS, crownKey(t.species, t.shape, crownLook(cfg, t.species, this.season))).setOrigin(box.ox / box.w, box.oy / box.h).setScale(inv).setDepth(cfg.depth);
      t.sprite.setTint((Math.round((t.phase / TAU) * 255) << 16) | 0xffff); // the wind pipeline reads the sprite's phase from the red channel
      t.fade = 1;
      t.shift = 0;
      this.trees.push(t);
    }
    const seed = mapSeed(map, ctx.world.id);
    const m = HEDGE_MARGIN;
    const ts = map.tileSize;
    for (const run of hedgeRuns(map)) {
      const key = makeHedgeRun(scene, cfg, run, seed, scale / 2);
      this.hedgeKeys.push(key);
      run.shift = 0;
      run.sprites = run.tiles.map(([tx, ty]) => {
        const img = scene.add.image(tx * ts - m.left, ty * ts - m.top, key, `${tx}_${ty}`).setOrigin(0).setScale(inv).setDepth((ty + 1) * ts);
        img.baseX = img.x;
        this.hedges.push(img);
        return img;
      });
      this.runs.push(run);
    }
    this.shader = false;
    this.#applyWind();
  }

  unloadMap() {
    for (const t of this.trees) t.sprite.destroy();
    for (const h of this.hedges) h.destroy();
    for (const key of this.hedgeKeys) this.scene.textures.remove(key);
    this.trees.length = 0;
    this.hedges.length = 0;
    this.runs.length = 0;
    this.hedgeKeys.length = 0;
  }

  // WebGL on a tier with `windFx` sways the crowns in the pipeline; everything else nudges them.
  #applyWind() {
    const on = !!(this.webgl && this.ctx.quality.tier.windFx);
    if (on === this.shader) return;
    this.shader = on;
    for (const t of this.trees) {
      if (on) t.sprite.setPipeline('SchulwegWind'); else t.sprite.resetPipeline();
      t.shift = 0;
      t.sprite.x = t.x;
    }
    const atlas = this.scene.textures.get(CROWN_ATLAS).getSourceImage();
    fx.step = this.ctx.res.scale;
    fx.invW = 1 / atlas.width;
    fx.rows = atlas.height / (this.box.h * fx.step);
    fx.frameBase = this.box.h;
    fx.amp = this.cfg.sway.amp;
  }

  update(dt) {
    const { ctx, cfg, trees } = this;
    if (!trees.length && !this.hedges.length) return;
    this.time += dt;
    const wind = ctx.wind;
    if (ctx.day.season !== this.season) this.#reseason();
    if (this.shader) {
      fx.angle = (this.time * cfg.sway.freq) % TAU;
      fx.lean = wind.vector.x * cfg.sway.lean;
      fx.strength = wind.strength;
    } else this.#nudge(wind);
    this.#leanHedges(wind);
    this.#fade(dt);
  }

  #reseason() {
    this.season = this.ctx.day.season;
    for (const t of this.trees) t.sprite.setFrame(crownKey(t.species, t.shape, crownLook(this.cfg, t.species, this.season)));
  }

  // Low and Canvas: whole-pixel nudge of the crowns near the view (the base line stays put).
  #nudge(wind) {
    const view = this.scene.cameras.main.worldView;
    const { cfg, time } = this;
    const x0 = view.x - NUDGE_RANGE;
    const x1 = view.right + NUDGE_RANGE;
    const y0 = view.y - NUDGE_RANGE;
    const y1 = view.bottom + NUDGE_RANGE;
    for (const t of this.trees) {
      if (t.x < x0 || t.x > x1 || t.y < y0 || t.y > y1) continue;
      const s = swayShift(time, t.phase, 1, wind.vector.x, wind.strength, cfg.sway.lowAmp, cfg.sway);
      if (s !== t.shift) { t.shift = s; t.sprite.x = t.x + s; }
    }
  }

  // A hedge run moves as one piece (its slices overlap, so they must shift alike).
  #leanHedges(wind) {
    const { cfg, time } = this;
    for (const run of this.runs) {
      const s = swayShift(time, run.id * 1.9, 1, wind.vector.x, wind.strength, cfg.sway.hedgeAmp, cfg.sway);
      if (s === run.shift) continue;
      run.shift = s;
      for (const img of run.sprites) img.x = img.baseX + s;
    }
  }

  #behind(t, who) {
    const torso = this.cfg.fade.torso;
    const px = who.x;
    const py = who.y;
    return Math.abs(px - t.cx) < t.rx && Math.abs(py - t.cy) < t.ry + torso + 1 && underCrown(t, px, py, torso);
  }

  // A crown turns see-through while a kid (or a chasing bully) stands behind it.
  #fade(dt) {
    const { cfg, trees } = this;
    const { players, chase } = this.ctx;
    for (const t of trees) {
      let target = 1;
      for (const p of players) if (this.#behind(t, p)) { target = cfg.fade.alpha; break; }
      if (target === 1) for (const b of chase.bullies) if (b.active && this.#behind(t, b)) { target = cfg.fade.alpha; break; }
      if (t.fade === target) continue;
      t.fade = stepFade(t.fade, target, dt, cfg.fade.speed);
      t.sprite.setAlpha(t.fade);
    }
  }
}
