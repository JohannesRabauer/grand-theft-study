// Smoke scenario: parent settings (story 11.4). Registered in scripts/smoke/index.js. Goes through the gate (wrong answer, lockout, right
// answer), changes every setting through the real menu rows and checks that it takes effect and is saved; everything is put back afterwards.
export const parent = {
  name: 'parent',
  run(game, assert, env) {
    const { step, ctx, ui } = env;
    const data0 = ctx.state.data;
    const top = () => ui.screens.top();
    const flags = () => ctx.state.shared.flags;
    const events = [];
    for (const n of ['parent:reminder', 'parent:setting', 'parent:gate-failed']) ctx.events.on(n, e => events.push([n, e]));
    const count = n => events.filter(e => e[0] === n).length;

    ctx.openParent();
    step(2);
    const gate = top();
    assert('the parent entry opens a gate with a sum and four answers, frozen', gate?.id === 'parentGate' && ctx.frozen && gate.options.length === 4 && gate.question.text.includes('x'), gate?.id);
    gate.sel = (gate.gate.question.correct + 1) % 4;
    gate.choose();
    assert('a wrong answer keeps the gate shut, says so and starts a lockout', top()?.id === 'parentGate' && gate.gate.locked(gate.now()) && gate.status.text.length > 5 && count('parent:gate-failed') === 1, gate.status.text);
    gate.sel = gate.gate.question.correct;
    gate.choose();
    assert('the right answer during the lockout does not open it', top()?.id === 'parentGate');
    step(60 * 16);
    gate.sel = gate.gate.question.correct;
    gate.choose();
    assert('after the lockout the right answer opens the settings', top()?.id === 'parentSettings' && ctx.frozen);

    const st = top();
    const row = i => st.menu.rows[i];
    row(0).items[2].on(); // learning difficulty: harder
    assert('the learning difficulty is saved and the learning engine uses it', flags().parentDifficulty === 1.2 && ctx.learning.core.pd() === 1.2 && row(0).items[2].selected());
    row(1).items[1].on(); // chases: off
    ctx.chase.lvl.set(1, 'smoke');
    assert('chases off are saved and no bully is raised any more', flags().chasesOff === true && ctx.chase.lvl.enabled === false && ctx.chase.lvl.level === 0);
    row(2).items[1].on(); // reminder: 20 minutes
    assert('the break reminder setting is saved', flags().playReminder === 20 && count('parent:setting') === 3);
    const fxBefore = ctx.quality.effects;
    row(4).items[1].on(); // Effekte (story 16.15): reduced
    assert('the Effekte setting is saved, applied at once and sets reducedMotion', flags().effects === 'reduced' && ctx.quality.effects === 'reduced' && flags().reducedMotion === true && row(4).items[1].selected() && !row(4).items[0].selected(), `${flags().effects}`);
    row(4).items[0].on();
    ctx.quality.setEffects(fxBefore);
    env.press('pause');
    assert('Esc leaves the settings and unfreezes the world', !top() && !ctx.frozen);

    // the reminder comes after 20 minutes of play, as a message that waits to be read
    ctx.playTime.seconds = 1199;
    ctx.playTime.announced = 0;
    step(120);
    assert('the break reminder shows once after 20 minutes of play', count('parent:reminder') === 1 && top()?.id === 'message' && top().body.text.includes('20'), top()?.id);
    env.press('pause');
    step(60);
    assert('and not again straight away', count('parent:reminder') === 1 && !top());

    // chases back on: the level works again
    ctx.chase.setChasesEnabled(true);
    ctx.chase.lvl.set(1, 'smoke');
    assert('with chases on again the Aerger level can rise', ctx.chase.lvl.level === 1);
    ctx.chase.reset();

    ctx.state.replace(data0);
    ctx.playTime.seconds = 0;
    ctx.playTime.announced = 0;
    step(2);
    assert('the parent scenario leaves the world running', !ctx.frozen && !top() && !flags().chasesOff);
  }
};
