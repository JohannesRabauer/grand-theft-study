// Smoke scenario: the particle set (story 12.2). Registered in scripts/smoke/index.js. The seasonal effects start when their season, phase and
// weather fit (the day clock is faked for the test), stay inside the particle cap and stop again; the sprinkler and the fountain of the park
// splash; snow and ice have their footprints. The day clock is put back.
export const ambience = {
  name: 'ambience',
  run(game, assert, env) {
    const { step, ctx, gs } = env;
    const hub = ctx.particles;
    const day = ctx.day;
    if (ctx.map.indoor) { assert('the ambience scenario starts outdoors', false); return; }
    const alive = name => hub.emitters[name].emitter.getAliveParticleCount();
    const fake = (season, phase, alpha = 0) => {
      Object.defineProperty(day, 'season', { value: season, configurable: true });
      Object.defineProperty(day, 'phase', { value: phase, configurable: true });
      Object.defineProperty(day, 'tint', { value: { alpha, rgb: 0xffffff }, configurable: true });
    };
    const unfake = () => { for (const k of ['season', 'phase', 'tint']) delete day[k]; };
    game.ambienceOff = false;
    const wState = ctx.weather.state;
    ctx.weather.state = 'clear';
    const cases = [['pollen', 'spring', 'afternoon'], ['butterfly', 'summer', 'afternoon'], ['firefly', 'summer', 'evening', 0.3], ['fog', 'autumn', 'morning']];
    for (const [emitter, season, phase, alpha] of cases) {
      for (const e of hub.list) e.emitter.killAll();
      fake(season, phase, alpha ?? 0);
      step(240);
      assert(`${emitter}: appears in ${season} ${phase} and stays inside its cap`, alive(emitter) > 0 && alive(emitter) <= hub.emitters[emitter].emitter.maxAliveParticles, `${alive(emitter)} / ${hub.emitters[emitter].emitter.maxAliveParticles}`);
    }
    for (const e of hub.list) e.emitter.killAll();
    fake('winter', 'school');
    step(240);
    assert('in winter none of the spring and summer life shows', alive('pollen') === 0 && alive('butterfly') === 0 && alive('firefly') === 0 && alive('fog') === 0);
    fake('spring', 'afternoon');
    ctx.weather.state = 'rain';
    for (const e of hub.list) e.emitter.killAll();
    step(120);
    assert('rain keeps the pollen and the butterflies away', alive('pollen') === 0 && alive('butterfly') === 0);
    ctx.weather.state = 'clear';
    fake('autumn', 'morning', 0.18);
    for (const e of hub.list) e.emitter.killAll();
    step(120);
    assert('a dim dawn is not daylight: no pollen', alive('pollen') === 0);
    assert('the particle total stays within the tier budget', hub.live() <= ctx.quality.tier.maxParticles, `${hub.live()}`);
    unfake();
    game.ambienceOff = true;
    ctx.weather.state = wState;

    // sprinklers and the fountain
    const sprinkler = hub.spots.find(s => s.kind === 'sprinkler');
    const fountain = hub.spots.find(s => s.kind === 'fountain');
    assert('the park has a sprinkler and a pond fountain', !!sprinkler && !!fountain);
    const player = ctx.players[0];
    const home = { x: player.x, y: player.y };
    player.teleport(sprinkler.x + 20, sprinkler.y);
    gs.snapCamera();
    hub.emitters.splash.emitter.killAll();
    step(60);
    assert('they splash while in view', alive('splash') > 0, `${alive('splash')}`);
    player.teleport(home.x, home.y);
    gs.snapCamera();
    step(3);

    // snow and ice footprints
    assert('snow and ice have their own footprint effects', hub.cfg.surfaceFx[ctx.surfaces.props('snow').particle]?.name === 'dust' && hub.cfg.surfaceFx[ctx.surfaces.props('ice').particle]?.name === 'spark');
    for (const e of hub.list) e.emitter.killAll();
  }
};
