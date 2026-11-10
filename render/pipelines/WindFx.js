// Wind sway for tree crowns (AD-31, story 16.6): an object pipeline. Each texture row of a crown is shifted sideways by a
// whole base pixel, more the higher it is (zero at the base), by a steady lean along the wind plus a flutter that follows its
// strength: the same formula as swayShift in render/vegetationMath.js. The crowns are frames of one atlas, all the same size,
// and each sprite carries its phase in the red channel of its tint (the only per-sprite value), so they batch in one draw call (a MultiPipeline; one draw per sprite was too slow) and the
// shared values live in `fx`, set once per frame by render/Vegetation.js. Low and Canvas do not use this pipeline
// (Vegetation nudges visible crowns by a pixel instead).
export const fx = { angle: 0, lean: 0, strength: 0, amp: 1, invW: 1, rows: 1, frameBase: 1, step: 2 };

const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D uMainSampler[%count%]; // only the crown atlas is ever drawn with this pipeline: unit 0
uniform vec4 uWind;  // flutter angle, lean (wind x times the lean factor), strength, amplitude in base pixels
uniform vec4 uAtlas; // 1 / atlas width in texels, frames in the atlas, frame height in base pixels, texels per base pixel
varying vec2 outTexCoord;
varying vec4 outTint;
void main() {
  float local = fract(outTexCoord.y * uAtlas.y);
  float h = 1.0 - (floor(local * uAtlas.z) + 0.5) / uAtlas.z;
  float phase = outTint.b * 6.2831853;
  float shift = floor(uWind.w * h * h * (uWind.y + sin(uWind.x + phase + h * 1.3) * uWind.z) + 0.5) * uAtlas.w;
  gl_FragColor = texture2D(uMainSampler[0], outTexCoord - vec2(shift * uAtlas.x, 0.0)) * outTint.a;
}`;

export class WindFx extends Phaser.Renderer.WebGL.Pipelines.MultiPipeline {
  constructor(game) { super({ game, name: 'SchulwegWind', fragShader: FRAG }); }

  onBind() {
    this.set4f('uWind', fx.angle, fx.lean, fx.strength, fx.amp);
    this.set4f('uAtlas', fx.invW, fx.rows, fx.frameBase, fx.step);
  }
}
