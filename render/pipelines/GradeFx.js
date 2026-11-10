// Colour grade + vignette: one full-screen WebGL pass on the world camera (AD-31). Parameters come from the shared
// `fx` object that render/PostFx.js updates; the shader holds no state of its own. The atmosphere of story 16.12 (haze, cloud
// shadows, rain veil: render/pipelines/AtmosphereFx.js) runs first inside this same pass, so it needs no pass of its own.
import { GLSL_UNIFORMS, GLSL_FUNCS, setUniforms } from './AtmosphereFx.js';

export const fx = { tint: [1, 1, 1], saturation: 1, contrast: 1, vignette: 0, inner: 0.45, outer: 1.15 };

const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D uMainSampler;
uniform vec3 uTint;
uniform vec4 uGrade; // saturation, contrast, vignette strength, unused
uniform vec2 uVig;   // inner, outer radius
varying vec2 outTexCoord;
${GLSL_UNIFORMS}${GLSL_FUNCS}
void main() {
  vec4 c = texture2D(uMainSampler, outTexCoord);
  c.rgb = atmosphere(c.rgb, outTexCoord);
  float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
  vec3 rgb = mix(vec3(l), c.rgb, uGrade.x);
  rgb = (rgb - 0.5) * uGrade.y + 0.5;
  rgb *= uTint;
  float d = length((outTexCoord - 0.5) * vec2(1.0, 0.82));
  float v = smoothstep(uVig.x, uVig.y, d * 1.414);
  rgb *= 1.0 - uGrade.z * v;
  gl_FragColor = vec4(max(rgb, 0.0), c.a);
}`;

export class GradeFx extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  constructor(game) { super({ game, name: 'SchulwegGrade', fragShader: FRAG }); }

  onPreRender() {
    this.set3f('uTint', fx.tint[0], fx.tint[1], fx.tint[2]);
    this.set4f('uGrade', fx.saturation, fx.contrast, fx.vignette, 0);
    this.set2f('uVig', fx.inner, fx.outer);
    setUniforms(this);
  }
}
