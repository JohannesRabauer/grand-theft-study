// Atmosphere in the colour-grade pass (AD-31, story 16.12): haze (fog banks and morning mist), drifting cloud shadows and a faint veil of
// distant rain, worked into the grade shader (render/pipelines/GradeFx.js) so it costs no extra full-screen pass. Everything is computed per base pixel of the world
// (value noise of two octaves, cut into four flat levels with ordered dither), so it scrolls with the ground and stays pixel
// art. Fog spares bright pixels (lamps, lit windows keep their glow). The shared values live in `fx`, set by render/Atmosphere.js.
export const fx = {
  view: [0, 0, 480, 270], // world x, y, width, height of the camera view
  haze: [0, 0.8, 0.8, 0.8], // density, rgb (already multiplied by the ambient light)
  band: [0.3, 0.7, 90, 4], // lo, hi, noise scale in base px, levels
  cloud: [0, 120, 0, 0], // strength, scale, drift x, drift y (world units)
  shade: [0.8, 0.85, 0.95, 0.5], // shadow colour and band lo
  veil: [0, 0.22, 140, 0], // veil strength (rain amount x alpha), slant, speed
  amb: [1, 1, 1], time: 0, drift: [0, 0], hi: 0.58
};

export const GLSL_UNIFORMS = `
uniform vec4 uView;
uniform vec4 uHaze;
uniform vec4 uBand;
uniform vec4 uCloud;
uniform vec4 uShade;
uniform vec4 uVeil;
uniform vec4 uTime; // time, haze drift x, y, cloud band hi
uniform vec4 uAmb; // ambient light colour
`;

export const GLSL_FUNCS = `
float h21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  return (vnoise(p) + vnoise(p * 2.0 + 17.0) * 0.5) / 1.5;
}
float bayer(vec2 p) {
  vec2 q = mod(p, 4.0);
  vec2 a = mod(q, 2.0);
  vec2 b = floor(q / 2.0);
  vec2 x = abs(a - b);
  return (x.x * 8.0 + a.y * 4.0 + x.y * 2.0 + b.y + 0.5) / 16.0;
}
vec3 atmosphere(vec3 rgb, vec2 uv) {
  vec2 cell = floor(vec2(uView.x + uv.x * uView.z, uView.y + (1.0 - uv.y) * uView.w));
  float dither = bayer(cell);
  if (uCloud.x > 0.001) {
    float n = fbm((cell - uCloud.zw) / uCloud.y);
    float s = smoothstep(uShade.w, uTime.w, n);
    float on = step(0.5, s + (dither - 0.5) * 0.9) * step(0.02, s);
    rgb *= mix(vec3(1.0), uShade.rgb, on * uCloud.x * 5.0);
  }
  if (uHaze.x > 0.001) {
    float n = fbm((cell - vec2(uTime.y, uTime.z)) / uBand.z);
    float d = smoothstep(uBand.x, uBand.y, n);
    float lum = dot(rgb, vec3(0.299, 0.587, 0.114));
    float keep = 1.0 - smoothstep(0.55, 0.95, lum) * 0.65;
    float lvl = floor(d * uBand.w + dither) / uBand.w;
    rgb = mix(rgb, uHaze.yzw, clamp(lvl, 0.0, 1.0) * uHaze.x * keep);
  }
  if (uVeil.x > 0.001) {
    float col = cell.x + floor(cell.y * uVeil.y);
    float on = step(0.9, h21(vec2(col, 3.0)));
    float run = fract((cell.y - uTime.x * uVeil.z + h21(vec2(col, 9.0)) * 64.0) / 26.0);
    rgb = mix(rgb, uAmb.rgb * vec3(0.8, 0.88, 0.97), on * step(run, 0.3) * uVeil.x);
  }
  return rgb;
}
`;

// Sets the uniforms of the pipeline that carries the atmosphere (the grade pass) from `fx`.
export function setUniforms(p) {
  p.set4f('uView', fx.view[0], fx.view[1], fx.view[2], fx.view[3]);
  p.set4f('uHaze', fx.haze[0], fx.haze[1], fx.haze[2], fx.haze[3]);
  p.set4f('uBand', fx.band[0], fx.band[1], fx.band[2], fx.band[3]);
  p.set4f('uCloud', fx.cloud[0], fx.cloud[1], fx.cloud[2], fx.cloud[3]);
  p.set4f('uShade', fx.shade[0], fx.shade[1], fx.shade[2], fx.shade[3]);
  p.set4f('uVeil', fx.veil[0], fx.veil[1], fx.veil[2], fx.veil[3]);
  p.set4f('uTime', fx.time, fx.drift[0], fx.drift[1], fx.hi);
  p.set4f('uAmb', fx.amb[0], fx.amb[1], fx.amb[2], 1);
}
