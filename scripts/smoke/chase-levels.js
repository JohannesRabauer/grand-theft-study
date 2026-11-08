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
      assert(`level ${level} has its chasers, within the cap of ${cap}`, live('bullies') === Math.min(cap, kinds[level].length), `${live('bullies')} bullies`);
    }
    assert('the director knows five levels', ctx.chase.lvl.max === 5 && ctx.chase.level === 5);
    const out = ctx.chase.bullies.filter(b => b.active);
    const R = 60;
    out.forEach((b, i) => {
      const a = (i / out.length) * Math.PI * 2;
      gs.matter.body.setPosition(b.body, { x: player.x + Math.cos(a) * R, y: player.y + Math.sin(a) * R });
      b.alerted = false;
    });
    step(45);
    const aims = out.filter(b => b.aimX !== undefined).map(b => `${b.aimX.toFixed(0)},${b.aimY.toFixed(0)}`);
    assert('from level 3 the bullies that see the player head for different points', aims.length >= Math.min(2, out.length) && new Set(aims).size === aims.length, aims.join(' | '));
    ctx.chase.lvl.set(2, 'smoke');
    ctx.chase.reset();
    step(200);
    assert('the chase is reset and the bullies gone', ctx.chase.level === 0 && live('bullies') === 0, `${ctx.chase.level} ${live('bullies')}`);
  }
};
