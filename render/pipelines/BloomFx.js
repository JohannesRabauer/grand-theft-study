// Bloom that only picks bright pixels (AD-31): a ring of taps around each pixel, each counted by how far its brightest
// channel is above the threshold, added back on top. By day (ambient white) `intensity` is 0, so only lit emissive
// pixels at dusk and night glow. Shared parameters live in `fx`, set by render/PostFx.js.
export const fx = { threshold: 0.6, intensity: 0, radius: 3.5, taps: 8 };

const FRAG = `
precision mediump float;
uniform sampler2D uMainSampler;
uniform vec2 uTexel;
uniform vec4 uBloom; // threshold, intensity, radius (pixels), taps
varying vec2 outTexCoord;
void main() {
  vec4 c = texture2D(uMainSampler, outTexCoord);
  vec3 sum = vec3(0.0);
  for (int i = 0; i < 16; i++) {
    if (float(i) >= uBloom.w) break;
    float a = float(i) * 2.39996;
    float r = uBloom.z * sqrt((float(i) + 0.5) / uBloom.w);
    vec3 s = texture2D(uMainSampler, outTexCoord + vec2(cos(a), sin(a)) * r * uTexel).rgb;
    float b = max(s.r, max(s.g, s.b));
    sum += s * smoothstep(uBloom.x, 1.0, b);
  }
  gl_FragColor = vec4(c.rgb + sum / uBloom.w * uBloom.y, c.a);
}`;

export class BloomFx extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  constructor(game) { super({ game, name: 'SchulwegBloom', fragShader: FRAG }); }

  onPreRender() {
    const { renderer } = this;
    this.set2f('uTexel', 1 / renderer.width, 1 / renderer.height);
    this.set4f('uBloom', fx.threshold, fx.intensity, fx.radius, fx.taps);
  }
}
