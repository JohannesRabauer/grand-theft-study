// Smoke scenario: Charme talk-down and question back-off (story 7.5). Registered in scripts/smoke/index.js. Drives the real catch (Caught.trigger)
// at the low levels: a Charme success ends the chase, a failed check opens a question (right: he backs off; wrong: gentle, nobody caught, the
// touch is swallowed for the grace) and from level 3 the catch is as before. The saved state and the player are put back.
export const talk = {
  name: 'talk',
  run(game, assert, env) {
    const { step, ctx, ui, player, gs } = env;
    const data0 = ctx.state.data;
    const home = { x: player.x, y: player.y };
    const top = () => ui.screens.top();
    const log = [];
    ctx.events.on('talkdown:result', e => log.push(e));
    game.talkOff = false;
    const td = ctx.talkdown;
    ctx.chase.reset();
    step(5);
    const answer = right => {
      const s = top();
      const good = s.view.answers.findIndex((a, i) => ctx.learning.isCorrect(s.q, i));
      const bad = s.view.answers.findIndex((a, i) => !ctx.learning.isCorrect(s.q, i));
      s.sel = right ? good : bad;
      s.confirm();
      s.confirm();
    };
    const money0 = ctx.state.shared.money;

    // ---- level 1, a good Charme roll: talked down
    ctx.chase.lvl.set(1, 'smoke');
    step(3);
    td.rng = () => 0;
    gs.caught.trigger(0);
    assert('a successful Charme check ends the chase and catches nobody', log.length === 1 && log[0].how === 'charm' && log[0].ok && ctx.chase.level === 0 && !player.pinned && player.alive && ctx.state.shared.money === money0, JSON.stringify(log));
    step(3);

    // ---- level 1, a failed check: a question, answered right
    td.grace = 0;
    ctx.chase.lvl.lockout = 0;
    ctx.chase.lvl.set(1, 'smoke');
    step(3);
    td.rng = () => 0.999;
    gs.caught.trigger(0);
    step(2);
    assert('a failed check opens a one-question talk and freezes the world', top()?.id === 'activity' && top().activity === 'talk' && top().total === 1 && ctx.frozen && !player.pinned, top()?.id);
    answer(true);
    step(2);
    assert('a right answer makes him back off: chase over, nobody caught', log.length === 2 && log[1].how === 'question' && log[1].ok && ctx.chase.level === 0 && !player.pinned, JSON.stringify(log[1]));
    top()?.confirm();
    step(3);

    // ---- level 2, a wrong answer: gentle
    td.grace = 0;
    ctx.chase.lvl.lockout = 0;
    ctx.chase.lvl.set(2, 'smoke');
    step(3);
    gs.caught.trigger(0);
    step(2);
    answer(false);
    step(2);
    top()?.confirm();
    step(2);
    assert('a wrong answer is gentle: not caught, the chase goes on, a grace starts', log.length === 3 && log[2].how === 'gentle' && !log[2].ok && !player.pinned && player.alive && ctx.chase.level === 2 && td.grace > 0, JSON.stringify(log[2]));
    gs.caught.trigger(0);
    assert('a touch in the grace is swallowed: no new question, no catch', !top() && !player.pinned && player.alive);
    step(60 * 4);
    assert('the grace runs out while the world runs', td.grace <= 0);

    // ---- level 3: the catch is as before
    ctx.chase.lvl.set(3, 'smoke');
    step(3);
    gs.caught.trigger(0);
    assert('from level 3 a touch catches as before', player.pinned && !player.alive && !top(), `${player.pinned}`);
    gs.caught.respawn(0);
    step(3);

    game.talkOff = true;
    td.rng = Math.random;
    td.grace = 0;
    ctx.chase.reset();
    ctx.state.replace(data0);
    player.teleport(home.x, home.y);
    gs.snapCamera();
    step(5);
    assert('the talk scenario leaves the world as it was', !ctx.frozen && player.alive && !player.pinned && !top());
  }
};
