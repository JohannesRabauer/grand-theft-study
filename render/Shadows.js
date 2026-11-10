// Cast shadow layer (AD-31, story 16.4): one image per outdoor map, baked from the map at load (render/shadowMath.js) and
// drawn with the ShadowFx pipeline under every object. It is a world system (`loadMap` / `unloadMap`). The sun moves
// only through the shader's offsets, whole base pixels once per game minute, and the strength follows the light map's
// darkness, so shadows are long at dawn and dusk, short at noon and gone at night. Needs WebGL and a tier with `shadows`;
// Low and Canvas keep the contact shadows baked into the sprites.
import { buildShadowMask, shadowOffsets, shadowStrength } from './shadowMath.js';
import { fx } from './pipelines/ShadowFx.js';

const KEY = 'shadow-mask';

export class Shadows {
  constructor(scene, ctx, cfg, lightMap) {
    this.scene = scene;
    this.ctx = ctx;
    this.cfg = cfg.shadows;
    this.lightMap = lightMap;
    this.webgl = scene.game.renderer.type === Phaser.WEBGL;
    this.image = null;
    this.minute = -1;
    this.dark = -1;
    this.overcast = false;
    this.offsets = { tall: [0, 0], low: [0, 0] };
    const n = parseInt(this.cfg.color.slice(1), 16);
    fx.color = [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
    this.#apply();
    ctx.world.register(this);
    ctx.events.on('quality:changed', () => this.#apply());
  }

  loadMap() { this.#apply(); }

  unloadMap() {
    this.image?.destroy();
    this.image = null;
    if (this.scene.textures.exists(KEY)) this.scene.textures.remove(KEY);
  }

  // Builds the layer when the tier casts shadows (Low never pays for the mask) and hides it otherwise.
  #apply() {
    this.minute = -1;
    const on = !!(this.webgl && this.ctx.quality.tier.shadows);
    if (on && !this.image) this.#build();
    this.image?.setVisible(on);
  }

  #build() {
    const { map } = this.ctx;
    const gl = this.scene.game.renderer.gl;
    const limit = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    if (map.rows[0].length * 16 > limit || map.rows.length * 16 > limit) return;
    const mask = buildShadowMask(map, this.cfg);
    if (!mask) return;
    if (this.scene.textures.exists(KEY)) this.scene.textures.remove(KEY); // a run that ended left the previous map's mask behind
    const tex = this.scene.textures.createCanvas(KEY, mask.w, mask.h);
    tex.getContext().putImageData(new ImageData(mask.data, mask.w, mask.h), 0, 0);
    tex.refresh();
    tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.image = this.scene.add.image(0, 0, KEY).setOrigin(0).setDepth(this.cfg.depth).setBlendMode(Phaser.BlendModes.MULTIPLY).setPipeline('SchulwegShadow');
    fx.inv[0] = 1 / mask.w;
    fx.inv[1] = 1 / mask.h;
  }

  // The offsets change once per game minute, the strength with the light map's darkness and the weather; nothing is redrawn.
  update() {
    const img = this.image;
    if (!img?.visible) return;
    const { ctx, cfg } = this;
    const w = ctx.weather;
    const overcast = !!(w && (w.raining || w.snowing || w.state === 'fog'));
    const dark = this.lightMap.dark;
    if (ctx.day.minute === this.minute && dark === this.dark && overcast === this.overcast) return;
    this.minute = ctx.day.minute;
    this.dark = dark;
    this.overcast = overcast;
    const o = shadowOffsets(ctx.day.sun, cfg, this.offsets);
    fx.off[0] = o.tall[0]; fx.off[1] = o.tall[1]; fx.off[2] = o.low[0]; fx.off[3] = o.low[1];
    const s = shadowStrength(cfg, dark, overcast);
    fx.k[0] = s;
    const ao = 1 - Math.min(1, dark * 0.8); // occlusion stays a little longer than the sun shadow
    fx.k[1] = cfg.ao.strong * ao;
    fx.k[2] = cfg.ao.weak * ao;
  }
}
