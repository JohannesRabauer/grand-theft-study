// The light map (AD-31, story 16.2): a render texture at the *base* resolution (480x270) holding the ambient colour and
// the additive light pools, multiplied over the world camera. Light pools are stepped textures, so the light stays
// pixel art, and every light snaps to a whole light-map pixel. It replaces the old day-tint overlay
// (physics/Weather.js) while it is `active`; on Low, with Canvas, or indoors, that overlay carries the mood.
// Systems never create sprites: they ask ctx.lights (a LightPool, render/lightMath.js) for a handle.
import { ambientFor, ambientRgb, darkness, lightPixels } from './lightMath.js';

export class LightMap {
  constructor(scene, ctx, cfg, postFx) {
    this.scene = scene;
    this.ctx = ctx;
    this.cfg = cfg;
    this.postFx = postFx;
    this.webgl = scene.game.renderer.type === Phaser.WEBGL;
    this.amb = { r: 1, g: 1, b: 1 };
    this.rgb = 0xffffff;
    this.dark = 0;
    this.time = 0;
    ctx.lights.mapActive = false;
    this.w = ctx.res.w; // base resolution (480x270), not the render size
    this.h = ctx.res.h;
    if (this.webgl) this.#build();
    const refresh = () => { this.#refreshAmbient(); this.#apply(); };
    ctx.events.on('clock:tick', () => this.#refreshAmbient());
    ctx.events.on('quality:changed', refresh);
    ctx.events.on('world:enter', () => this.#apply());
    this.#refreshAmbient();
    this.#apply();
  }

  #build() {
    const { scene, cfg } = this;
    const t = cfg.texture;
    if (scene.textures.exists(t.key)) scene.textures.remove(t.key);
    const size = t.radius * 2;
    const tex = scene.textures.createCanvas(t.key, size, size);
    const c = tex.getContext();
    const img = c.createImageData(size, size);
    const px = lightPixels(t.radius, t.steps, t.dither);
    for (let i = 0; i < px.length; i++) { img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = px[i]; img.data[i * 4 + 3] = 255; }
    c.putImageData(img, 0, 0);
    tex.refresh();
    tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.rt = scene.add.renderTexture(0, 0, this.w, this.h).setOrigin(0).setDepth(cfg.depth).setBlendMode(Phaser.BlendModes.MULTIPLY).setVisible(false);
    this.rt.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    // one reusable stamp (not on the display list) draws every pool
    this.stamp = scene.make.image({ key: t.key, add: false }).setOrigin(0.5).setBlendMode(Phaser.BlendModes.ADD);
  }

  // The light map draws only outdoors on a tier with `lightMap` and a WebGL renderer.
  #apply() {
    const tier = this.ctx.quality.tier;
    this.ctx.lights.setLimit(tier.maxLights ?? 0);
    this.enabled = !!(this.webgl && tier.lightMap && !this.ctx.map.indoor);
    this.ctx.lights.mapActive = this.enabled;
    this.rt?.setVisible(this.enabled);
  }

  #refreshAmbient() {
    ambientFor(this.ctx.day.tint, this.cfg.ambient, this.amb);
    this.rgb = ambientRgb(this.amb);
    this.dark = darkness(this.amb);
    this.postFx?.setNight(this.dark);
  }

  update(dt) {
    this.time += dt;
    if (!this.enabled) return;
    const { rt, stamp, ctx } = this;
    const v = this.scene.cameras.main.worldView;
    const k = this.w / v.width; // light-map pixels per world unit
    rt.setPosition(v.x, v.y).setDisplaySize(v.width, v.height);
    rt.fill(this.rgb, 1);
    const radius = this.cfg.texture.radius;
    rt.beginDraw();
    for (const l of ctx.lights.active) {
      if (l.x + l.radius < v.x || l.x - l.radius > v.right || l.y + l.radius < v.y || l.y - l.radius > v.bottom) continue;
      const fl = l.flicker ? 1 - l.flicker * 0.5 * (1 + Math.sin(this.time * 9 + l.phase) * Math.sin(this.time * 3.1 + l.phase * 2)) : 1;
      stamp.setScale(l.radius * k / radius).setTint(l.color).setAlpha(Math.min(1, l.intensity * fl));
      rt.batchDraw(stamp, Math.round((l.x - v.x) * k), Math.round((l.y - v.y) * k));
    }
    rt.endDraw();
  }
}
