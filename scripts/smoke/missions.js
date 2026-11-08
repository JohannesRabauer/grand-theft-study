// Smoke scenario: the missions of story 9.7 (grandma's eggs, the stolen bike, the lost homework) on the quest runner.
// Registered in scripts/smoke/index.js. Puts state, screens and the player back.
export const missions = {
  name: 'missions',
  run(game, assert, env) {
    const { step, ctx, gs, ui, player } = env;
    const q = ctx.quests;
    const log = [];
    for (const n of ['mission:started', 'mission:step', 'mission:done', 'mission:failed', 'ui:toast', 'homework:done']) ctx.events.on(n, e => log.push([n, e]));
    const count = (n, pred = () => true) => log.filter(e => e[0] === n && pred(e[1])).length;
    const top = () => ui.screens.top();
    const ts = ctx.map.tileSize;
    const data0 = ctx.state.data;
    const home0 = { x: player.x, y: player.y, vehicle: player.vehicle };
    const arrow = ui.hud.get('objective').arrow;
    const tap = () => { step(1); env.press('jump'); };
    const go = (tx, ty) => { player.teleport((tx + 0.5) * ts, (ty + 0.5) * ts); gs.snapCamera(); step(3); };
    const active = id => ctx.state.shared.quests.active.find(e => e.id === id);
    const reset = (patch = {}) => { ui.screens.clear(); ctx.state.replace({ ...ctx.state.data, shared: { ...ctx.state.shared, quests: { active: [], done: [] }, ...patch } }); step(2); };
    for (const ride of gs.mountables) if (ride.isMounted(0)) ride.dismount(player);
    reset();

    // ---- grandma: the eggs break, the mission fails kindly and can be played again
    q.start('grandma');
    tap();
    assert('the call starts the mission with three eggs of lives', !!active('grandma') && active('grandma').lives === 3 && count('mission:started', e => e.id === 'grandma') === 1);
    q.onEvent('traffic:hit', { player: 0 }); // straight to the runner: the real event would also upset the chase
    assert('before the groceries are picked up nothing can break', active('grandma').lives === 3);
    go(36, 87);
    assert('the groceries are picked up: next, grandma', active('grandma').step === 1 && arrow.quest?.id === 'grandma');
    q.onEvent('traffic:hit', { player: 0 }); // straight to the runner: the real event would also upset the chase
    assert('a bump costs an egg and a toast says how many are left', active('grandma').lives === 2 && count('ui:toast', e => e.key === 'mission.grandma.hit' && e.params.n === 2) === 1);
    q.onEvent('player:caught', { player: 0 }); // straight to the runner: the real event would also upset the chase
    q.onEvent('bully:bump', {}); // straight to the runner: the real event would also upset the chase
    assert('with no eggs left the mission fails, kindly, and is not done', !active('grandma') && count('mission:failed', e => e.id === 'grandma') === 1 && !ctx.state.shared.quests.done.includes('grandma') && top()?.id === 'message');
    tap();
    go(10, 51); // away from the pick-up, so the new run starts at its first step
    q.start('grandma');
    tap();
    assert('it can be started again with fresh eggs', active('grandma')?.lives === 3 && active('grandma').step === 0, JSON.stringify(ctx.state.shared.quests));
    go(36, 87);
    const money0 = ctx.state.shared.money;
    go(14, 12);
    assert('delivering the groceries pays the reward', count('mission:done', e => e.id === 'grandma' && e.kind === 'help') === 1 && ctx.state.shared.money === money0 + 500 && ctx.state.shared.quests.done.includes('grandma'), `${money0} -> ${ctx.state.shared.money}`);
    tap();

    // ---- the stolen bike: the theft starts it, the arrow follows the hideout, recovering it ends it
    reset();
    const hx = 20;
    const hy = 21;
    ctx.state.dispatch('flags.set', { key: 'stolenBike', value: { hideout: 'smoke', x: (hx + 0.5) * ts, y: (hy + 0.5) * ts, bikeId: 'bike1', map: ctx.world.id } });
    ctx.events.emit('mission:trigger', { id: 'stolen-bike' });
    assert('the theft starts the rescue by itself with a phone toast and without freezing the world', !!active('stolen-bike') && count('mission:started', e => e.id === 'stolen-bike') === 1 && !top() && !ctx.frozen && count('ui:toast', e => e.key === 'mission.stolen-bike.intro' && e.style === 'phone') === 1);
    assert('the arrow follows the hideout', arrow.quest?.id === 'stolen-bike' && Math.abs(arrow.gx - (hx + 0.5) * ts) < 1 && Math.abs(arrow.gy - (hy + 0.5) * ts) < 1);
    const m1 = ctx.state.shared.money;
    ctx.events.emit('bike:recovered', { player: 0, bikeId: 'bike1', hideoutId: 'smoke' });
    assert('getting the bike back ends the mission with its reward and a phone toast, again without a screen', count('mission:done', e => e.id === 'stolen-bike') === 1 && ctx.state.shared.money === m1 + 100 && !active('stolen-bike') && !top() && !ctx.frozen && count('ui:toast', e => e.key === 'mission.stolen-bike.done' && e.style === 'phone') === 1);
    step(1);
    ctx.state.dispatch('flags.set', { key: 'stolenBike', value: null });

    // ---- the lost homework: search with the stick, bring it to school
    reset();
    const ordnung0 = ctx.state.players[0].kopfnoten.ordnung;
    q.start('lost-homework');
    tap();
    assert('the hunt starts at the search step', active('lost-homework')?.step === 0 && arrow.quest?.id === 'lost-homework');
    ctx.events.emit('homework:found', { player: 0 });
    assert('finding the homework moves on to school', active('lost-homework').step === 1);
    go(78, 13);
    assert('handing it in finishes the mission and raises Ordnung', count('mission:done', e => e.id === 'lost-homework') === 1 && count('homework:done') === 1 && ctx.state.players[0].kopfnoten.ordnung > ordnung0, `${ordnung0} -> ${ctx.state.players[0].kopfnoten.ordnung}`);
    tap();
    go(10, 51);
    reset({ flags: { ...ctx.state.shared.flags, lostHomeworkFound: true } });
    q.start('lost-homework');
    tap();
    assert('when the homework was found earlier the hunt starts at the hand-in', active('lost-homework')?.step === 1, JSON.stringify([ctx.state.shared.quests, ctx.state.shared.flags.lostHomeworkFound]));

    // ---- put everything back
    ui.screens.clear();
    ctx.state.replace(data0);
    ctx.events.emit('state:changed', { path: 'shared.quests', action: 'smoke' });
    player.teleport(home0.x, home0.y);
    if (home0.vehicle === 'bike') gs.bikes.giveBike(player);
    else if (home0.vehicle === 'skateboard') gs.skateboards.giveBoard(player);
    else if (home0.vehicle === 'skates') gs.skates.giveBoard(player);
    gs.snapCamera();
    step(3);
    assert('the missions scenario leaves the world running and nothing open', !ctx.frozen && ctx.state.shared.quests.active.length === 0 && !arrow.quest);
  }
};
