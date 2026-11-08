// Smoke scenario: season and weather cycle with snow and ice (story 12.1). Registered in scripts/smoke/index.js. The winter school window is
// scheduled to snow on some days; in the scenario the snow is made by hand: flakes fall, open ground is covered with snow and some with ice
// (slower and far slipperier surfaces), and everything melts away when it stops. The weather is put back to clear.
export const snow = {
  name: 'snow',
  run(game, assert, env) {
    const { step, ctx, player, gs } = env;
    const w = ctx.weather;
    const surfaces = ctx.surfaces;
    const log = [];
    ctx.events.on('weather:changed', e => log.push(e.state));
    const home = { x: player.x, y: player.y };
    if (ctx.map.indoor) { assert('the snow scenario starts outdoors', false); return; }
    const grip = id => surfaces.props(id).grip;
    assert('snow and ice are real surfaces: slower and far slipperier than asphalt', grip('snow') < grip('asphalt') && grip('ice') < grip('snow') && grip('ice') <= 0.2);
    assert('the winter part of the day is scheduled to snow on some days', ctx.day.cfg.phases.some(p => p.season === 'winter' && p.weather.some(x => x.state === 'snow')));
    const sch = ctx.day.cfg.phases.find(p => p.season === 'winter');
    assert('every season has its own phase', ['autumn', 'winter', 'spring', 'summer'].every(s => ctx.day.cfg.phases.some(p => p.season === s)) && !!sch);

    w.set('snow');
    step(3);
    assert('the weather state becomes snow, not rain', w.snowing && !w.raining && log.at(-1) === 'snow');
    step(60 * 6);
    assert('the snow fades in: flakes drift and the cold overlay shows', w.snowIntensity > 0.9 && w.flakes.filter(f => f.visible).length === w.flakes.length && w.overlay.visible && w.overlay.fillColor === w.snowColor, `${w.snowIntensity}`);
    assert('flakes stay inside the camera view', w.flakes.every(f => { const v = gs.cameras.main.worldView; return f.x > v.x - 30 && f.x < v.right + 30 && f.y >= v.y - 2 && f.y <= v.bottom + 2; }));
    step(60 * 10);
    assert('open ground near the camera is covered with snow, some of it with ice', w.count > 5, `${w.count}`);
    const kinds = new Set();
    const ts = surfaces.tileSize;
    for (let i = 0; i < w.count; i++) { const j = (w.head + i) % w.cfg.maxWet; kinds.add(surfaces.at(w.tx[j] * ts, w.ty[j] * ts)); }
    assert('the covered tiles really are snow or ice', [...kinds].every(k => k === 'snow' || k === 'ice') && kinds.has('snow'), [...kinds].join());
    assert('and the rain machinery stayed out of it: no puddles', ![...kinds].includes('puddle'));

    w.set('clear');
    step(60 * 20);
    assert('when it stops the flakes go and the snow melts away', w.snowIntensity === 0 && w.flakes.every(f => !f.visible) && w.count === 0 && !w.overlay.visible, `${w.count}`);
    ctx.state.dispatch('flags.set', { key: 'smokeSnow', value: 1 });
    player.teleport(home.x, home.y);
    gs.snapCamera();
    step(3);
    assert('the snow scenario leaves clear weather', w.state === 'clear' && !w.snowing);
  }
};
