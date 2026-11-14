// Pure part of the effects setting (story 16.15, AD-29, AD-31): the Effekte mode (full, reduced, off) turns a tier of
// data/quality.json into the tier the systems read. `full` is the tier as it is; `reduced` and `off` come from the
// `effects` block of the same file and only ever take things away: a number is capped (min of both), `false` switches a
// feature off, every key that is not named keeps the tier's value. Gameplay caps (NPCs, bullies, props, pools of aim dots
// and the render scale) are never named there (scripts/check-effects.mjs), so the setting changes the look, not the play.

export const EFFECT_MODES = ['full', 'reduced', 'off'];

export const isEffectMode = m => EFFECT_MODES.includes(m);

// Keys the setting may never touch.
export const GAMEPLAY_KEYS = ['renderScale', 'maxProps', 'maxNPCs', 'maxBullies', 'aimDots', 'skidPool', 'smokePool', 'bellPool', 'streetProps'];

function cap(base, rule) {
  if (rule && typeof rule === 'object' && base && typeof base === 'object') {
    const out = {};
    for (const k of Object.keys(base)) out[k] = k in rule ? cap(base[k], rule[k]) : base[k];
    return out;
  }
  if (rule === false) return typeof base === 'number' ? 0 : false;
  if (typeof rule === 'number' && typeof base === 'number') return Math.min(base, rule);
  return base;
}

// The tier for a mode. `full` returns the base object itself; the others return a new frozen-shape copy.
export function effectiveTier(base, effects, mode) {
  if (mode === 'full' || !effects?.[mode]) return base;
  return cap(base, effects[mode]);
}

// The reducedMotion flag that goes with a mode (shake, hit-stop, squash and look-ahead follow the setting).
export const motionReducedFor = mode => mode !== 'full';
