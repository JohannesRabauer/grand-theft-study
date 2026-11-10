// Post effects on the world camera (AD-31, story 16.2): bloom on bright pixels, colour grade and vignette as
// PostFXPipeline passes. Never on the UI scene (it has its own camera). WebGL only; with Canvas, or a tier with
// `postFx` off, the camera stays plain and the old tint overlay (physics/Weather.js) carries the mood.
import { CAMERA_PASSES, OBJECT_PIPELINES } from './pipelines/index.js';
import { fx as gradeFx } from './pipelines/GradeFx.js';
import { fx as bloomFx } from './pipelines/BloomFx.js';

const lerp = (a, b, t) => a + (b - a) * t;

export class PostFx {
  constructor(scene, ctx, cfg) {
    this.scene = scene;
    this.ctx = ctx;
    this.cfg = cfg;
    this.webgl = scene.game.renderer.type === Phaser.WEBGL;
    this.names = [];
    this.night = 0; // 0 day .. 1 darkest, from the light map's ambient
    if (this.webgl) this.#register();
    this.apply();
    ctx.events.on('quality:changed', () => this.apply()); // GameScene removes every listener when a run ends
  }

  #register() {
    const pm = this.scene.game.renderer.pipelines;
    for (const cls of CAMERA_PASSES) {
      const name = new cls(this.scene.game).name;
      if (!pm.postPipelineClasses?.has(name)) pm.addPostPipeline(name, cls);
    }
    for (const cls of OBJECT_PIPELINES) {
      const pipeline = new cls(this.scene.game);
      if (!pm.has(pipeline.name)) pm.add(pipeline.name, pipeline);
    }
  }

  get active() { return this.names.length > 0; }

  // Does this tier run the atmosphere (story 16.12)? It lives in the grade pass, so: Medium and High on WebGL.
  get atmosphereAllowed() {
    const t = this.ctx.quality.tier;
    return this.webgl && !!(t.postFx?.grade || t.postFx?.vignette) && !!t.atmosphere?.pass;
  }

  // Puts the passes of the current tier on the world camera (and takes them off again for Low).
  apply() {
    const cam = this.scene.cameras.main;
    const tier = this.ctx.quality.tier.postFx;
    cam.resetPostPipeline();
    this.names.length = 0;
    if (!this.webgl || !tier) return;
    const want = [];
    if (tier.bloomTaps > 0 && this.cfg.bloom) want.push('SchulwegBloom');
    if (tier.grade || tier.vignette) want.push('SchulwegGrade');
    this.useGrade = !!tier.grade;
    this.useVignette = !!tier.vignette;
    bloomFx.taps = Math.min(16, tier.bloomTaps);
    if (want.length) cam.setPostPipeline(want);
    this.names.push(...want);
    this.setNight(this.night);
  }

  // Called by the light map whenever the ambient light changes (once per game minute).
  setNight(night) {
    this.night = night;
    const { grade, vignette, bloom } = this.cfg;
    const g = gradeFx;
    const gn = this.useGrade ? grade : null;
    for (let i = 0; i < 3; i++) g.tint[i] = gn ? lerp(gn.tint[i], gn.night.tint[i], night) : 1;
    g.saturation = gn ? lerp(gn.saturation, gn.night.saturation, night) : 1;
    g.contrast = gn ? grade.contrast : 1;
    g.vignette = this.useVignette ? vignette.strength + vignette.nightExtra * night : 0;
    g.inner = vignette.inner;
    g.outer = vignette.outer;
    bloomFx.threshold = bloom.threshold;
    bloomFx.radius = bloom.radius;
    bloomFx.intensity = bloom.intensity * (bloom.nightOnly ? night : 1);
  }

  destroy() {
    this.scene.cameras.main.resetPostPipeline?.();
  }
}
