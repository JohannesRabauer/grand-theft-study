// The Effekte setting (story 16.15, CAP-33, CAP-35, AD-31): data/quality.json `effects` (reduced, off), the pure tier maths of
// services/qualityLogic.js, the `settings.effects` state action and the texts. Pure logic; the live switch (instant, persists
// across a reload) is covered by the smoke scenario `effects`.
// Run: node scripts/check-effects.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EFFECT_MODES, GAMEPLAY_KEYS, effectiveTier, isEffectMode, motionReducedFor } from '../services/qualityLogic.js';
import { ACTIONS } from '../state/actions.js';
import { isBeyondView, CULL_MARGIN } from '../render/Culling.js';

const load = p => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const cfg = load('data/quality.json');
const i18n = { de: load('i18n/de.json'), en: load('i18n/en.json') };

assert.deepEqual(EFFECT_MODES, ['full', 'reduced', 'off']);
assert.ok(isEffectMode('off') && !isEffectMode('max') && !isEffectMode(undefined));
assert.equal(cfg.effects.default, 'full', 'the default is the full look');

// walks two values of the same shape: every number may only shrink, every boolean may only go from on to off
function noMore(a, b, path) {
  if (a && typeof a === 'object') { for (const k of Object.keys(a)) noMore(a[k], b[k], `${path}.${k}`); return; }
  if (typeof a === 'number') assert.ok(b <= a, `${path}: ${b} > ${a}`);
  else if (typeof a === 'boolean') assert.ok(!b || a, `${path}: switched on`);
  assert.equal(typeof a, typeof b, `${path}: same type`);
}

for (const id of Object.keys(cfg.tiers)) {
  const base = cfg.tiers[id];
  assert.equal(effectiveTier(base, cfg.effects, 'full'), base, `${id}: full is the tier itself`);
  const red = effectiveTier(base, cfg.effects, 'reduced');
  const off = effectiveTier(base, cfg.effects, 'off');
  noMore(base, red, `${id}.reduced`);
  noMore(red, off, `${id}.off`);
  assert.deepEqual(Object.keys(red), Object.keys(base), `${id}: reduced keeps every key`);
  assert.deepEqual(Object.keys(off), Object.keys(base), `${id}: off keeps every key`);
  for (const k of GAMEPLAY_KEYS) {
    assert.equal(red[k], base[k], `${id}.reduced: ${k} is gameplay and stays`);
    assert.equal(off[k], base[k], `${id}.off: ${k} is gameplay and stays`);
  }
  assert.equal(off.lightMap, false, `${id}.off: no light map, no WebGL passes`);
  assert.equal(off.postFx.grade || off.postFx.vignette || off.postFx.bloomTaps > 0, false, `${id}.off: no passes`);
  assert.equal(off.atmosphere.pass, false, `${id}.off: no atmosphere pass`);
  assert.equal(off.shadows, false, `${id}.off: no shadows`);
  assert.equal(off.maxLights, 0, `${id}.off: no light pool`);
  assert.ok(off.maxParticles <= red.maxParticles && off.particleMul <= red.particleMul, `${id}: off has the fewest particles`);
  assert.equal(red.postFx.bloomTaps, 0, `${id}.reduced: no bloom`);
  assert.ok(red.lightMap === base.lightMap && red.postFx.grade === base.postFx.grade && red.shadows === base.shadows, `${id}.reduced: the mood (light, grade, shadows) stays`);
}
// the keys the setting names are real keys of every tier
for (const mode of ['reduced', 'off']) {
  const walk = (rule, base, path) => {
    for (const k of Object.keys(rule)) {
      assert.ok(k in base, `effects.${mode}.${path}${k} is not a tier key`);
      if (rule[k] && typeof rule[k] === 'object') walk(rule[k], base[k], `${path}${k}.`);
    }
  };
  for (const id of Object.keys(cfg.tiers)) walk(cfg.effects[mode], cfg.tiers[id], '');
}

// the mode drives the reducedMotion flag of story 16.13
assert.deepEqual(EFFECT_MODES.map(motionReducedFor), [false, true, true]);
const draft = { shared: { flags: {} } };
const r = ACTIONS['settings.effects'](draft, { value: 'reduced' });
assert.equal(r.path.includes('shared.flags.effects'), true);
assert.equal(draft.shared.flags.effects, 'reduced');
assert.equal(draft.shared.flags.reducedMotion, true, 'reduced effects mean reduced motion');
ACTIONS['settings.effects'](draft, { value: 'full' });
assert.equal(draft.shared.flags.reducedMotion, false);
assert.ok(ACTIONS['settings.effects'](draft, { value: 'max' }).reject, 'bad payload rejected');
assert.ok(ACTIONS['settings.effects'](draft, {}).reject, 'missing payload rejected');
assert.equal(draft.shared.flags.effects, 'full', 'a rejected action changes nothing');

// off-screen culling (story 16.15): never hides anything that touches the view, rotation-proof, margin around the view
const view = { x: 100, y: 100, right: 586, bottom: 430 };
assert.equal(isBeyondView(300, 200, 16, 16, 0.5, 0.5, 1, view), false, 'inside');
assert.equal(isBeyondView(90, 200, 16, 16, 0.5, 0.5, 1, view), false, 'just outside the view, inside the margin');
assert.equal(isBeyondView(100 - CULL_MARGIN - 40, 200, 16, 16, 0.5, 0.5, 1, view), true, 'far left');
assert.equal(isBeyondView(300, 430 + CULL_MARGIN + 40, 16, 16, 0.5, 0.5, 1, view), true, 'far below');
assert.equal(isBeyondView(50, 200, 200, 16, 0, 0.5, 1, view), false, 'a wide sprite whose origin is outside still reaches in (origin left, reaches right)');
assert.equal(isBeyondView(90, 200, 200, 16, 1, 0.5, 1, view), false, 'origin on the right edge, body extends left: farthest corner counts');
assert.equal(isBeyondView(300, 200, 2560, 1792, 0, 0, 1, view), false, 'a huge layer with its corner at the view is never culled');
assert.equal(isBeyondView(-300, 200, 16, 16, 0.5, 1, 2, view), true, 'scaled sprite far away');
assert.equal(isBeyondView(100 - CULL_MARGIN - 10, 200, 16, 16, 0.5, 0.5, 4, view), false, 'a scale of 4 reaches back in');

// the texts, both languages
for (const l of ['de', 'en']) {
  for (const k of ['menu.effects', 'parent.effects', 'effects.full', 'effects.reduced', 'effects.off']) assert.ok(i18n[l][k], `${l}: ${k}`);
}
assert.notEqual(i18n.de['effects.reduced'], i18n.en['effects.reduced']);

console.log('check-effects: ok');
