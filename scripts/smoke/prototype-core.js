// Smoke scenarios: prototype-core. Each export is { name, run(game, assert, env) }; registered in scripts/smoke/index.js.
// walk to the bike, mount it, ring the bell and ride home to the school
export const rideToSchool = {
  name: 'rideToSchool',
  run(game, assert, env) {
    const { h, intent, count, pools, live, player, drive, T, press, until, inWall, hud, ctx, gs } = env;
    assert('starts on foot at home with 5 euro', player.vehicle === 'foot' && ctx.state.shared.money === 500, `money ${ctx.state.shared.money}`);
    assert('no bullies, level 0, pools quiet', ctx.chase.level === 0 && live('bullies') === 0 && live('projectiles') === 0);
    const wallsAtStart = live('walls');
    assert('wall streaming keeps only nearby walls', wallsAtStart > 0 && wallsAtStart < ctx.pools.byName.get('walls').cap * 0.6, `${wallsAtStart}/${ctx.pools.byName.get('walls').cap}`);

    // ---- walk to the bike, mount ----
    const bike = ctx.map.objects.find(o => o.type === 'bike');
    drive.goal(T(bike.x), T(bike.y));
    assert('walked to the bike', until(() => drive.dist < 14, 900, () => drive.tick(6)) >= 0, `dist ${drive.dist.toFixed(1)}`);
    intent.move.x = intent.move.y = 0;
    press('interact');
    assert('mounted the bike', player.vehicle === 'bike' && gs.bikes.isMounted(0));
    press('jump');
    assert('bell rings', count('bike:bell') === 1 && live('bell') >= 1);

    // ---- ride home -> school by the main road (scripted route, A* between points) ----
    const route = h.makeRouteRunner(ctx, 16, 9);
    intent.sprint = true;
    let topSpeed = 0;
    const ride = until(() => gs.zones.reached[0], 5400, () => {
      route();
      topSpeed = Math.max(topSpeed, player.move.velSpeed);
      inWall();
    });
    intent.sprint = false;
    assert('rode to the school (goal:reached)', ride >= 0 && count('goal:reached') === 1, `${ride} frames, top ${topSpeed.toFixed(0)} px/s, at ${player.x.toFixed(0)},${player.y.toFixed(0)}`);
    assert('no �rger on the road', ctx.chase.level === 0 && live('bullies') === 0);
    assert('never inside a wall tile on the way', env.wallViolations === 0, `${env.wallViolations} frames`);
    assert('arrow shows arrival message', hud('objective').arrow.done && hud('objective').arrow.msg.visible);
  }
};

// charge and fire the slingshot at a can
export const slingshot = {
  name: 'slingshot',
  run(game, assert, env) {
    const { h, step, intent, count, live, player, until, ctx, gs } = env;
    // ---- slingshot ----
    const sling = player.toolbelt.current;
    sling.ammo = 5;
    const can = ctx.props.props.find(p => p.kind === 'can' && p.body.isStatic);
    h.teleport(gs, ctx, Math.floor(can.body.position.x / 16), Math.floor(can.body.position.y / 16) + 3);
    step(2);
    intent.aim = { x: can.body.position.x, y: can.body.position.y };
    intent.toolUse = true;
    step(50);
    assert('aim dots show while charging', live('aimDots') > 0);
    intent.toolUse = false;
    step(2);
    assert('slingshot fired, ammo 4', count('tool:fire') === 1 && sling.ammo === 4, `ammo ${sling.ammo}`);
    assert('pebble in flight', live('projectiles') >= 1 || count('prop:hit') >= 1);
    const flown = until(() => live('projectiles') === 0, 200);
    assert('pebble pool back to zero', flown >= 0 && live('aimDots') === 0, `${flown} frames`);
    assert('pebble hit the target can (info)', true, count('prop:hit') >= 1 ? 'hit' : 'missed');
    intent.aim = null;
    ctx.chase.reset(); // the shooting range is bully turf: leave it quiet for the rest of the run
    h.teleport(gs, ctx, 7, 51);
    step(30);
    assert('quiet again after the shooting range', ctx.chase.level === 0 && live('bullies') === 0 && !ctx.frozen);
  }
};

// rain on and off
export const weather = {
  name: 'weather',
  run(game, assert, env) {
    const { step, live, press, ctx } = env;
    // ---- weather ----
    press('weather');
    assert('rain on', ctx.weather.state === 'rain');
    step(240);
    assert('rain particles and puddles', live('particles') > 0 && ctx.weather.count > 0, `particles ${live('particles')}, puddles ${ctx.weather.count}`);
    press('weather');
    assert('rain off', ctx.weather.state === 'clear');
    step(180);
  }
};

// language switch re-texts the HUD
export const language = {
  name: 'language',
  run(game, assert, env) {
    const { step, hud, ctx, savedLang } = env;
    // ---- language ----
    const before = hud('status').stamina.text;
    ctx.i18n.set(savedLang === 'de' ? 'en' : 'de');
    step(2);
    assert('language switch re-texts the HUD', hud('status').stamina.text === ctx.t('hud.stamina') && hud('status').stamina.text !== before, `${before} -> ${hud('status').stamina.text}`);
    ctx.i18n.set(savedLang);
    step(2);
  }
};

// quality tier round trip keeps pools within caps
export const quality = {
  name: 'quality',
  run(game, assert, env) {
    const { step, pools, live, ctx } = env;
    // ---- quality switch round trip ----
    for (const tier of ['low', 'high', 'medium']) {
      ctx.quality.set(tier);
      step(20);
      const bad = pools().filter(p => p.live > p.cap);
      assert(`pools within cap at ${tier}`, bad.length === 0, JSON.stringify(bad));
      assert(`pedestrians within the ${tier} cap`, live('npcs') <= ctx.quality.tier.maxNPCs, `${live('npcs')}/${ctx.quality.tier.maxNPCs}`);
    }
  }
};

// pause event freezes the world
export const pause = {
  name: 'pause',
  run(game, assert, env) {
    const { h, step, intent, player, ctx, gs, ui } = env;
    // ---- pause ----
    h.teleport(gs, ctx, 7, 51);
    step(5);
    const px = player.x;
    ctx.events.emit('ui:pause-toggle');
    intent.move.x = 1;
    step(30);
    assert('paused world stands still', gs.paused && player.x === px);
    ctx.events.emit('ui:pause-toggle');
    step(30);
    intent.move.x = 0;
    assert('resumed', !gs.paused && player.x !== px, `paused ${gs.paused}, x ${px.toFixed(1)} -> ${player.x.toFixed(1)}, world ${gs.matter.world.enabled}, frozen ${ctx.frozen}`);
  }
};
