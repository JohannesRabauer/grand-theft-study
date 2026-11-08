// Smoke scenario: the Pfand machine and the bakery counter (story 9.2). Registered in scripts/smoke/index.js. Plays both through the real
// screens, checks that every answer lands in the learning stats, that pocket money and xp are paid, that the daily limit holds, and
// puts the saved state and the player back afterwards.
export const activities = {
  name: 'activities',
  run(game, assert, env) {
    const { step, ctx, gs, ui, player } = env;
    const top = () => ui.screens.top();
    const ts = ctx.map.tileSize;
    const data0 = ctx.state.data;
    const home0 = { x: player.x, y: player.y, vehicle: player.vehicle };
    const done = [];
    ctx.events.on('activity:done', e => done.push(e));
    for (const ride of gs.mountables) if (ride.isMounted(0)) ride.dismount(player);
    const n = topic => ctx.learning.stats(0, topic).n ?? 0;
    // answers the open activity: right answers for the first `right` questions, a wrong one afterwards
    const play = right => {
      for (let guard = 0; guard < 40 && top()?.id === 'activity' && top().phase !== 'done'; guard++) {
        const s = top();
        if (s.phase === 'choose') { s.sel = s.sel; s.confirm(); continue; }
        if (s.phase === 'ask') {
          const good = s.view.answers.findIndex((a, i) => ctx.learning.isCorrect(s.q, i));
          const bad = s.view.answers.findIndex((a, i) => !ctx.learning.isCorrect(s.q, i));
          s.sel = s.answered < right ? good : bad;
          s.confirm();
        } else s.confirm();
      }
    };

    // ---- the Pfand machine
    const m = ctx.activities.machine();
    player.teleport((m.x + 0.5) * ts, (m.y + 0.5) * ts + 8);
    gs.snapCamera();
    step(3);
    assert('standing at the Pfand machine shows its prompt', ctx.activities.labels[0].visible && ctx.activities.labels[0].text.length > 4, ctx.activities.labels[0].text);
    const money0 = ctx.state.shared.money;
    const xp0 = ctx.state.players[0].xp;
    const mathe0 = n('mathe');
    env.press('interact');
    step(2);
    assert('interact opens the activity and freezes the world', top()?.id === 'activity' && ctx.frozen && top().total === 4, top()?.id);
    play(4);
    assert('four right answers end the run with its reward screen', top()?.phase === 'done' && top().correct === 4 && done.length === 1, top()?.phase);
    assert('the answers were recorded in the learning stats', n('mathe') === mathe0 + 4, `${n('mathe')} vs ${mathe0}`);
    assert('everything right pays 1.50 and 16 xp', ctx.state.shared.money === money0 + 150 && done[0].cents === 150 && done[0].xp === 16 && ctx.state.players[0].xp >= xp0, `${ctx.state.shared.money - money0}`);
    top().confirm();
    step(2);
    assert('closing it unfreezes the world', !top() && !ctx.frozen);

    // ---- the daily limit: two runs a day
    env.press('interact');
    step(2);
    play(0);
    assert('a second run with no right answer pays nothing', done.length === 2 && done[1].cents === 0);
    top().confirm();
    step(2);
    env.press('interact');
    step(2);
    assert('a third run the same day is refused with a toast and nothing opens', !top() && !ctx.frozen);

    // ---- the bakery counter: order in English
    const bakery = ctx.map.objects.find(o => o.id === 'market-bakery');
    player.teleport((bakery.x + bakery.w / 2) * ts, (bakery.y + bakery.h) * ts + 6);
    gs.snapCamera();
    step(3);
    env.press('interact');
    step(2);
    step(2);
    const shop = top();
    assert('the bakery shop lists the counter first, as practice', shop?.id === 'shop' && shop.items[0].type === 'activity', shop?.id);
    shop.sel = 0;
    shop.retext();
    step(1);
    env.press('jump');
    step(2);
    const screen = top();
    assert('choosing it opens the language choice', screen?.id === 'activity' && screen.phase === 'choose');
    screen.sel = 1;
    const eng0 = n('englisch');
    const money1 = ctx.state.shared.money;
    play(6);
    assert('ordering in English asks vocabulary and then money questions', done.length === 3 && done[2].variant === 'en' && n('englisch') === eng0 + 3);
    assert('English pays 2.40 for a perfect run', ctx.state.shared.money === money1 + 240 && done[2].cents === 240, `${ctx.state.shared.money - money1}`);
    ui.screens.clear();
    step(2);

    // ---- put everything back
    ctx.state.replace(data0);
    player.teleport(home0.x, home0.y);
    if (home0.vehicle === 'bike') gs.bikes.giveBike(player);
    else if (home0.vehicle === 'skateboard') gs.skateboards.giveBoard(player);
    else if (home0.vehicle === 'skates') gs.skates.giveBoard(player);
    gs.snapCamera();
    step(3);
    assert('the activities scenario leaves the world running and the player where they were', !ctx.frozen && !top() && player.vehicle === home0.vehicle);
  }
};
