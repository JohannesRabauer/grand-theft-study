// Smoke scenario: XP and levels (story 10.2). Registered in scripts/smoke/index.js. Awards XP through the events of the data
// table, crosses a level and checks the celebration and the attribute growth; the saved state is put back afterwards.
export const progress = {
  name: 'progress',
  run(game, assert, env) {
    const { step, ctx, ui } = env;
    const log = [];
    for (const n of ['level:up', 'attr:up', 'ui:toast']) ctx.events.on(n, e => log.push([n, e]));
    const count = (n, pred = () => true) => log.filter(e => e[0] === n && pred(e[1])).length;
    const data0 = ctx.state.data;
    const p = () => ctx.state.players[0];
    const per = ctx.state.cfg.xpPerLevel;

    const xp0 = p().xp;
    ctx.events.emit('commute:ontime', { player: 0 });
    assert('an activity event pays its xp from the table', p().xp === xp0 + 5, `${xp0} -> ${p().xp}`);
    ctx.events.emit('zeugnis:done', { player: 0, promoted: true });
    assert('the report card pays more for a promotion', p().xp === xp0 + 55);

    // get 3 xp short of the next level, then earn 5
    const level = p().level;
    ctx.state.dispatch('xp.add', { player: 0, amount: level * per - p().xp - 3 });
    assert('just below the next level nothing is celebrated yet', p().level === level && count('level:up') === 0);
    const aus0 = p().attributes.ausdauer;
    ctx.events.emit('commute:ontime', { player: 0 });
    step(2);
    assert('crossing the level announces it once, with a toast naming the kid', p().level === level + 1 && count('level:up', e => e.player === 0 && e.level === level + 1) === 1 && count('ui:toast', e => e.key === 'xp.levelUp' && e.params.level === level + 1) === 1);
    assert('a level-up grows stamina', p().attributes.ausdauer > aus0, `${aus0} -> ${p().attributes.ausdauer}`);
    ctx.events.emit('commute:ontime', { player: 0 });
    assert('more xp inside the level is no new celebration', count('level:up') === 1);

    // loading a save never celebrates
    ctx.state.replace({ ...ctx.state.data, players: ctx.state.players.map(q => ({ ...q, xp: q.xp + per, level: q.level + 1 })) });
    ctx.events.emit('commute:ontime', { player: 0 });
    assert('a loaded higher level is not announced', count('level:up') === 1);

    ctx.state.replace(data0);
    for (const pl of ctx.players) ctx.characters.refresh(pl); // the speed modifiers follow the restored attributes (a replace does not refresh them)
    step(2);
    assert('the progress scenario leaves the world running', !ctx.frozen && !ui.screens.top());
  }
};
