// Cast shadows (AD-31, story 16.4): an object pipeline for the one shadow-layer image of a map. The texture is the shadow
// mask baked by render/shadowMath.js; the shader samples it shifted along the sun direction (several taps along the
// shift, so the shadow is a swept, dithered shape that fades towards its tip; pixels the full shift does not reach are skipped early), cuts the casters' own footprint and adds
// the ambient-occlusion bands. Everything that changes (offsets, strength) lives in the shared `fx` object that
// render/Shadows.js updates; the image is never redrawn. Drawn with the MULTIPLY blend, so the colour tints the ground.
export const fx = { inv: [1, 1], off: [0, 0, 0, 0], color: [0.35, 0.42, 0.6], k: [0, 0, 0] };

const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D uMainSampler;
uniform vec2 uInv;   // 1 / mask size in texels
uniform vec4 uOff;   // sun shift in texels: tall casters xy, low casters zw
uniform vec3 uColor;
uniform vec3 uK;     // shadow strength, ambient occlusion strong, weak
varying vec2 outTexCoord;
void main() {
  vec4 m = texture2D(uMainSampler, outTexCoord);
  vec2 q = mod(floor(outTexCoord / uInv), 2.0);
  float bayer = q.y < 0.5 ? (q.x < 0.5 ? 0.125 : 0.625) : (q.x < 0.5 ? 0.875 : 0.375);
  // A shadow pixel always sees a caster at the full shift (casters are thicker than the shift), so most pixels cost three fetches.
  float cov = 0.0;
  float far = max(texture2D(uMainSampler, outTexCoord - uOff.xy * uInv).r, texture2D(uMainSampler, outTexCoord - uOff.zw * uInv).g);
  if (far > 0.5) {
    cov = far;
    for (int i = 1; i <= 3; i++) {
      float t = float(i) * 0.25;
      cov += max(texture2D(uMainSampler, outTexCoord - uOff.xy * uInv * t).r, texture2D(uMainSampler, outTexCoord - uOff.zw * uInv * t).g);
    }
  }
  float foot = step(0.99, m.b);
  float shadow = (1.0 - foot) * step(bayer, min(1.0, cov * 0.4)) * uK.x;
  float ao = m.b > 0.3 && m.b < 0.9 ? uK.y : (m.b > 0.1 && m.b <= 0.3 && abs(q.x - q.y) < 0.5 ? uK.z : 0.0);
  float a = max(shadow, ao);
  if (a <= 0.0) discard;
  gl_FragColor = vec4(uColor * a, a);
}`;

export class ShadowFx extends Phaser.Renderer.WebGL.Pipelines.SinglePipeline {
  constructor(game) { super({ game, name: 'SchulwegShadow', fragShader: FRAG }); }

  onBind(gameObject) {
    super.onBind(gameObject);
    this.set2f('uInv', fx.inv[0], fx.inv[1]);
    this.set4f('uOff', fx.off[0], fx.off[1], fx.off[2], fx.off[3]);
    this.set3f('uColor', fx.color[0], fx.color[1], fx.color[2]);
    this.set3f('uK', fx.k[0], fx.k[1], fx.k[2]);
  }
}
