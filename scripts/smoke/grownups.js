// Smoke scenario: the other chasers (story 7.4). Registered in scripts/smoke/index.js. The Hausmeister, the ticket inspector and the neighbor
// dog start from their causes, can be escaped, are harmless in the end and calm down; the saved state and the player are put back.
export const grownups = {
  name: 'grownups',
  run(game, assert, env) {
    const { step, ctx, player, gs } = env;
    const data0 = ctx.state.data;
    const home = { x: player.x, y: player.y };
    const log = [];
    for (const n of ['grownup:started', 'grownup:caught', 'grownup:calmed']) ctx.events.on(n, e => log.push([n, e]));
    const count = (n, kind) => log.filter(e => e[0] === n && (!kind || e[1].kind === kind)).length;
    game.grownupsOff = false;
    ctx.chase.reset();
    ctx.state.dispatch('wallet.earn', { cents: 500, reason: 'smoke' });
    const gr = ctx.grownups;
    const hiddenFor = ctx.chase.perception.hiddenFor.bind(ctx.chase.perception);

    // ---- the janitor: started, catches, scolds, calms down
    assert('the janitor is not there before his cause', !gr.chaser('janitor'));
    gr.start('janitor', { id: 'schoolyard-back' });
    step(2);
    const j = gr.chaser('janitor');
    assert('the janitor starts from his cause', !!j && count('grownup:started', 'janitor') === 1 && gr.active.get('janitor').gfx.visible);
    gr.start('janitor', {});
    assert('there is only one janitor at a time', gr.active.size === 1 && count('grownup:started', 'janitor') === 1);
    j.x = player.x + 30;
    j.y = player.y;
    const money0 = ctx.state.shared.money;
    step(60);
    assert('he catches a kid who stands still, takes a little money and scolds', count('grownup:caught', 'janitor') === 1 && ctx.state.shared.money === money0 - 50 && !player.pinned, `${money0} -> ${ctx.state.shared.money}`);
    step(60 * 4);
    assert('afterwards he calms down and is gone', count('grownup:calmed', 'janitor') === 1 && !gr.chaser('janitor'));
    gr.start('janitor', {});
    assert('and rests before he comes again', !gr.chaser('janitor') && gr.rest.janitor > 0);

    // ---- the inspector: escaped by hiding, nobody caught
    ctx.events.emit('tram:inspector', { player: 0, fine: 0 });
    step(2);
    const ins = gr.chaser('inspector');
    assert('the inspector boards after a black ride', !!ins && count('grownup:started', 'inspector') === 1);
    ctx.chase.perception.hiddenFor = () => true;
    ins.x = player.x + 250;
    ins.y = player.y;
    step(60 * 3);
    assert('a hiding kid is escaped: he gives up without catching anyone', ins.state === 'GIVE_UP' && count('grownup:caught', 'inspector') === 0, ins.state);
    step(60 * 4);
    ctx.chase.perception.hiddenFor = hiddenFor;
    assert('and he calms down', count('grownup:calmed', 'inspector') === 1 && !gr.chaser('inspector'));

    // ---- the neighbor dog: joins when the neighbor storms out, trots after the kids, calms down
    ctx.events.emit('neighbor:alert', { houseId: 'smoke', player: 0, x: player.x + 60, y: player.y });
    step(2);
    const dog = ctx.dogs.list.find(d => d.active && d.angry);
    assert('the neighbor dog joins the chase', !!dog && dog.state === 'CHASE' && count('grownup:started', 'dog') === 1);
    step(60 * 13);
    assert('the dog calms down after a while and never hurt anyone', dog.state === 'CALM' && count('grownup:calmed', 'dog') === 1 && !player.pinned);
    dog.deactivate();

    game.grownupsOff = true;
    gr.rest.janitor = gr.rest.inspector = gr.rest.dog = 0;
    ctx.state.replace(data0);
    player.teleport(home.x, home.y);
    gs.snapCamera();
    step(3);
    assert('the grownups scenario leaves the world as it was', !gr.active.size && !ctx.frozen);
  }
};
