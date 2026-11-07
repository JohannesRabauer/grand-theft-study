// Smoke scenarios: chase. Each export is { name, run(game, assert, env) }; registered in scripts/smoke/index.js.
// skatepark turf starts the chase; hiding clears it; getting caught respawns the player at home
export const turfChase = {
  name: 'turfChase',
  run(game, assert, env) {
    const { h, step, intent, count, live, player, drive, T, until, inWall, hud, ctx, gs } = env;
    // ---- skatepark turf: chase starts ----
    const turf = ctx.map.objects.find(o => o.type === 'turf' && o.id === 'skatepark');
    drive.goal(T(turf.x + 2), T(turf.y + 2));
    intent.sprint = true;
    until(() => count('turf:enter') >= 1, 4200, () => { drive.tick(16, 9); inWall(); });
    intent.sprint = false;
    intent.move.x = intent.move.y = 0;
    assert('entered turf, level >= 1', ctx.chase.level >= 1, `level ${ctx.chase.level}`);
    assert('bullies spawn and chase', until(() => live('bullies') > 0 && ctx.chase.bullies.some(b => b.active && b.state === 'CHASE'), 600) >= 0, `bullies ${live('bullies')}`);
    assert('bully count within the Medium cap', live('bullies') <= ctx.quality.tier.maxBullies);
    step(180);
    assert('Medium never exceeds 3 bullies at level 2', live('bullies') <= 3 && ctx.chase.level <= 2, `level ${ctx.chase.level}, bullies ${live('bullies')}`);
    assert('HUD shows chase level', hud('anger').bars && ctx.chase.level >= 1);

    // ---- hide and escape (teleport: bullies are far, the hedge is the hiding spot) ----
    const hedge = ctx.map.objects.find(o => o.type === 'hiding' && o.id === 'hedge-park');
    h.teleport(gs, ctx, hedge.x + hedge.w / 2 | 0, hedge.y + hedge.h / 2 | 0);
    intent.sprint = false;
    intent.move.x = intent.move.y = 0;
    const hid = until(() => ctx.chase.level === 0, 900, () => { intent.move.x = intent.move.y = 0; });
    assert('hiding still in a hiding spot clears the chase', hid >= 0, `${hid} frames, hidden=${ctx.chase.hidden}`);
    const gone = until(() => live('bullies') === 0, 1500);
    assert('bullies walk away and return to the pool', gone >= 0, `${gone} frames, bullies ${live('bullies')}`);
    step(360); // lockout after a clear

    // ---- get caught and respawn ----
    h.teleport(gs, ctx, turf.x + 2, turf.y + 2);
    const caught = until(() => count('player:caught') >= 1, 4000, () => { intent.move.x = intent.move.y = 0; });
    assert('caught by a bully', caught >= 0, `${caught} frames`);
    assert('world frozen, money -1, frame shown', ctx.frozen && ctx.state.shared.money === 400 && hud('caught').frame.items.length > 0 && hud('caught').frame.items[0].visible, `money ${ctx.state.shared.money}`);
    assert('chase reset on catch', ctx.chase.level === 0 && live('bullies') === 0);
    const home = gs.caught.home;
    const resp = until(() => count('player:respawn') >= 1, 400);
    assert('respawned at home on foot', resp >= 0 && Math.hypot(player.x - home.x, player.y - home.y) < 24 && !ctx.frozen && player.vehicle === 'foot' && !gs.bikes.isMounted(0), `${resp} frames`);
    assert('caught frame hidden again', !hud('caught').frame.items[0].visible);
    step(30);
  }
};
