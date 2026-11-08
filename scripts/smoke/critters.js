// Smoke scenario: pigeons, cats and ducks (story 12.5). Registered in scripts/smoke/index.js. A kid walking up to a pigeon scatters it, it
// flies away and comes back; a cat on its fence runs off; ducks gather when fed; a slingshot-style hit cannot touch them (no body). The kid
// is put back.
export const critters = {
  name: 'critters',
  run(game, assert, env) {
    const { step, ctx, gs, player } = env;
    const cr = ctx.critters;
    if (ctx.map.indoor || !cr.list.length) { assert('the critters scenario starts in the town', false); return; }
    const home = { x: player.x, y: player.y };
    const log = [];
    for (const n of ['critter:scatter', 'critter:back', 'duck:fed']) ctx.events.on(n, e => log.push([n, e]));
    const count = n => log.filter(e => e[0] === n).length;
    assert('the town has pigeons, cats and ducks, drawn as images', ['pigeon', 'cat', 'duck'].every(k => cr.list.some(c => c.kind === k)) && cr.sprites.length === cr.list.length);
    assert('and none of them has a physics body', cr.list.every(c => c.body == null) && cr.sprites.every(s => s.body == null));

    const pigeon = cr.list.find(c => c.kind === 'pigeon');
    const sprite = cr.sprites[cr.list.indexOf(pigeon)];
    player.teleport(pigeon.homeX + 90, pigeon.homeY);
    gs.snapCamera();
    step(10);
    assert('a pigeon pecks while nobody is near', pigeon.state === 'IDLE' && count('critter:scatter') === 0);
    player.teleport(pigeon.homeX + 20, pigeon.homeY);
    step(5);
    assert('it scatters when a kid comes close', pigeon.state === 'FLEE' && count('critter:scatter') >= 1);
    step(40);
    assert('it flies up and away', pigeon.lift > 0 && (Math.abs(pigeon.x - pigeon.homeX) > 5 || Math.abs(pigeon.y - pigeon.homeY) > 5) && sprite.y < pigeon.y);
    player.teleport(pigeon.homeX + 300, pigeon.homeY + 300);
    gs.snapCamera();
    step(60 * 12);
    assert('after a while it is back at its spot', pigeon.state === 'IDLE' && count('critter:back') >= 1 && pigeon.x === pigeon.homeX && sprite.visible);

    const cat = cr.list.find(c => c.kind === 'cat');
    player.teleport(cat.homeX + 15, cat.homeY + 8);
    gs.snapCamera();
    step(5);
    assert('a cat on the fence runs off when someone comes near', cat.state === 'FLEE' && cat.lift === 0);
    player.teleport(cat.homeX + 400, cat.homeY + 400);
    gs.snapCamera();
    step(60 * 15);
    assert('and returns to the fence', cat.state === 'IDLE');

    const duck = cr.list.find(c => c.kind === 'duck');
    player.teleport(duck.homeX + 22, duck.homeY);
    gs.snapCamera();
    step(5);
    assert('ducks ignore a kid who just walks by', duck.state === 'IDLE' && count('critter:scatter') === 1 + (count('critter:scatter') - 1));
    ctx.input.intents[0].interact = true;
    step(2);
    ctx.input.intents[0].interact = false;
    step(2);
    assert('interact near the pond feeds the ducks: they gather, hearts and a message', count('duck:fed') === 1 && cr.list.filter(c => c.kind === 'duck' && c.state === 'FEED').length >= 1);
    step(60 * 4);
    assert('and they swim off again', cr.list.filter(c => c.kind === 'duck').every(c => c.state === 'IDLE'));
    cr.feedRest = 0;

    player.teleport(home.x, home.y);
    gs.snapCamera();
    step(5);
  }
};
