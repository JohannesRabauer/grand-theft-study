// Smoke scenario: the quest runner (story 9.1). Registered in scripts/smoke/index.js. Puts state, screens and the player back.
export const quests = {
  name: 'quests',
  run(game, assert, env) {
    const { step, ctx, gs, ui, player } = env;
    const q = ctx.quests;
    const log = [];
    for (const n of ['mission:started', 'mission:step', 'mission:done', 'ui:toast']) ctx.events.on(n, e => log.push([n, e]));
    const count = (n, pred = () => true) => log.filter(e => e[0] === n && pred(e[1])).length;
    const top = () => ui.screens.top();
    const ts = ctx.map.tileSize;
    const data0 = ctx.state.data;
    const home0 = { x: player.x, y: player.y, vehicle: player.vehicle };
    const arrow = ui.hud.get('objective').arrow;
    const tap = () => { step(1); env.press('jump'); };
    const go = (tx, ty, dx = 0, dy = 0) => { player.teleport((tx + 0.5) * ts + dx, (ty + 0.5) * ts + dy); gs.snapCamera(); step(3); };
    for (const ride of gs.mountables) if (ride.isMounted(0)) ride.dismount(player);
    const booth = q.boothsHere()[0];

    // ---- the phone booth starts the mission
    player.teleport(booth.x, booth.y + 22);
    gs.snapCamera();
    step(3);
    assert('standing at the phone booth on foot shows the prompt', !!q.boothNear(player) && q.labels[0].visible);
    env.press('interact');
    assert('interact makes the call: the mission starts, a message waits to be read and the world is frozen', count('mission:started', e => e.id === 'parcel') === 1 && top()?.id === 'message' && ctx.frozen && ctx.state.shared.quests.active[0].id === 'parcel');
    step(2);
    assert('the message needs a fresh press, a held key cannot close it', top()?.id === 'message');
    tap();
    assert('a fresh press closes it and the world runs again', !top() && !ctx.frozen);
    assert('the objective arrow points at the first step and the mission line shows it', arrow.quest?.id === 'parcel' && Math.abs(arrow.gx - (36.5 * ts)) < 1 && arrow.questLine.visible && arrow.questLine.text.length > 5, arrow.questLine.text);

    // ---- steps by reaching places
    go(36, 87);
    assert('reaching the bakery front completes step one and says what is next', ctx.state.shared.quests.active[0].step === 1 && count('mission:step', e => e.step === 1) === 1 && count('ui:toast', e => e.key === 'quest.next') === 1);
    assert('the arrow moves on to the park', Math.abs(arrow.gx - 50.5 * ts) < 1 && Math.abs(arrow.gy - 37.5 * ts) < 1);
    const money0 = ctx.state.shared.money;
    const xp0 = ctx.state.players.map(p => p.xp);
    const help0 = ctx.state.players[0].kopfnoten.hilfsbereitschaft;
    go(50, 37);
    assert('the last step finishes the mission and pays the reward', count('mission:done', e => e.id === 'parcel' && e.kind === 'help') === 1 && ctx.state.shared.money === money0 + 300 && ctx.state.players.every((p, i) => p.xp === xp0[i] + 15) && ctx.state.shared.quests.done.includes('parcel') && ctx.state.shared.quests.active.length === 0, `${money0} -> ${ctx.state.shared.money}`);
    assert('a message tells about it', top()?.id === 'message');
    assert('helping raises the Hilfsbereitschaft Kopfnote', ctx.state.players[0].kopfnoten.hilfsbereitschaft > help0, `${help0} -> ${ctx.state.players[0].kopfnoten.hilfsbereitschaft}`);
    tap();
    step(2);
    assert('the arrow goes back to the school goal when no mission is open', !arrow.quest && !arrow.questLine.visible);

    // ---- nothing left to ask for
    player.teleport(booth.x, booth.y + 22);
    gs.snapCamera();
    step(3);
    env.press('interact');
    assert('with every mission done nobody picks up, kindly, and nothing opens', !top() && count('ui:toast', e => e.key === 'quest.noCall') === 1 && count('mission:started') === 1);

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
    assert('the quest scenario leaves the world running and no mission open', !ctx.frozen && ctx.state.shared.quests.active.length === 0 && !arrow.quest);
  }
};
