// Smoke scenario: the seasonal atmosphere (story 16.19). Registered in scripts/smoke/index.js. The snow cover rises in steps, never in one
// jump, the pools never pass the tier caps, glints appear only with the test flag off, frost and shimmer follow season and weather, the beams
// follow the daylight, and every tier switch takes its layer away. Nothing here reads Math.random. Weather, clock and flags are put back.
export const season = {
  name: 'season',
  run(game, assert, env) {
    const { step, ctx } = env;
    const gs = game.scene.getScene('Game');
    const se = gs.season;
    if (ctx.map.indoor || !se) { assert('the season scenario starts outdoors', false); return; }
    const sw = ctx.quality.tier.atmosphere;
    const saved = { ...sw };
    const state = ctx.weather.state;
    const clock = { ...ctx.state.shared.clock };
    const setTime = (minute, weather) => {
      const phase = ctx.day.cfg.phases.find(p => minute >= p.start && minute < p.end);
      ctx.state.dispatch('clock.set', { day: clock.day, minute, phase: phase.id });
      ctx.events.emit('clock:tick', ctx.day.snapshot());
      ctx.weather.state = weather;
    };
    const vis = list => list.filter(s => s.visible).length;
    const L = se.L;

    // winter, clear: the cover holds at a share, the frost shows, no heat
    setTime(12 * 60, 'clear');
    se.settle();
    step(60);
    assert('a winter day holds some snow cover and a frost', L.cover > 0.4 && L.cover < 0.7 && L.frost > 0.4, `cover ${L.cover.toFixed(2)} frost ${L.frost.toFixed(2)}`);
    assert('no heat shimmer in winter', L.heat === 0, `${L.heat}`);
    assert('roofs show snow near the view', vis(se.bobs) > 0 || se.tiles.kind.every(k => k !== 1), `${vis(se.bobs)}`);

    // snowfall: the cover climbs in small steps up to 1
    ctx.weather.state = 'snow';
    let worst = 0;
    let last = L.cover;
    for (let i = 0; i < 1700; i++) { step(1); worst = Math.max(worst, Math.abs(L.cover - last)); last = L.cover; }
    assert('snowfall builds the cover over seconds, never in one step', L.cover > 0.98 && worst < 0.002, `cover ${L.cover.toFixed(3)}, biggest step ${worst.toFixed(5)}`);
    assert('the tile pool never passes the tier cap', vis(se.bobs) <= sw.snow, `${vis(se.bobs)} / ${sw.snow}`);
    assert('hedge tops and crown caps stay inside their pools', vis(se.hedgeImgs) <= sw.hedges && vis(se.crownImgs) <= sw.crowns, `${vis(se.hedgeImgs)} ${vis(se.crownImgs)}`);
    assert('frost is at its deepest while it snows', Math.abs(L.frost - 1) < 0.01, `${L.frost}`);
    game.sparkleOff = false;
    step(300);
    assert('covered roofs glint, within the pool', se.sparkLive === vis(se.sparks) && vis(se.sparks) <= sw.sparkle && se.sparkLive > 0, `${se.sparkLive} live of ${sw.sparkle}`);
    game.sparkleOff = true;
    step(120);
    assert('no new glints with the test flag on, the old ones fade out', se.sparkLive === 0 && vis(se.sparks) === 0, `${se.sparkLive}`);

    // spring afternoon, clear: the cover melts slowly, the frost goes, the heat and the beams come
    setTime(16 * 60, 'clear');
    step(900);
    assert('the cover melts, slowly', L.cover > 0 && L.cover < 1, `${L.cover.toFixed(2)}`);
    assert('the frost is gone in spring', L.frost === 0, `${L.frost}`);
    assert('a hot clear afternoon shimmers', L.heat > 0.3, `${L.heat.toFixed(2)}`);
    assert('beams stand under the crowns in daylight', L.rays > 0.9 && vis(se.beams) <= sw.rays, `${L.rays.toFixed(2)} ${vis(se.beams)}`);
    if (gs.postFx.atmosphereAllowed) assert('the grade pass carries the shimmer', se.wispN === 0 && vis(se.wisps) === 0, `${se.wispN}`);
    else assert('Low and Canvas draw heat wisps instead', se.wispN > 0 && vis(se.wisps) === se.wispN, `${se.wispN} ${vis(se.wisps)}`);
    setTime(16 * 60, 'rain');
    step(600);
    assert('rain takes the heat and the beams away', L.heat === 0 && L.rays === 0, `${L.heat} ${L.rays}`);
    setTime(21 * 60 + 30, 'clear');
    step(600);
    assert('the beams are gone at night', L.rays === 0 && vis(se.beams) === 0, `${L.rays} ${vis(se.beams)}`);
    setTime(16 * 60, 'clear');
    step(600);
    assert('and come back in daylight', L.rays > 0.9, `${L.rays.toFixed(2)}`);

    // every tier switch takes its layer away
    setTime(12 * 60, 'snow');
    se.settle();
    step(60);
    Object.assign(sw, saved, { snow: 0 });
    step(5);
    assert('switching the tile snow off hides it', vis(se.bobs) === 0 && L.cover === 0, `${vis(se.bobs)} ${L.cover}`);
    Object.assign(sw, saved, { crowns: 0, hedges: 0 });
    step(5);
    assert('switching crown and hedge caps off hides them', vis(se.crownImgs) === 0 && vis(se.hedgeImgs) === 0);
    Object.assign(sw, saved, { frost: false });
    step(500);
    assert('switching the frost off takes it away', L.frost === 0 && !se.frostImg?.visible, `${L.frost}`);
    Object.assign(sw, saved, { rays: 0, shimmer: 0 });
    setTime(16 * 60, 'clear');
    step(500);
    assert('switching beams and shimmer off takes them away', L.rays === 0 && L.heat === 0 && vis(se.beams) === 0 && vis(se.wisps) === 0, `${L.rays} ${L.heat}`);

    // put everything back
    Object.assign(sw, saved);
    setTime(clock.minute, state);
    ctx.state.dispatch('clock.set', { day: clock.day, minute: clock.minute, phase: clock.phase });
    ctx.weather.state = state;
    step(1500);
    assert('the clock is back where it was', ctx.state.shared.clock.phase === clock.phase, `${ctx.state.shared.clock.phase}`);
  }
};
