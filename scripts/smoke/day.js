// Smoke scenarios: day. Each export is { name, run(game, assert, env) }; registered in scripts/smoke/index.js.
// freeplay day clock and its HUD
export const dayClock = {
  name: 'dayClock',
  run(game, assert, env) {
    const { hud, ctx } = env;
    // ---- day clock (no slot: freeplay) ----
    assert('freeplay clock stands at its data time', ctx.day.mode === 'freeplay' && ctx.day.time === '07:45' && ctx.day.phase === 'commute', `${ctx.day.mode} ${ctx.day.time}`);
    assert('HUD shows the time and the phase', hud('clock').time.text === '07:45' && hud('clock').phase.text.includes(ctx.t('day.phase.commute')), `${hud('clock').time.text} / ${hud('clock').phase.text}`);
  }
};
