// Smooth-motion maths (story 16.13), Phaser-free. Look-ahead, stride cycles, squash curves, shake and easing.
export const clamp01 = (v) => Math.min(1, Math.max(0, v));
export const smooth = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };

// Eases `st` {x, y} towards a point ahead of the mover (velocity vx, vy in px/s): `distance` px at `speedFor` px/s,
// scaled by `gate` (0..1) so it can fade out. Returns st.
export function stepLookAhead(st, vx, vy, dt, cfg, gate = 1) {
  const speed = Math.hypot(vx, vy);
  const k = speed > 0.01 ? (cfg.distance * gate * smooth(speed / cfg.speedFor)) / speed : 0;
  const a = 1 - Math.exp(-cfg.response * dt);
  st.x += (vx * k - st.x) * a;
  st.y += (vy * k - st.y) * a;
  return st;
}

// A 4-step stride cycle from a travelled phase (in steps): 0 stride A, 1 standing, 2 stride B, 3 standing.
export function cycleStep(phase) { return ((Math.floor(phase) % 4) + 4) % 4; }
// Body rise in px at this phase: highest between the strides.
export function bobAt(phase, amp) { return Math.sin(Math.PI * (phase - Math.floor(phase))) * amp; }

// Squash: scale (sx, sy) at the extreme easing back to 1 over `time` s; `t` is the time since the start.
export function squashAt(preset, t, out) {
  const k = 1 - smooth(t / preset.time);
  out.sx = 1 + (preset.sx - 1) * k;
  out.sy = 1 + (preset.sy - 1) * k;
  return out;
}

// Whole-pixel shake offset: a decaying wobble, deterministic (no Math.random), never a fraction of a pixel.
export function shakeAt(preset, t, out) {
  if (t >= preset.time) { out.x = out.y = 0; return out; }
  const k = (1 - t / preset.time) ** 2;
  out.x = Math.round(Math.sin(t * preset.hz * 2.1) * preset.amp * k);
  out.y = Math.round(Math.sin(t * preset.hz * 1.7 + 1.3) * preset.amp * k);
  return out;
}

// Door and map fade alpha at time t: out 0..1 over `out` s, a short hold at black, then in 1..0 over `in` s, eased.
export function fadeAlpha(cfg, t, reduced) {
  const out = reduced ? cfg.reduced : cfg.out;
  const inn = reduced ? cfg.reduced : cfg.in;
  if (t < out) return smooth(t / out);
  if (t < out + cfg.hold) return 1;
  return 1 - smooth((t - out - cfg.hold) / inn);
}
