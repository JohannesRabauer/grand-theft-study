// Smoke scenarios: players. Each export is { name, run(game, assert, env) }; registered in scripts/smoke/index.js.
// AD-18: per-player intents, bikes, camera, bully targeting, hiding
export const twoPlayers = {
  name: 'twoPlayers',
  run(game, assert, env) {
    const { h, step, intent, events, count, pools, player, ctx, gs } = env;
    // ---- two players (AD-18): each intent moves only its own player, bullies pick the nearer one ----
    const p1 = ctx.players[0];
    assert('one player by default, intent aliases intents[0]', ctx.players.length === 1 && ctx.input.intent === ctx.input.intents[0] && p1.index === 0);
    h.teleport(gs, ctx, 7, 51);
    step(30);
    const p2 = game.addPlayer();
    const place = (p, x, y) => { gs.matter.body.setPosition(p.body, { x, y }); gs.matter.body.setVelocity(p.body, { x: 0, y: 0 }); p.move.speed = 0; p.move.vel.x = p.move.vel.y = 0; p.sprite.setPosition(x, y); };
    const [i1, i2] = ctx.input.intents;
    assert('addPlayer creates player 2 at player 1 with its own intent, belt and pools', ctx.players.length === 2 && p2.index === 1 && i1 !== i2 && Math.hypot(p2.x - p1.x, p2.y - p1.y) < 1 && p2.toolbelt !== p1.toolbelt && !!ctx.pools.byName.get('projectiles.1') && game.addPlayer() === null);
    step(30);
    const bx = p1.x;
    const by = p1.y;
    i2.move.x = 1;
    step(40);
    i2.move.x = 0;
    assert('intent 2 moves only player 2', p2.x - bx > 8 && Math.abs(p1.x - bx) < 0.5 && Math.abs(p1.y - by) < 0.5, `p2 +${(p2.x - bx).toFixed(1)}, p1 ${(p1.x - bx).toFixed(2)}`);
    step(60);
    const q2x = p2.x;
    i1.move.y = 1;
    step(40);
    i1.move.y = 0;
    assert('intent 1 moves only player 1', p1.y - by > 8 && Math.abs(p2.x - q2x) < 0.5, `p1 +${(p1.y - by).toFixed(1)}, p2 dx ${(p2.x - q2x).toFixed(2)}`);
    const parked = gs.bikes.parked.find(b => b.visible);
    place(p2, parked.x, parked.y);
    const bells = count('bike:bell');
    i2.interact = true;
    step(1);
    i2.interact = false;
    i2.jump = true;
    step(1);
    i2.jump = false;
    const bell = events.filter(e => e[0] === 'bike:bell').pop();
    assert('player 2 mounts a bike and rings the bell; player 1 stays on foot', p2.vehicle === 'bike' && gs.bikes.isMounted(1) && !gs.bikes.isMounted(0) && p1.vehicle === 'foot' && count('bike:bell') === bells + 1 && bell[1].player === 1, `${p2.vehicle}/${p1.vehicle}`);
    i2.interact = true;
    step(1);
    i2.interact = false;
    assert('and dismounts again', p2.vehicle === 'foot' && !gs.bikes.isMounted(1));
    assert('the camera follows the centre of both players', Math.abs(gs.focus.x - (p1.x + p2.x) / 2) < 1e-6 && Math.abs(gs.focus.y - (p1.y + p2.y) / 2) < 1e-6);
    // bully target: the nearer visible player
    place(p1, 460, 824);
    place(p2, 410, 824);
    const bully = ctx.chase.pool.get('foot', ctx.chase.cfg.kinds.foot, 350, 824);
    bully.alerted = false;
    ctx.chase.fsm.enter(bully, 'CHASE');
    step(2);
    const clear = ctx.chase.nav.lineClear(350, 824, 460, 824);
    assert('a bully targets the nearer player (player 2)', bully.target === p2 && bully.sees, `los ${clear}, target ${bully.target?.index}`);
    place(p2, 470, 824);
    place(p1, 410, 824);
    gs.matter.body.setPosition(bully.body, { x: 350, y: 824 });
    step(2);
    assert('and switches to player 1 when that one is nearer', bully.target === p1, `target ${bully.target?.index}`);
    // per player hiding: only the one in the hedge is hidden
    const hedge2 = ctx.map.objects.find(o => o.type === 'hiding' && o.id === 'hedge-park');
    ctx.chase.reset();
    place(p1, 700, 500);
    place(p2, (hedge2.x + 1) * 16, (hedge2.y + 1) * 16);
    step(60);
    const hideEv = events.filter(e => e[0] === 'hide:enter').pop();
    assert('hiding is per player', hideEv?.[1].player === 1 && ctx.chase.hiddenFor(p2) && !ctx.chase.hiddenFor(p1) && !ctx.chase.hidden && ctx.zones.hiding[0] === 0 && ctx.zones.hiding[1] === 1, `hide:enter player ${hideEv?.[1].player}`);
    place(p2, 700, 540);
    step(10);
    ctx.chase.reset();
  }
};
