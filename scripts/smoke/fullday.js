// Smoke scenario: the full day (story 14.4), solo and co-op. Registered last in scripts/smoke/index.js. The real day clock runs a whole game
// day with the real day flow: morning, commute, school, afternoon, evening, bedtime, the new morning and the Zeugnis of the year, with whatever
// screens the flow raises answered like a kid would. It checks the order of the phases, that the clock, the wallet and the saves stay sane, that
// co-op does the same with two kids, and that nothing throws on the way.
export const fullDay = {
  name: 'fullDay',
  run(game, assert, env) {
    const { step } = env;
    const runDay = (label, expectedPlayers) => {
      const gs = game.scene.getScene('Game');
      const ctx = gs.ctx;
      const ui = game.scene.getScene('UI');
      ctx.input.update = () => {};
      const log = [];
      const names = ['phase:started', 'day:bedtime', 'day:morning', 'day:zeugnis', 'player:caught'];
      for (const n of names) ctx.events.on(n, e => log.push(`${n}:${e.phase ?? e.day ?? ''}`));
      assert(`${label}: the game has ${expectedPlayers} player(s)`, ctx.players.length === expectedPlayers, `${ctx.players.length}`);
      ctx.day.mode = 'story';
      ctx.state.dispatch('clock.set', { day: 1, minute: 390, phase: 'morning' });
      const money0 = ctx.state.shared.money;
      let guard = 0;
      let minuteBack = 0;
      let last = -1;
      while (!log.some(l => l.startsWith('day:morning')) && guard++ < 4000) {
        ctx.day.update(20);
        step(1);
        const top = ui.screens.top();
        if (top) { if (top.close) top.close(); else if (top.confirm) top.confirm(); }
        const c = ctx.state.shared.clock;
        const abs = c.day * 10000 + c.minute;
        if (abs < last && c.day === 1 && !log.some(l => l.startsWith('day:bedtime'))) minuteBack++;
        last = abs;
      }
      const phases = log.filter(l => l.startsWith('phase:started')).map(l => l.split(':')[2]);
      assert(`${label}: a whole day runs through the phases in order`, phases.slice(0, 4).join() === 'commute,school,afternoon,evening', phases.join());
      assert(`${label}: bedtime comes after the evening, then the next morning`, log.indexOf(log.find(l => l.startsWith('day:bedtime'))) > log.indexOf('phase:started:evening') && log.includes('day:morning:2'), log.join(' > '));
      assert(`${label}: the year ends with a Zeugnis before day 2`, log.some(l => l.startsWith('day:zeugnis')), log.join(' > '));
      assert(`${label}: the clock never ran backwards and the day is 2`, minuteBack === 0 && ctx.state.shared.clock.day === 2, `${minuteBack} ${ctx.state.shared.clock.day}`);
      assert(`${label}: the wallet is sane and nothing is frozen at the end`, Number.isInteger(ctx.state.shared.money) && ctx.state.shared.money >= 0 && !ui.screens.top() && !ctx.frozen, `${money0} -> ${ctx.state.shared.money}, ${ui.screens.top()?.id}`);
      assert(`${label}: every kid is in play`, ctx.players.every(p => p.alive && !p.pinned));
      return ctx;
    };
    const start = game.scene.getScene('Game');
    start.ctx.state.dispatch('coop.set', { on: false });
    start.scene.restart({});
    step(6);
    runDay('solo day', 1);

    // ---- co-op: the same day with two kids
    const prev = game.scene.getScene('Game');
    prev.ctx.state.dispatch('coop.set', { on: true });
    prev.scene.restart({});
    step(6);
    runDay('co-op day', 2);
    const gs = game.scene.getScene('Game');
    gs.ctx.state.dispatch('coop.set', { on: false });
  }
};
