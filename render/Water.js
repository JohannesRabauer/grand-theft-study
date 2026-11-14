// Water in the world (story 16.8, AD-31): every body of water of the current outdoor map (render/waterMath.js) gets a static shore layer
// (banks, stones, reeds, bridge piers) and the water itself. It is a world system (`loadMap` / `unloadMap`).
// - Medium and High on WebGL: one mask image per body drawn by the water pipeline (render/pipelines/WaterFx.js): depth bands, scrolling
//   ripples, shimmer in the shallows, lapping foam, a tint of the sky and the reflections of the lamps and lit windows near the body
//   (ctx.lights, nearest first). Nothing is redrawn; only the phase, the sky and the few lights change.
// - Low and Canvas: the same water as a short loop of pre-drawn frames (`fallback`), no reflections.
// The tile ground under a water tile is a bed of mud (scenes/EnvArt.js), so a shore that recedes from the tile edge shows a bank.
// Collision, surfaces and pathfinding still use the water tiles; this system only draws.
import { waterBodies, buildBody, maskLayer, fallbackFrame, shoreLayer, flowPhase, pickLights, palette } from './waterMath.js';
import { fx } from './pipelines/WaterFx.js';
import { hex, lerp, rgb01 } from './baseMath.js';
import { mapSeed } from '../scenes/GroundArt.js';


export class Water {
  constructor(scene, ctx, cfg) {
    this.scene = scene;
    this.ctx = ctx;
    this.cfg = cfg;
    this.webgl = scene.game.renderer.type === Phaser.WEBGL;
    this.bodies = [];
    this.time = 0;
    this.frame = -1;
    this.shader = false;
    this.picked = [];
    this.daySky = rgb01(hex(cfg.sky.day));
    const pal = palette(cfg);
    [...pal.water, ...pal.foam, pal.shimmer, pal.glint].forEach((c, i) => fx.pal.set(rgb01(c), i * 3));
    fx.bands = cfg.bands;
    fx.foam = [cfg.foam.base, cfg.foam.swing, cfg.foam.spread];
    fx.caustic = [cfg.caustic.depth, cfg.caustic.threshold];
    fx.ripple = [cfg.ripple.threshold, cfg.ripple.minDepth];
    fx.swell = [cfg.swell.up, cfg.swell.down];
    fx.reflect = [cfg.reflect.intensity, cfg.reflect.steps];
    fx.skyMix = cfg.sky.mix;
    ctx.world.register(this);
    ctx.events.on('quality:changed', () => this.#applyMode()); // GameScene removes every listener when a run ends
    ctx.events.on('clock:tick', () => this.#sky());
    this.loadMap();
  }

  loadMap() {
    const { ctx, scene, cfg } = this;
    const { map } = ctx;
    if (map.indoor) return;
    const { scale, inv } = ctx.res;
    const seed = mapSeed(map, ctx.world.id);
    const gl = scene.game.renderer.gl;
    const limit = gl ? gl.getParameter(gl.MAX_TEXTURE_SIZE) : 4096;
    for (const bd of waterBodies(map)) {
      const b = buildBody(map, bd, cfg, seed);
      if (b.w * scale > limit || b.h * scale > limit) continue; // a body larger than the device's textures keeps its tile art
      b.key = `water-${b.index}`;
      b.lightsBuf = new Float32Array(32);
      b.colorsBuf = new Float32Array(24);
      b.u = { w: b.w, h: b.h, ox: b.ox, oy: b.oy, lights: b.lightsBuf, colors: b.colorsBuf };
      this.#canvasTexture(`${b.key}-shore`, shoreLayer(b, cfg, seed), b, scale);
      b.shore = scene.add.image(b.ox, b.oy, `${b.key}-shore`).setOrigin(0).setScale(inv).setDepth(cfg.depth.shore);
      b.mask = null;
      b.frames = null;
      b.image = null;
      this.bodies.push(b);
    }
    this.frame = -1;
    this.#applyMode(true);
    this.#sky();
  }

  unloadMap() {
    for (const b of this.bodies) {
      this.#dropWater(b);
      b.shore.destroy();
      this.scene.textures.remove(`${b.key}-shore`);
    }
    this.bodies.length = 0;
  }

  // A base-pixel RGBA buffer as a nearest-filtered texture at the tier's texture scale.
  #canvasTexture(key, data, b, scale) {
    const src = document.createElement('canvas');
    src.width = b.w;
    src.height = b.h;
    src.getContext('2d').putImageData(new ImageData(data, b.w, b.h), 0, 0);
    let canvas = src;
    if (scale > 1) {
      canvas = document.createElement('canvas');
      canvas.width = b.w * scale;
      canvas.height = b.h * scale;
      const c = canvas.getContext('2d');
      c.imageSmoothingEnabled = false;
      c.drawImage(src, 0, 0, canvas.width, canvas.height);
    }
    if (this.scene.textures.exists(key)) this.scene.textures.remove(key);
    this.scene.textures.addCanvas(key, canvas).setFilter(Phaser.Textures.FilterMode.NEAREST);
  }

  #dropWater(b) {
    b.image?.destroy();
    b.image = null;
    if (b.mask) this.scene.textures.remove(b.mask);
    b.mask = null;
    if (b.frames) for (const k of b.frames) this.scene.textures.remove(k);
    b.frames = null;
  }

  // The pipeline on a WebGL tier with `waterFx`; frames of the water everywhere else.
  #applyMode(force = false) {
    const on = !!(this.webgl && this.ctx.quality.tier.waterFx);
    if (!force && on === this.shader) return;
    this.shader = on;
    const { scene, cfg } = this;
    const { scale, inv } = this.ctx.res;
    for (const b of this.bodies) {
      this.#dropWater(b);
      if (on) {
        b.mask = `${b.key}-mask`;
        if (scene.textures.exists(b.mask)) scene.textures.remove(b.mask); // a run that ended left the previous map's textures behind
        const tex = scene.textures.createCanvas(b.mask, b.w, b.h);
        tex.getContext().putImageData(new ImageData(maskLayer(b), b.w, b.h), 0, 0);
        tex.refresh();
        tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
        b.image = scene.add.image(b.ox, b.oy, b.mask).setOrigin(0).setDepth(cfg.depth.water).setPipeline('SchulwegWater');
        b.image.waterU = b.u;
      } else {
        const n = cfg.fallback.frames;
        const buf = new Uint8ClampedArray(b.w * b.h * 4);
        b.frames = [];
        for (let f = 0; f < n; f++) {
          const key = `${b.key}-f${f}`;
          this.#canvasTexture(key, fallbackFrame(b, cfg, f, n, buf), b, scale);
          b.frames.push(key);
        }
        b.image = scene.add.image(b.ox, b.oy, b.frames[0]).setOrigin(0).setScale(inv).setDepth(cfg.depth.water);
      }
    }
    this.frame = -1;
  }

  // The reflected sky: the day's blue, tinted by the clock's colour of the hour.
  #sky() {
    const tint = this.ctx.day.tint;
    if (!tint) return;
    const t = rgb01(tint.rgb);
    const k = Math.min(1, tint.alpha) * 0.6;
    for (let i = 0; i < 3; i++) fx.sky[i] = lerp(this.daySky[i], t[i], k);
  }

  update(dt) {
    if (!this.bodies.length) return;
    this.time += dt;
    const view = this.scene.cameras.main.worldView;
    if (this.shader) {
      fx.phase = flowPhase(this.time, this.cfg.flow);
      const active = this.ctx.lights.active;
      for (const b of this.bodies) {
        const seen = b.ox + b.w > view.x && b.ox < view.right && b.oy + b.h > view.y && b.oy < view.bottom;
        b.image.setVisible(seen);
        b.shore.setVisible(seen);
        if (seen) this.#lights(b, active);
      }
      return;
    }
    const f = Math.floor(this.time * this.cfg.fallback.fps) % this.cfg.fallback.frames;
    const changed = f !== this.frame;
    this.frame = f;
    for (const b of this.bodies) {
      const seen = b.ox + b.w > view.x && b.ox < view.right && b.oy + b.h > view.y && b.oy < view.bottom;
      b.image.setVisible(seen);
      b.shore.setVisible(seen);
      if (seen && changed) b.image.setTexture(b.frames[f]);
    }
  }

  #lights(b, active) {
    const picked = pickLights(active, b, this.cfg, this.picked);
    const L = b.lightsBuf;
    const C = b.colorsBuf;
    const reach = this.cfg.reflect.reach;
    b.u.lit = picked.length > 0; // the shader skips the reflection loop without lights; the lit ones come first
    for (let i = 0; i < 8; i++) {
      const s = picked[i];
      if (!s) { L[i * 4 + 3] = 0; continue; }
      L[i * 4] = s.x - b.ox;
      L[i * 4 + 1] = s.y - b.oy;
      L[i * 4 + 2] = s.radius * reach;
      L[i * 4 + 3] = Math.min(1, s.intensity);
      C[i * 3] = ((s.color >> 16) & 255) / 255;
      C[i * 3 + 1] = ((s.color >> 8) & 255) / 255;
      C[i * 3 + 2] = (s.color & 255) / 255;
    }
  }
}
