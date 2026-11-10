// Smoke scenario: the particle overhaul (story 16.11). Registered in scripts/smoke/index.js. The live total never passes the tier's maxParticles
// under a flood of bursts; footsteps, crowns and drips come from the ground under a kid; glowing particles take pooled lights while it is dark
// and give every one back (death, clearing an emitter, a celebration flash running out); falling leaves and petals follow the season and stop with
// their test flag. The test flags and the day clock are put back.
export const particles = {
  name: 'particles',
  run(game, assert, env) {
    const { step, ctx } = env;
    const hub = ctx.particles;
    const day = ctx.day;
    const player = ctx.players[0];
    if (ctx.map.indoor) { assert('the particles scenario starts outdoors', false); return; }
    const alive = name => hub.emitters[name].emitter.getAliveParticleCount();
    const clear = () => { for (const e of hub.list) e.emitter.killAll(); };
    const flags = ['footstepsOff', 'dripsOff', 'petalsOff', 'leavesFallOff', 'embersOff', 'motesOff', 'glowOff'];
    const fake = (season, phase, alpha = 0) => {
      Object.defineProperty(day, 'season', { value: season, configurable: true });
      Object.defineProperty(day, 'phase', { value: phase, configurable: true });
      Object.defineProperty(day, 'tint', { value: { alpha, rgb: 0x203060 }, configurable: true });
    };
    const unfake = () => { for (const k of ['season', 'phase', 'tint']) delete day[k]; };
    for (const f of flags) game[f] = false;
    clear();
    const max = ctx.quality.tier.maxParticles;
    const wState = ctx.weather.state;
    ctx.weather.state = 'clear';
    const lightsBefore = ctx.lights.count;

    // the budget: a flood of bursts every frame, the total stays inside the tier
    let peak = 0;
    for (let i = 0; i < 120; i++) {
      for (const n of ['confetti', 'spark', 'dust', 'sparkle', 'crown']) hub.emit(n, player.x, player.y, { count: 40 });
      step(1);
      peak = Math.max(peak, hub.live());
    }
    assert('a flood of bursts never passes the tier budget of live particles', peak > 20 && peak <= max, `${peak} / ${max}`);
    clear();

    // the ground under a kid: footsteps on asphalt, the crown in water, drips after it
    const m = player.move;
    const keep = { surface: m.surface, speed: m.velSpeed };
    m.surface = 'asphalt'; m.velSpeed = 70;
    hub.playerFx(0.3, player);
    assert('a walking kid on asphalt leaves a footstep puff', alive('stepdust') > 0, `${alive('stepdust')}`);
    m.surface = 'puddle';
    hub.playerFx(0.4, player);
    assert('in water the step is a splash crown', alive('crown') > 0, `${alive('crown')}`);
    m.surface = 'asphalt'; m.velSpeed = 0;
    hub.playerFx(0.2, player);
    assert('and a kid that just left the water drips', alive('drip') > 0, `${alive('drip')}`);
    game.footstepsOff = true; game.dripsOff = true;
    clear();
    m.surface = 'asphalt'; m.velSpeed = 70; hub.wetT[0] = 1;
    hub.playerFx(0.5, player);
    assert('footsteps and drips stop with their test flags', alive('stepdust') === 0 && alive('drip') === 0);
    m.surface = keep.surface; m.velSpeed = keep.speed;
    game.footstepsOff = false; game.dripsOff = false;
    clear();

    // glowing particles and their lights
    const canGlow = ctx.lights.mapActive && ctx.quality.tier.particleLights > 0;
    const want = canGlow ? Math.min(10, ctx.quality.tier.particleLights) : 0;
    fake('summer', 'evening', 0.5);
    hub.emit('firefly', player.x, player.y, { count: 10 });
    step(2);
    assert('glowing particles take pooled lights in the dark, up to the tier budget', hub.glow.count === want && ctx.lights.count === lightsBefore + want, `${hub.glow.count} glowing, ${ctx.lights.count - lightsBefore} new lights, wanted ${want}`);
    clear();
    assert('clearing the emitter gives every light back', hub.glow.count === 0 && ctx.lights.count === lightsBefore, `${ctx.lights.count - lightsBefore}`);
    hub.emit('firefly', player.x, player.y, { count: 3 });
    step(2);
    step(300);
    assert('dead glowing particles give their lights back', alive('firefly') === 0 && hub.glow.count === 0 && ctx.lights.count === lightsBefore, `${alive('firefly')} alive, ${hub.glow.count} glowing, ${ctx.lights.count - lightsBefore} new lights`);
    fake('summer', 'afternoon', 0);
    hub.emit('firefly', player.x, player.y, { count: 5 });
    step(2);
    assert('in daylight nothing glows', hub.glow.count === 0 && ctx.lights.count === lightsBefore);
    clear();
    game.glowOff = true;
    fake('summer', 'evening', 0.5);
    hub.emit('firefly', player.x, player.y, { count: 5 });
    step(2);
    assert('the glow test flag keeps the lights away', hub.glow.count === 0 && ctx.lights.count === lightsBefore);
    clear();
    game.glowOff = false;

    // a celebration: bursts at the kid and a flash that runs out
    hub.celebrate('levelup', 0);
    assert('a level up bursts with sparkles and confetti', alive('sparkle') > 0 && alive('confetti') > 0);
    assert('and flashes a light where there is a light map', hub.flashes.count === (ctx.lights.mapActive ? 1 : 0), `${hub.flashes.count}`);
    step(70);
    assert('the flash gives its light back', hub.flashes.count === 0 && ctx.lights.count === lightsBefore, `${hub.flashes.count}`);
    clear();

    // the seasons: petals in spring, falling leaves in autumn, none in the other, none with their flag
    game.ambienceOff = false;
    for (const [emitter, season, phase] of [['petal', 'spring', 'afternoon'], ['leaffall', 'autumn', 'morning']]) {
      fake(season, phase);
      step(300);
      assert(`${emitter}: ${season} lets them fall inside their cap`, alive(emitter) > 0 && alive(emitter) <= hub.emitters[emitter].emitter.maxAliveParticles, `${alive(emitter)}`);
      clear();
    }
    fake('winter', 'school');
    step(200);
    assert('in winter neither leaves nor petals fall', alive('petal') === 0 && alive('leaffall') === 0);
    game.petalsOff = true; game.leavesFallOff = true;
    fake('spring', 'afternoon');
    step(200);
    fake('autumn', 'morning');
    step(200);
    assert('the test flags stop them', alive('petal') === 0 && alive('leaffall') === 0);

    // put everything back
    game.ambienceOff = true;
    for (const f of flags) game[f] = true;
    unfake();
    clear();
    ctx.weather.state = wState;
    assert('the scenario leaves no light behind', ctx.lights.count === lightsBefore && hub.glow.count === 0 && hub.flashes.count === 0);
  }
};
