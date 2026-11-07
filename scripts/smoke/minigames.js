// Smoke scenario: the minigame framework in the running game (ctx.minigames, AD-20). Runs the quiz demo for one and two
// players through the real intents (number keys), a pause that must not cost time, a quit-early round, and checks the
// graded result, the rewards, the learning stats, that the world unfreezes and that nothing leaks.
export const minigames = {
  name: 'minigames',
  async run(game, assert, env) {
    const gs = game.scene.getScene('Game');
    const ctx = gs.ctx;
    const ui = game.scene.getScene('UI');
    const { step } = env;
    ctx.input.update = () => {}; // intents are scripted (the scene may have been restarted by an earlier scenario)
    if (!ctx.state.players[1]) ctx.state.dispatch('coop.set', { on: true });
    if (ctx.players.length < 2) gs.addDebugPlayer();
    const intents = ctx.input.intents;
    const MG = ctx.minigames;
    const state = ctx.state;

    const learned = i => Object.values(state.players[i].learning).reduce((a, l) => a + l.n, 0);
    const snapshot = () => ({
      gs: gs.children.list.length,
      ui: ui.children.list.length,
      scenes: game.scene.scenes.length,
      textures: game.textures.getTextureKeys().length,
      lang: ctx.events.listenerCount('lang:changed'),
      quality: ctx.events.listenerCount('quality:changed'),
      ledger: state.players[0].grades.entries.length
    });
    const done = [];
    ctx.events.on('minigame:done', e => done.push(e));

    // Answers every unlocked panel: player i answers `right(i, n)` correctly (n = questions answered so far).
    const play = (scene, right, maxFrames = 6000) => {
      for (let f = 0; f < maxFrames && ctx.screens.top()?.id === 'minigame'; f++) {
        for (const slot of scene.slots) {
          const p = slot.panel;
          if (!p?.q || p.locked) continue;
          const good = p.q.answers.findIndex(a => a.correct);
          const n = p.q.answers.length;
          intents[slot.index].answer = 1 + (right(slot.index, slot.tally.total) ? good : (good + 1) % n);
        }
        step(1);
        for (const slot of scene.slots) intents[slot.index].answer = 0;
      }
    };
    const press = (i, key) => { intents[i][key] = true; step(1); intents[i][key] = false; step(1); };

    // ---- one player: the whole run ----
    const before = snapshot();
    const money = state.shared.money;
    const xp = state.players[0].xp;
    const n0 = learned(0);
    assert('the debug handle starts minigames', typeof window.SCHULWEG_GAME.startMinigame === 'function');
    const promise = MG.start('quiz-demo', { players: [0], difficulty: 3 });
    assert('starting freezes the world and puts the minigame scene on top', ctx.frozen === true && game.scene.isActive('MG_quiz-demo') && ctx.screens.top()?.id === 'minigame');
    assert('the HUD is ducked while it runs', ui.children.list.every(o => !o.visible));
    assert('a second start is refused', await MG.start('quiz-demo').then(() => false, () => true));
    step(1);
    const scene = game.scene.getScene('MG_quiz-demo');
    assert('the countdown is visible and the timer waits', scene.clock.phase === 'countdown' && scene.count.visible && scene.clock.elapsedMs === 0);
    env.until(() => scene.clock.phase === 'play', 400);
    assert('the timer runs after the countdown', scene.clock.phase === 'play' && scene.slots[0].panel.q !== null);
    step(30);
    const t1 = scene.clock.elapsedMs;
    assert('the timer advances while playing', t1 > 300, t1);
    press(0, 'pause');
    assert('Esc opens the pause screen with a quit row on top of the minigame', ctx.screens.top()?.id === 'pause' && ctx.screens.top().menu.rows.some(r => r.items[0].label() === ctx.t('minigame.quit')));
    step(40);
    assert('pausing does not cost time', scene.clock.elapsedMs === t1, scene.clock.elapsedMs - t1);
    press(0, 'pause');
    assert('Esc resumes the minigame', ctx.screens.top()?.id === 'minigame' && ctx.frozen);
    step(10);
    assert('time runs again after the pause', scene.clock.elapsedMs > t1);
    // one answer through the number key, then the sparkle and the feedback
    const q = scene.slots[0].panel.q;
    const good = q.answers.findIndex(a => a.correct);
    intents[0].answer = good + 1;
    step(1);
    intents[0].answer = 0;
    step(3);
    assert('a number key answers the question and the learning engine is fed', scene.slots[0].tally.total === 1 && scene.slots[0].tally.correct === 1 && learned(0) === n0 + 1);
    assert('a right answer sparkles', scene.pop.fx.emitter.getAliveParticleCount() > 0);
    play(scene, (i, n) => n !== 2 && n !== 5); // two mistakes: 8 of 10
    assert('the result screen appears after the last question', ctx.screens.top()?.id === 'minigameResult' && scene.finished);
    assert('rewards are applied when the result is there', done.length === 1 && state.players[0].xp > xp && state.shared.money > money);
    step(3);
    assert('the world stays frozen on the result screen', ctx.frozen === true);
    press(0, 'jump');
    const result = await promise;
    assert('the result has the agreed shape', result.id === 'quiz-demo' && result.correct === 8 && result.total === 10 && result.score === 0.8 && result.effort === 1
      && Number.isInteger(result.xp) && result.xp > 0 && result.moneyCents > 0 && result.grade >= 1 && result.grade <= 6 && result.ms > 0 && result.perPlayer.length === 1 && result.hintsUsed === 0 && result.quit === false);
    assert('the grade comes from ctx.grades', result.grade === ctx.grades.preview(0, 'mathe', { score: 0.8, effort: 1, difficulty: 3 }).grade);
    assert('xp and money were added by the actions', state.players[0].xp === xp + result.xp && state.shared.money === money + result.moneyCents);
    assert('the minigame:done event carries the result', done[0].id === 'quiz-demo' && done[0].result.score === 0.8 && done[0].players[0] === 0);
    assert('learning stats were updated by every answer', learned(0) === n0 + 10);
    assert('the world is back: unfrozen, no screens, HUD shown, scene removed', ctx.frozen === false && ctx.screens.size === 0 && !game.scene.isActive('MG_quiz-demo') && ui.hudList.some(m => m.objects.some(o => o.visible)));
    assert('no grade was recorded by the framework', state.players[0].grades.entries.length === before.ledger);
    step(5);
    const after = snapshot();
    assert('no leaks after a run (display objects, textures, listeners)', JSON.stringify(after) === JSON.stringify(before), `${JSON.stringify(before)} -> ${JSON.stringify(after)}`);

    // ---- two players side by side ----
    const xp1 = state.players[1].xp;
    const n1 = learned(1);
    const duo = MG.start('quiz-demo', { players: [0, 1], difficulty: 4, context: 'lesson' });
    step(1);
    const two = game.scene.getScene('MG_quiz-demo');
    assert('two players get two areas side by side', two.slots.length === 2 && two.slots[0].rect.x + two.slots[0].rect.w < two.slots[1].rect.x);
    env.until(() => two.clock.phase === 'play', 400);
    play(two, (i, n) => i === 0 || n < 5); // P2 answers only the first 5 right
    assert('both players finished their own streams', two.slots.every(s => s.tally.total === 10) && ctx.screens.top()?.id === 'minigameResult');
    step(2);
    press(1, 'interact'); // the second player's confirm continues too
    const r2 = await duo;
    assert('the two-player result has one entry per player', r2.perPlayer.length === 2 && r2.perPlayer[0].score === 1 && r2.perPlayer[1].score === 0.5 && r2.score === 0.75 && r2.total === 20);
    assert('each player earned own xp and each answered through the engine', state.players[1].xp === xp1 + r2.perPlayer[1].xp && learned(1) === n1 + 10);
    assert('the world is restored after two players', ctx.frozen === false && ctx.screens.size === 0);

    // ---- quitting early ----
    const moneyQ = state.shared.money;
    const quitRun = MG.start('sprint-demo', { players: [0] });
    step(1);
    const sc = game.scene.getScene('MG_sprint-demo');
    env.until(() => sc.clock.phase === 'play', 400);
    play(sc, () => true, 120);
    press(0, 'pause');
    const row = ctx.screens.top().menu.rows.find(r => r.items[0].label() === ctx.t('minigame.quit'));
    row.items[0].on();
    const rq = await quitRun;
    assert('quitting resolves a low-effort result without rewards or a result screen', rq.quit === true && rq.effort <= 0.2 && rq.xp === 0 && state.shared.money === moneyQ && ctx.screens.size === 0);
    assert('a quit round still reports what was answered', rq.total >= 1 && rq.grade >= 1 && rq.grade <= 5);
    assert('the world is restored after quitting', ctx.frozen === false && !game.scene.isActive('MG_sprint-demo') && ctx.minigames.active === null);

    // ---- a timed round ends on its own ----
    const timed = MG.start('sprint-demo', { players: [0], topic: 'deutsch' });
    step(1);
    const st = game.scene.getScene('MG_sprint-demo');
    env.until(() => st.clock.phase === 'play', 400);
    play(st, () => true, 60 * 40);
    assert('the shared timer ends a sprint round and shows the result', st.clock.phase === 'done' && ctx.screens.top()?.id === 'minigameResult');
    step(2);
    press(0, 'jump');
    const rt = await timed;
    assert('a timed round is graded and restored', rt.total >= 5 && rt.grade >= 1 && rt.grade <= 6 && rt.quit === false && ctx.frozen === false);
    assert('unknown ids and players are refused', await MG.start('nope').then(() => false, () => true) && await MG.start('quiz-demo', { players: [0, 5] }).then(() => false, () => true));
    assert('demos are listed only in debug sessions', MG.list().length === (window.SCHULWEG_DEBUG ? 2 : 0));
  }
};
