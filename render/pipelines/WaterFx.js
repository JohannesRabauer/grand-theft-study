// Water surface (AD-31, story 16.8): an object pipeline for the mask image of one body of water (render/waterMath.js maskLayer:
// R = depth in 1/8 px, 0 = no water; G = per pixel noise). The fragment shader is the twin of `waterColor` there: depth bands with a
// 2x2 dither, scrolling ripple crests and troughs, shimmer in the shallows, glints and lapping foam, all on whole base pixels and in
// whole steps of time (`fx.phase`). On top it adds what only the pipeline can: a tint of the sky and the reflections of the lamps and
// lit windows near the body (`gameObject.waterU.lights`, set by render/Water.js), stepped so they stay pixel art.
// The shared values live in `fx`; the per-body lights travel on the game object.
export const fx = { phase: 0, sky: [0.62, 0.8, 0.94], skyMix: 0.2, pal: new Float32Array(24), bands: [3, 8, 14], foam: [1.1, 1.2, 1], caustic: [7, 0.78], ripple: [0.93, 2], swell: [0.55, 0.6], reflect: [0.95, 3] };

const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D uMainSampler;
uniform vec2 uSize;        // mask size in texels (= base pixels)
uniform vec2 uOrigin;      // world position of the mask's top left corner, in base pixels
uniform float uPhase;
uniform vec3 uPal[8];      // water 0..3, foam 4..5, shimmer 6, glint 7
uniform vec3 uBands;
uniform vec3 uFoam;        // base, swing, spread
uniform vec2 uCaustic;     // depth, threshold
uniform vec2 uRipple;      // threshold, min depth
uniform vec2 uSwell;       // swell: lighter above, darker below
uniform vec3 uSky;
uniform vec2 uSkyMix;      // sky mix, reflection steps
uniform vec4 uLights[8];   // x, y (mask pixels), reach, intensity
uniform vec3 uLightColor[8];
uniform float uReflect;
varying vec2 outTexCoord;

float bayer(vec2 p) {
  vec2 q = mod(p, 2.0);
  return q.y < 0.5 ? (q.x < 0.5 ? 0.125 : 0.625) : (q.x < 0.5 ? 0.875 : 0.375);
}
vec3 water(int i) {
  if (i == 0) return uPal[0];
  if (i == 1) return uPal[1];
  if (i == 2) return uPal[2];
  return uPal[3];
}
void main() {
  vec4 m = texture2D(uMainSampler, outTexCoord);
  if (m.r < 0.001) discard;
  vec2 p = floor(outTexCoord * uSize);
  vec2 w = p + uOrigin;
  float t = m.r * 255.0 / 8.0;
  float n = m.g;
  float ph = uPhase;
  float tb = t + (bayer(w) - 0.5) * 1.2;
  int level = tb < uBands.x ? 0 : (tb < uBands.y ? 1 : (tb < uBands.z ? 2 : 3));
  vec3 col = water(level);
  if (t < uCaustic.x) {
    float c = sin(w.x * 0.8 + ph + sin(w.y * 0.7 - ph) * 1.5) * sin(w.y * 0.8 - ph + sin(w.x * 0.6 + ph) * 1.5);
    if (c > uCaustic.y) col = uPal[6];
  }
  if (level > 0) { // a slow swell in wide bands, so the open water never forms one flat field
    float sw = sin(w.y * 0.55 + w.x * 0.18 + 2.2 * sin(w.x * 0.06 + ph) - ph);
    if (sw > uSwell.x) col = water(level - 1);
    else if (sw < -uSwell.y && level < 3) col = water(level + 1);
  }
  float v = sin((w.y + 0.35 * w.x) * 0.78 + 1.7 * sin(w.x * 0.21 + ph) - ph);
  if (t > uRipple.y) {
    if (v > uRipple.x) col = level > 0 ? water(level - 1) : uPal[5];
    else if (v < -uRipple.x) col = level < 3 ? water(level + 1) : uPal[3];
  }
  // the sky shows in the lighter water
  if (level < 2) col = mix(col, uSky, uSkyMix.x * (level == 0 ? 1.0 : 0.5));
  if (fract(n * 37.0 + 0.37 + ph * 0.4774648) > 0.9965) col = uPal[7];
  // reflections of lights: stretched along y, flat bands, brightest where a ripple crest catches the light
  if (uReflect > 0.0) {
    float crest = 0.15 + 0.35 * step(0.6, n) + 0.5 * step(0.5, v);
    vec3 add = vec3(0.0);
    for (int i = 0; i < 8; i++) {
      vec4 L = uLights[i];
      if (L.w <= 0.0) break;
      vec2 d = p + 0.5 - L.xy;
      float s = 1.0 - length(vec2(d.x, d.y > 0.0 ? d.y * 0.55 : d.y * 1.4)) / L.z;
      if (s <= 0.0) continue;
      add += uLightColor[i] * (ceil(s * uSkyMix.y) / uSkyMix.y) * crest * L.w;
    }
    col += add * uReflect;
  }
  if (t < uFoam.x + uFoam.y + uFoam.z) { // only the shore band needs the lapping foam
    float lim = uFoam.x + uFoam.y * (0.5 + 0.5 * sin(ph + w.x * 0.3 + w.y * 0.27));
    if (t < lim) col = (n > 0.3 || t < 1.0) ? uPal[4] : uPal[5];
    else if (t < lim + uFoam.z && n > 0.82) col = uPal[5];
  }
  gl_FragColor = vec4(col, 1.0);
}`;

export class WaterFx extends Phaser.Renderer.WebGL.Pipelines.SinglePipeline {
  constructor(game) { super({ game, name: 'SchulwegWater', fragShader: FRAG }); }

  onBind(gameObject) {
    super.onBind(gameObject);
    this.flush(); // the previous body is drawn with its own lights before these are set
    const u = gameObject.waterU;
    if (!u) return;
    this.set2f('uSize', u.w, u.h);
    this.set2f('uOrigin', u.ox, u.oy);
    this.set1f('uPhase', fx.phase);
    this.set3fv('uPal', fx.pal);
    this.set3f('uBands', fx.bands[0], fx.bands[1], fx.bands[2]);
    this.set3f('uFoam', fx.foam[0], fx.foam[1], fx.foam[2]);
    this.set2f('uCaustic', fx.caustic[0], fx.caustic[1]);
    this.set2f('uRipple', fx.ripple[0], fx.ripple[1]);
    this.set2f('uSwell', fx.swell[0], fx.swell[1]);
    this.set3f('uSky', fx.sky[0], fx.sky[1], fx.sky[2]);
    this.set2f('uSkyMix', fx.skyMix, fx.reflect[1]);
    this.set1f('uReflect', u.lit ? fx.reflect[0] : 0);
    this.set4fv('uLights', u.lights);
    this.set3fv('uLightColor', u.colors);
  }
}
