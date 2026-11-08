// Smoke scenario: the five chase levels and the gang (story 7.1). Registered in scripts/smoke/index.js. Raises the level step by step,
// checks that each asks for its chasers within the quality cap, then puts the bullies around a player and checks that from level 3 they head for
// different intercept points. The chase is reset afterwards.
export const chaseLevels = {
  name: 'chaseLevels',
  run(game, assert, env) {
    const { step, ctx, player, live, gs } = env;
    const cap = ctx.quality.tier.maxBullies;
    const kinds = ctx.chase.cfg.level.spawnByLevel;
    ctx.chase.reset();
    step(2);
    for (const level of [1, 2, 3, 4, 5]) {
      ctx.chase.lvl.set(level, 'smoke');
      step(3);
      assert(`level ${level} has its chasers, within the cap of ${cap} (the boss joins on top at 5)`, live('bullies') === Math.min(cap, kinds[level].length) + (level >= 5 ? 1 : 0), `${live('bullies')} bullies`);
    }
    assert('the director knows five levels', ctx.chase.lvl.max === 5 && ctx.chase.level === 5);
    const out = ctx.chase.bullies.filter(b => b.active);
    const R = 60;
    out.forEach((b, i) => {
      const a = (i / out.length) * Math.PI * 2;
      gs.matter.body.setPosition(b.body, { x: player.x + Math.cos(a) * R, y: player.y + Math.sin(a) * R });
      b.alerted = false;
    });
    const seen = new Map(); // bully id -> the first intercept point it took that was not the target itself
    for (let i = 0; i < 40; i++) {
      step(1);
      for (const b of out) if (b.kind !== 'boss' && b.aimX !== undefined && !seen.has(b.id) && Math.hypot(b.aimX - player.x, b.aimY - player.y) > 5) seen.set(b.id, `${b.aimX.toFixed(0)},${b.aimY.toFixed(0)}`);
    }
    const aims = [...seen.values()];
    assert('from level 3 the bullies that see the player head for different points', aims.length >= Math.min(2, out.length - 1) && new Set(aims).size === aims.length, aims.join(' | '));
    ctx.chase.lvl.set(2, 'smoke');
    ctx.chase.reset();

    // ---- story 7.3: the boss
    ctx.chase.reset();
    step(5);
    ctx.chase.lvl.set(5, 'smoke');
    step(3);
    const bosses = ctx.chase.bullies.filter(b => b.active && b.kind === 'boss');
    assert('the boss joins at level 5, exactly one, on top of the cap', bosses.length === 1 && live('bullies') === Math.min(cap, kinds[5].length) + 1, `${bosses.length} ${live('bullies')}`);
    const boss = bosses[0];
    const other = ctx.chase.bullies.find(b => b.active && b.kind !== 'boss');
    assert('he is bigger and golden', boss.sprite.scaleX > other.sprite.scaleX && boss.sprite.isTinted && !other.sprite.isTinted);
    ctx.chase.lvl.set(4, 'smoke');
    ctx.chase.lvl.set(5, 'smoke');
    step(3);
    assert('a second joining does not bring a second boss', ctx.chase.bullies.filter(b => b.active && b.kind === 'boss').length === 1);
    other.sees = false;
    boss.sees = false;
    assert('trait: props and noises do not lure the boss, but lure the others', ctx.chase.fsm.distract(boss, boss.x + 20, boss.y, 400) === false && ctx.chase.fsm.distract(other, other.x + 20, other.y, 400) === true);
    const o = { duration: 1, step: 0.2, distance: 20 };
    ctx.chase.stumble(boss, boss.x - 10, boss.y, o, 'smoke');
    ctx.chase.stumble(other, other.x - 10, other.y, o, 'smoke');
    assert('trait: a stumble costs the boss less time than the others', Math.abs(boss.stumbleDuration - 0.4) < 1e-9 && other.stumbleDuration === 1, `${boss.stumbleDuration} vs ${other.stumbleDuration}`);
    ctx.chase.reset();
    step(5);
    assert('the boss goes away with the chase', live('bullies') === 0);

    // ---- story 7.2: e-scooters are faster than foot bullies, lookouts spot and expose
    const prof = game.cache.json.get('vehicles');
    const sp = k => prof[ctx.chase.cfg.kinds[k]].maxSpeed;
    assert('an e-scooter bully is faster than a bike bully and a foot bully', sp('scooter') > sp('bike') && sp('bike') > sp('foot'));
    ctx.chase.lvl.set(5, 'smoke');
    step(3);
    assert('level 5 brings e-scooter bullies when the quality tier has room for them', ctx.chase.bullies.filter(b => b.active && b.kind === 'scooter').length > 0 || cap < 3, ctx.chase.bullies.map(b => b.kind).join(','));
    ctx.chase.reset();
    step(5);
    const home = { x: player.x, y: player.y };
    const spots = [];
    ctx.events.on('lookout:spotted', e => spots.push(e));
    game.lookoutsOff = false;
    const lo = ctx.lookouts.spots[0];
    player.teleport(lo.x + 30, lo.y + 10);
    gs.snapCamera();
    step(2);
    assert('a player inside the radius is spotted: event, gang called, kids exposed', spots.length === 1 && spots[0].id === lo.id && ctx.chase.level >= 1 && ctx.chase.exposed > 0, `${spots.length} lvl ${ctx.chase.level} exp ${ctx.chase.exposed} alive ${player.alive} pinned ${player.pinned} rest ${lo.rest} en ${ctx.chase.lvl.enabled} off ${game.lookoutsOff} hid ${ctx.chase.perception.hiddenFor(player)} d ${Math.hypot(player.x - lo.x, player.y - lo.y).toFixed(0)} ${ctx.world.id} n ${ctx.lookouts.spots.length}`);
    step(30);
    assert('the same lookout rests before it spots again', spots.length === 1);
    assert('while exposed hiding does not count', ctx.chase.exposed > 0 && !ctx.chase.perception.hiddenFor(player));
    ctx.chase.reset();
    ctx.chase.exposed = 0;
    player.teleport(home.x, home.y);
    gs.snapCamera();
    step(5);
    lo.rest = 0;
    game.lookoutsOff = true;

    step(200);
    assert('the chase is reset and the bullies gone', ctx.chase.level === 0 && live('bullies') === 0, `${ctx.chase.level} ${live('bullies')}`);
  }
};
