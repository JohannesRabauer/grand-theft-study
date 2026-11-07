// Smoke scenario: the minigame framework in the running game (ctx.minigames, AD-20). Runs the quiz demo for one and two
// players through the real intents (number keys), a pause that must not cost time, a quit-early round, and checks the
// graded result, the rewards, the learning stats, that the world unfreezes and that nothing leaks.
import { fallMsFor } from '../../minigames/matheCore.js';
import { beltMsFor, foldUmlauts } from '../../minigames/deutschCore.js';

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
    assert('demos are listed only in debug sessions, real minigames always', MG.list().length === (window.SCHULWEG_DEBUG ? 9 : 7) && ['mathe', 'deutsch', 'englisch', 'erdkunde', 'science', 'musik', 'kunst'].every(id => MG.list().some(d => d.id === id)));

    // ---- Mathe: both modes in one run, one player ----
    // Answers every open question of the Mathe scene through the inputs a player has: number keys (answer buttons,
    // block lanes) and the keypad (typed items). Player p answers `right(p, n)` correctly (n = questions answered so far).
    const playMathe = (scene, right, seen, { hint = false, watch } = {}) => {
      for (let f = 0; f < 6000 && ctx.screens.top()?.id === 'minigame' && !scene.over; f++) {
        watch?.();
        for (const slot of scene.slots) {
          const ok = right(slot.index, slot.tally.total);
          if (slot.mode) seen.add(slot.mode);
          if (!slot.q) continue;
          if (slot.mode === 'blocks') {
            const field = slot.field;
            if (field.locked) continue;
            if (hint && field.hintsLeft > 0 && field.hintsUsed === 0) field.nav({ dx: 0, dy: 1, confirm: false, pick: 0 });
            if (field.fall.progress > 0.2) intents[slot.index].answer = 1 + (ok ? field.set.correct : (field.set.correct + 1) % field.count);
          } else if (slot.q.type === 'typed') {
            if (slot.keypad.locked) continue;
            slot.keypad.model.text = ok ? slot.q.answers[0].text : `${slot.q.answers[0].text}9`;
            slot.keypad.press('ok');
          } else if (!slot.panel.locked) {
            const good = slot.q.answers.findIndex(a => a.correct);
            intents[slot.index].answer = 1 + (ok ? good : (good + 1) % slot.q.answers.length);
          }
        }
        step(1);
        for (const slot of scene.slots) intents[slot.index].answer = 0;
      }
    };
    const nm = learned(0);
    const xpm = state.players[0].xp;
    const moneym = state.shared.money;
    const beforeM = snapshot();
    const mathe = MG.start('mathe', { players: [0], difficulty: 3 });
    step(1);
    const ms1 = game.scene.getScene('MG_mathe');
    ms1.plan = { first: 'sprint', second: 'blocks', switchMs: 25000 };
    assert('the Mathe scene shows its title and instructions during the countdown', ms1.title.text === ctx.t('minigame.mathe.title') && ms1.help.visible && ms1.help.text.length > 10);
    env.until(() => ms1.clock.phase === 'play', 400);
    assert('sprint mode starts with the chalkboard panel', ms1.slots[0].mode === 'sprint' && ms1.slots[0].panel.q !== null && !ms1.slots[0].field.blocks[0].box.visible);
    const seen = new Set();
    let blocksChecked = false;
    playMathe(ms1, (p, n) => n % 5 !== 4, seen, {
      hint: true,
      watch: () => {
        const slot = ms1.slots[0];
        if (blocksChecked || slot.mode !== 'blocks' || !slot.q || slot.field.locked) return;
        blocksChecked = true;
        const expect = fallMsFor(ms1.def.options.fall, slot.q.meta);
        assert('block fall time comes from the engine difficulty and timeFactor', slot.field.fall.fallMs === expect && expect >= 5000, `${slot.field.fall.fallMs} vs ${expect}`);
        assert('the blocks show the answers of the question in lanes', slot.field.count >= 2 && slot.field.blocks[0].box.visible && slot.field.set.texts.length === slot.field.count);
      }
    });
    assert('both modes were played in one run', seen.has('sprint') && seen.has('blocks'), [...seen].join());
    step(2);
    assert('the round ended on the result screen after about 70 s', ctx.screens.top()?.id === 'minigameResult' && ms1.clock.phase === 'done' && ms1.clock.elapsedMs >= 69000, `${ctx.screens.top()?.id} ${ms1.clock.elapsedMs}`);
    press(0, 'jump');
    const rm = await mathe;
    assert('Mathe result: graded, rewarded and counted like any minigame', rm.id === 'mathe' && rm.subject === 'mathe' && rm.total >= 8 && rm.correct >= 1 && rm.correct < rm.total && rm.score > 0 && rm.score < 1
      && rm.grade >= 1 && rm.grade <= 6 && rm.xp > 0 && rm.moneyCents > 0 && rm.ms >= 69000 && rm.quit === false, JSON.stringify(rm));
    assert('every question (sprint and blocks) went through the learning engine', learned(0) === nm + rm.total, `${learned(0)} vs ${nm + rm.total}`);
    assert('hints used in blocks mode are reported', rm.hintsUsed >= 1);
    assert('Mathe rewards were applied', state.players[0].xp === xpm + rm.xp && state.shared.money === moneym + rm.moneyCents);
    assert('the grade comes from ctx.grades', rm.grade === ctx.grades.preview(0, 'mathe', { score: rm.score, effort: rm.effort, difficulty: 3 }).grade);
    assert('the world is back after Mathe', ctx.frozen === false && ctx.screens.size === 0 && !game.scene.isActive('MG_mathe'));
    step(5);
    assert('Mathe leaks nothing (display objects, textures, listeners)', JSON.stringify(snapshot()) === JSON.stringify(beforeM), `${JSON.stringify(beforeM)} -> ${JSON.stringify(snapshot())}`);

    // ---- Mathe: two players side by side, blocks first, the leader is cheered gently ----
    const n0b = learned(0);
    const n1b = learned(1);
    const xp1m = state.players[1].xp;
    const mathe2 = MG.start('mathe', { players: [0, 1], difficulty: 4 });
    step(1);
    const ms2 = game.scene.getScene('MG_mathe');
    ms2.plan = { first: 'blocks', second: 'sprint', switchMs: 30000 };
    env.until(() => ms2.clock.phase === 'play', 400);
    assert('two players get two block fields side by side with separate streams', ms2.slots.length === 2 && ms2.slots.every(s => s.mode === 'blocks' && s.q) && ms2.slots[0].q !== ms2.slots[1].q && ms2.slots[0].rect.x < ms2.slots[1].rect.x);
    const seen2 = new Set();
    playMathe(ms2, (p, n) => p === 0 || n % 2 === 0, seen2);
    assert('both modes were played with two players', seen2.has('sprint') && seen2.has('blocks'));
    assert('the leader is cheered before the result screen', ms2.over && ms2.banner.visible && ms2.bannerKey.key === 'minigame.mathe.winner' && ctx.screens.top()?.id === 'minigame' && ms2.slots[0].tally.correct > ms2.slots[1].tally.correct);
    env.until(() => ctx.screens.top()?.id === 'minigameResult', 200);
    assert('the cheer ends in the result screen', ctx.screens.top()?.id === 'minigameResult');
    step(2);
    press(1, 'interact');
    const r2m = await mathe2;
    assert('both players get a full, own result (the lead is only cosmetic)', r2m.perPlayer.length === 2 && r2m.perPlayer[0].score > r2m.perPlayer[1].score
      && r2m.perPlayer.every(p => p.xp > 0 && p.effort > 0.5) && r2m.total === ms2.slots[0].tally.total + ms2.slots[1].tally.total);
    assert('each player was learned separately and paid', learned(0) === n0b + ms2.slots[0].tally.total && learned(1) === n1b + ms2.slots[1].tally.total && state.players[1].xp === xp1m + r2m.perPlayer[1].xp);
    assert('the world is restored after two-player Mathe', ctx.frozen === false && ctx.screens.size === 0 && !game.scene.isActive('MG_mathe'));

    // ---- Mathe: uncaught blocks land without a penalty, quitting still works ----
    const quitMathe = MG.start('mathe', { players: [0] });
    step(1);
    const ms3 = game.scene.getScene('MG_mathe');
    ms3.plan = { first: 'blocks', second: 'blocks', switchMs: 1000 };
    env.until(() => ms3.clock.phase === 'play', 400);
    const t0 = ms3.slots[0].tally.total;
    env.until(() => ms3.slots[0].tally.total > t0, 60 * 20);
    assert('a block that lands uncaught is a gentle miss and the round goes on', ms3.slots[0].tally.total === t0 + 1 && ms3.slots[0].tally.correct === 0 && ms3.slots[0].field.timeout === true && ms3.slots[0].field.board.text.includes(ctx.t('minigame.mathe.timeout')));
    env.until(() => ms3.slots[0].field.fall.state === 'falling', 60 * 4);
    assert('the next question follows by itself', ms3.slots[0].field.fall.state === 'falling' && ms3.slots[0].tally.total === t0 + 1);
    press(0, 'pause');
    ctx.screens.top().menu.rows.find(r => r.items[0].label() === ctx.t('minigame.quit')).items[0].on();
    const rqm = await quitMathe;
    assert('quitting Mathe resolves without rewards and restores the world', rqm.quit === true && rqm.xp === 0 && ctx.frozen === false && ctx.minigames.active === null);

    // ---- Deutsch: both modes in one run, one player ----
    // Answers every open question of the Deutsch scene through the inputs a player has: number keys (answer buttons, belt
    // bins), the letter pad (typed items) and, for one typed item, the physical keyboard handler. Player p answers
    // `right(p, n)` correctly (n = questions answered so far). `typedLog` collects every typed judgement for one assert.
    const playDeutsch = (scene, right, seen, typedLog, { hint = false, keyboard = false, watch } = {}) => {
      let folded = 0;
      for (let f = 0; f < 6000 && ctx.screens.top()?.id === 'minigame' && !scene.over; f++) {
        watch?.();
        for (const slot of scene.slots) {
          const ok = right(slot.index, slot.tally.total);
          if (slot.mode) seen.add(slot.mode);
          if (!slot.q) continue;
          if (slot.mode === 'belt') {
            const belt = slot.belt;
            if (belt.locked) continue;
            if (hint && belt.hintsLeft > 0 && belt.hintsUsed === 0) belt.nav({ dx: 0, dy: 1, confirm: false, pick: 0 });
            if (belt.belt.progress > 0.2) intents[slot.index].answer = 1 + (ok ? belt.correct : (belt.correct + 1) % 3);
          } else if (slot.q.type === 'typed') {
            if (slot.pad.locked) continue;
            const q = slot.q;
            const word = q.answers[0].text;
            const before = slot.tally.correct;
            let text = ok ? word : `${word}x`;
            if (ok && !q.strictUmlaut && foldUmlauts(word) !== word && folded++ % 2 === 0) text = foldUmlauts(word);
            if (keyboard && slot.tally.total === 0) {
              scene.onKey({ key: 'Backspace' });
              scene.onKey({ key: 'ä' });
              scene.onKey({ key: '5' });
              scene.onKey({ key: 'Backspace' });
              typedLog.push(['keyboard typing', slot.pad.model.text === '']);
              for (const ch of text) scene.onKey({ key: ch });
              typedLog.push(['keyboard letters reach the pad', slot.pad.model.text === text]);
              scene.onKey({ key: 'Enter' });
            } else {
              slot.pad.model.text = text;
              slot.pad.press('ok');
            }
            typedLog.push([`${q.id} "${text}" judged ${ok}`, slot.tally.correct === before + (ok ? 1 : 0)]);
          } else if (!slot.panel.locked) {
            const good = slot.q.answers.findIndex(a => a.correct);
            intents[slot.index].answer = 1 + (ok ? good : (good + 1) % slot.q.answers.length);
          }
        }
        step(1);
        for (const slot of scene.slots) intents[slot.index].answer = 0;
      }
    };
    // spell questions alternate between typed items and answer buttons so every input path is exercised
    const mixSpell = scene => {
      const orig = scene.nextQuestion.bind(scene);
      scene.nextQuestion = (slot, mode) => (mode === 'spell' && slot.tally.total % 3 === 0
        ? ctx.learning.next('deutsch', { player: slot.index, context: 'lesson', filter: i => i.type === 'typed' })
        : orig(slot, mode));
    };
    const nd = learned(0);
    const xpd = state.players[0].xp;
    const moneyd = state.shared.money;
    const beforeD = snapshot();
    const deutsch = MG.start('deutsch', { players: [0], difficulty: 3 });
    step(1);
    const ds1 = game.scene.getScene('MG_deutsch');
    ds1.plan = { first: 'belt', second: 'spell', switchMs: 30000 };
    mixSpell(ds1);
    assert('the Deutsch scene shows its title and instructions during the countdown', ds1.title.text === ctx.t('minigame.deutsch.title') && ds1.help.visible && ds1.help.text.length > 10);
    assert('one player: the physical keyboard is listened to', ds1.input.keyboard.listenerCount('keydown') === 1);
    env.until(() => ds1.clock.phase === 'play', 400);
    assert('belt mode starts with the noun on the belt and the answer panel hidden', ds1.slots[0].mode === 'belt' && ds1.slots[0].belt.q !== null && !ds1.slots[0].belt.locked && ds1.slots[0].belt.crate.visible && !ds1.slots[0].panel.rows[0].bg.visible);
    const seenD = new Set();
    const typedLog = [];
    let beltChecked = false;
    playDeutsch(ds1, (p, n) => n % 5 !== 4, seenD, typedLog, {
      hint: true,
      keyboard: true,
      watch: () => {
        const slot = ds1.slots[0];
        if (beltChecked || slot.mode !== 'belt' || !slot.q || slot.belt.locked) return;
        beltChecked = true;
        const expect = beltMsFor(ds1.def.options.belt, slot.q.meta);
        assert('belt travel time comes from the engine difficulty and timeFactor', slot.belt.belt.fallMs === expect && expect >= 4500, `${slot.belt.belt.fallMs} vs ${expect}`);
        assert('the belt items are Artikel items from the engine filter', slot.q.tags[0] === 'artikel' && slot.belt.noun.length > 1 && slot.belt.crateText.text === slot.belt.noun);
      }
    });
    assert('both modes were played in one run', seenD.has('belt') && seenD.has('spell'), [...seenD].join());
    assert('typed answers (pad and keyboard, umlauts, case) were judged as expected', typedLog.length >= 4 && typedLog.every(e => e[1]), JSON.stringify(typedLog.filter(e => !e[1])));
    step(2);
    assert('the round ended on the result screen after about 70 s', ctx.screens.top()?.id === 'minigameResult' && ds1.clock.phase === 'done' && ds1.clock.elapsedMs >= 69000, `${ctx.screens.top()?.id} ${ds1.clock.elapsedMs}`);
    press(0, 'jump');
    const rd = await deutsch;
    assert('Deutsch result: graded, rewarded and counted like any minigame', rd.id === 'deutsch' && rd.subject === 'deutsch' && rd.total >= 8 && rd.correct >= 1 && rd.correct < rd.total && rd.score > 0 && rd.score < 1
      && rd.grade >= 1 && rd.grade <= 6 && rd.xp > 0 && rd.moneyCents > 0 && rd.ms >= 69000 && rd.quit === false, JSON.stringify(rd));
    assert('every question (belt and spelling) went through the learning engine', learned(0) === nd + rd.total, `${learned(0)} vs ${nd + rd.total}`);
    assert('hints used on the belt are reported', rd.hintsUsed >= 1);
    assert('Deutsch rewards were applied', state.players[0].xp === xpd + rd.xp && state.shared.money === moneyd + rd.moneyCents);
    assert('the grade comes from ctx.grades', rd.grade === ctx.grades.preview(0, 'deutsch', { score: rd.score, effort: rd.effort, difficulty: 3 }).grade);
    assert('the world is back after Deutsch', ctx.frozen === false && ctx.screens.size === 0 && !game.scene.isActive('MG_deutsch'));
    step(5);
    assert('Deutsch leaks nothing (display objects, textures, listeners)', JSON.stringify(snapshot()) === JSON.stringify(beforeD), `${JSON.stringify(beforeD)} -> ${JSON.stringify(snapshot())}`);

    // ---- Deutsch: two players side by side, spelling first, the leader is cheered gently ----
    const n0d = learned(0);
    const n1d = learned(1);
    const xp1d = state.players[1].xp;
    const deutsch2 = MG.start('deutsch', { players: [0, 1], difficulty: 4 });
    step(1);
    const ds2 = game.scene.getScene('MG_deutsch');
    ds2.plan = { first: 'spell', second: 'belt', switchMs: 30000 };
    mixSpell(ds2);
    assert('two players: the keyboard is not shared', ds2.input.keyboard.listenerCount('keydown') === 0);
    env.until(() => ds2.clock.phase === 'play', 400);
    assert('two players get two areas side by side with separate streams', ds2.slots.length === 2 && ds2.slots.every(s => s.mode === 'spell' && s.q) && ds2.slots[0].q !== ds2.slots[1].q && ds2.slots[0].rect.x < ds2.slots[1].rect.x);
    const seenD2 = new Set();
    const typedLog2 = [];
    playDeutsch(ds2, (p, n) => p === 0 || n % 2 === 0, seenD2, typedLog2);
    assert('both modes were played with two players', seenD2.has('belt') && seenD2.has('spell'));
    assert('typed answers of two players were judged as expected', typedLog2.length >= 2 && typedLog2.every(e => e[1]), JSON.stringify(typedLog2.filter(e => !e[1])));
    assert('the leader is cheered before the result screen', ds2.over && ds2.banner.visible && ds2.bannerKey.key === 'minigame.deutsch.winner' && ctx.screens.top()?.id === 'minigame' && ds2.slots[0].tally.correct > ds2.slots[1].tally.correct);
    env.until(() => ctx.screens.top()?.id === 'minigameResult', 200);
    assert('the cheer ends in the result screen', ctx.screens.top()?.id === 'minigameResult');
    step(2);
    press(1, 'interact');
    const r2d = await deutsch2;
    assert('both players get a full, own result (the lead is only cosmetic)', r2d.perPlayer.length === 2 && r2d.perPlayer[0].score > r2d.perPlayer[1].score
      && r2d.perPlayer.every(p => p.xp > 0 && p.effort > 0.5) && r2d.total === ds2.slots[0].tally.total + ds2.slots[1].tally.total);
    assert('each player was learned separately and paid', learned(0) === n0d + ds2.slots[0].tally.total && learned(1) === n1d + ds2.slots[1].tally.total && state.players[1].xp === xp1d + r2d.perPlayer[1].xp);
    assert('the world is restored after two-player Deutsch', ctx.frozen === false && ctx.screens.size === 0 && !game.scene.isActive('MG_deutsch'));
    step(5);
    assert('two-player Deutsch leaks nothing', JSON.stringify(snapshot()) === JSON.stringify(beforeD), `${JSON.stringify(beforeD)} -> ${JSON.stringify(snapshot())}`);

    // ---- Deutsch: a noun that rides off the belt is a gentle miss, a tap sorts, quitting still works ----
    const quitDeutsch = MG.start('deutsch', { players: [0] });
    step(1);
    const ds3 = game.scene.getScene('MG_deutsch');
    ds3.plan = { first: 'belt', second: 'belt', switchMs: 1000 };
    env.until(() => ds3.clock.phase === 'play', 400);
    const d0 = ds3.slots[0].tally.total;
    env.until(() => ds3.slots[0].tally.total > d0, 60 * 20);
    assert('a noun that rides off the belt is a gentle miss and the round goes on', ds3.slots[0].tally.total === d0 + 1 && ds3.slots[0].tally.correct === 0 && ds3.slots[0].belt.timeout === true && ds3.slots[0].belt.board.text.includes(ctx.t('minigame.deutsch.timeout')));
    env.until(() => ds3.slots[0].belt.belt.state === 'falling', 60 * 4);
    assert('the next noun follows by itself', ds3.slots[0].belt.belt.state === 'falling' && ds3.slots[0].tally.total === d0 + 1);
    const noun = ds3.slots[0].belt;
    noun.select(noun.correct);
    noun.sort(noun.correct);
    assert('a tap on the right bin sorts the noun and counts', ds3.slots[0].tally.total === d0 + 2 && ds3.slots[0].tally.correct === 1);
    press(0, 'pause');
    ctx.screens.top().menu.rows.find(r => r.items[0].label() === ctx.t('minigame.quit')).items[0].on();
    const rqd = await quitDeutsch;
    assert('quitting Deutsch resolves without rewards and restores the world', rqd.quit === true && rqd.xp === 0 && ctx.frozen === false && ctx.minigames.active === null);

    // ---- Englisch: Vokabel-Memory and Schilder-Check ----
    // Plays the memory boards through the card grid (the same handler a tap uses) and the sign questions through the
    // inputs a player has (number keys, letter pad). A "wrong" board is played with mistakes: the same two known cards
    // of different pairs are flipped three times, so their pairs count as forgotten. `right(p, n)`: n = boards started
    // so far (memory) or questions answered so far (signs).
    const playEnglisch = (scene, right, seen, log, { hint = false, watch } = {}) => {
      for (let f = 0; f < 9000 && ctx.screens.top()?.id === 'minigame' && !scene.over; f++) {
        watch?.();
        for (const slot of scene.slots) {
          if (slot.mode) seen.add(slot.mode);
          if (!slot.q) continue;
          if (slot.mode === 'memory') {
            const memo = slot.smoke ??= { board: null, boards: -1, cool: 0, wrong: false, bad: 0 };
            const { board } = slot;
            if (memo.board !== board) { memo.board = board; memo.boards++; memo.wrong = !right(slot.index, memo.boards); memo.cool = 20; memo.bad = 0; }
            if (board.complete || board.locked || slot.grid.locked) continue;
            if (memo.cool-- > 0) continue;
            memo.cool = 20;
            const find = (entry, side) => board.cards.findIndex(c => c.entry === entry && c.side === side);
            if (memo.wrong && memo.bad < 3) {
              if (board.first < 0) slot.grid.tap(find(0, 'en'));
              else { slot.grid.tap(find(1, 'de')); memo.bad++; }
            } else if (board.first >= 0) {
              const a = board.cards[board.first];
              slot.grid.tap(find(a.entry, a.side === 'en' ? 'de' : 'en'));
            } else {
              slot.grid.tap(board.done.findIndex(d => !d));
            }
            continue;
          }
          const ok = right(slot.index, slot.tally.total);
          if (slot.q.type === 'typed') {
            if (slot.pad.locked) continue;
            const word = slot.q.answers[0].text;
            const before = slot.tally.correct;
            slot.pad.model.text = ok ? word.toUpperCase() : `${word}x`;
            slot.pad.press('ok');
            log.push([`${slot.q.id} judged ${ok}`, slot.tally.correct === before + (ok ? 1 : 0)]);
          } else if (!slot.panel.locked) {
            if (hint && slot.panel.hintsLeft > 0 && slot.panel.hintsUsed === 0) slot.panel.useHint();
            const good = slot.q.answers.findIndex(a => a.correct);
            intents[slot.index].answer = 1 + (ok ? good : (good + 1) % slot.q.answers.length);
          }
        }
        step(1);
        for (const slot of scene.slots) intents[slot.index].answer = 0;
      }
    };
    // sign questions alternate between typed items and answer buttons so both input paths run
    const mixSigns = scene => {
      const orig = scene.nextSign.bind(scene);
      scene.nextSign = slot => (slot.tally.total % 3 === 0
        ? ctx.learning.next('englisch', { player: slot.index, context: 'lesson', filter: i => i.type === 'typed' && i.tags.includes('signs') })
        : orig(slot));
    };
    const ne = learned(0);
    const xpe = state.players[0].xp;
    const moneye = state.shared.money;
    const beforeE = snapshot();
    const englisch = MG.start('englisch', { players: [0], difficulty: 3 });
    step(1);
    const es1 = game.scene.getScene('MG_englisch');
    es1.plan = { first: 'memory', second: 'signs', switchMs: 35000 };
    mixSigns(es1);
    assert('the Englisch scene shows its title and instructions during the countdown', es1.title.text === ctx.t('minigame.englisch.title') && es1.help.visible && es1.help.text.length > 10);
    assert('one player: the physical keyboard is listened to', es1.input.keyboard.listenerCount('keydown') === 1);
    env.until(() => es1.clock.phase === 'play', 400);
    const eslot = es1.slots[0];
    assert('memory starts with a face-down board of 6 or 8 cards and the answer panel hidden', eslot.mode === 'memory' && eslot.board.cards.length >= 6 && eslot.board.up.every(u => !u) && eslot.grid.cards[0].mark.visible && !eslot.grid.cards[0].word.visible && !eslot.panel.rows[0].bg.visible);
    assert('the board is made of English and German cards of engine items', eslot.deal.qs.every(q => q.meta.topic === 'englisch') && eslot.board.cards.some(c => c.side === 'en') && eslot.board.cards.some(c => c.side === 'de'));
    // the cursor: arrows move over the cards and confirm turns the focused card
    const focus0 = eslot.grid.focus;
    intents[0].move.x = 1; step(1); intents[0].move.x = 0; step(1);
    assert('the arrow keys move the card cursor', eslot.grid.focus === focus0 + 1);
    const focused = eslot.grid.focus;
    press(0, 'jump');
    assert('confirm turns the focused card up and shows its word', eslot.board.up[focused] && eslot.grid.cards[focused].word.visible && eslot.grid.cards[focused].word.text === eslot.board.cards[focused].text);
    const wrongPartner = eslot.board.cards.findIndex((c, i) => i !== focused && c.entry !== eslot.board.cards[focused].entry);
    eslot.grid.tap(wrongPartner);
    assert('two cards that do not belong together stay up and lock the board', eslot.board.locked && eslot.board.up[wrongPartner]);
    env.until(() => !eslot.board.locked, 120);
    assert('after a moment they are turned down again', !eslot.board.locked && !eslot.board.up[focused] && eslot.grid.cards[focused].mark.visible);
    const seenE = new Set();
    const logE = [];
    let platesChecked = false;
    playEnglisch(es1, (p, n) => n % 5 !== 4, seenE, logE, {
      hint: true,
      watch: () => {
        const slot = es1.slots[0];
        if (platesChecked || slot.mode !== 'signs' || !slot.q || slot.q.type !== 'choice' || slot.panel.locked) return;
        platesChecked = true;
        assert('a sign question shows the plate with the sign word, both languages in the caption', slot.plate.visible && slot.plate.word.text === slot.q.sign && slot.plate.caption.text.includes('/'));
      }
    });
    assert('both modes were played in one run', seenE.has('memory') && seenE.has('signs'), [...seenE].join());
    assert('typed sign answers were judged as expected', logE.length >= 2 && logE.every(e => e[1]), JSON.stringify(logE.filter(e => !e[1])));
    step(2);
    assert('the round ended on the result screen after about 70 s', ctx.screens.top()?.id === 'minigameResult' && es1.clock.phase === 'done' && es1.clock.elapsedMs >= 69000, `${ctx.screens.top()?.id} ${es1.clock.elapsedMs}`);
    press(0, 'jump');
    const re = await englisch;
    assert('Englisch result: graded, rewarded and counted like any minigame', re.id === 'englisch' && re.subject === 'englisch' && re.total >= 8 && re.correct >= 1 && re.correct < re.total && re.score > 0 && re.score < 1
      && re.grade >= 1 && re.grade <= 6 && re.xp > 0 && re.moneyCents > 0 && re.ms >= 69000 && re.quit === false, JSON.stringify(re));
    assert('every memory pair and sign question went through the learning engine', learned(0) === ne + re.total, `${learned(0)} vs ${ne + re.total}`);
    assert('Englisch rewards were applied', state.players[0].xp === xpe + re.xp && state.shared.money === moneye + re.moneyCents);
    assert('the grade comes from ctx.grades', re.grade === ctx.grades.preview(0, 'englisch', { score: re.score, effort: re.effort, difficulty: 3 }).grade);
    assert('the world is back after Englisch', ctx.frozen === false && ctx.screens.size === 0 && !game.scene.isActive('MG_englisch'));
    step(5);
    assert('Englisch leaks nothing (display objects, textures, listeners)', JSON.stringify(snapshot()) === JSON.stringify(beforeE), `${JSON.stringify(beforeE)} -> ${JSON.stringify(snapshot())}`);

    // ---- Englisch: two players side by side, sign check first, the leader is cheered gently ----
    const n0e = learned(0);
    const n1e = learned(1);
    const xp1e = state.players[1].xp;
    const englisch2 = MG.start('englisch', { players: [0, 1], difficulty: 4 });
    step(1);
    const es2 = game.scene.getScene('MG_englisch');
    es2.plan = { first: 'signs', second: 'memory', switchMs: 30000 };
    mixSigns(es2);
    assert('two players: the keyboard is not shared', es2.input.keyboard.listenerCount('keydown') === 0);
    env.until(() => es2.clock.phase === 'play', 400);
    assert('two players get two areas side by side with separate streams', es2.slots.length === 2 && es2.slots.every(s => s.mode === 'signs' && s.q) && es2.slots[0].q !== es2.slots[1].q && es2.slots[0].rect.x < es2.slots[1].rect.x);
    const seenE2 = new Set();
    const logE2 = [];
    let ownBoards = 0;
    playEnglisch(es2, (p, n) => p === 0 || n % 2 === 0, seenE2, logE2, {
      watch: () => {
        const [a, b] = es2.slots;
        if (!ownBoards && a.mode === 'memory' && b.mode === 'memory' && a.board && b.board) ownBoards = a.board !== b.board && a.grid !== b.grid ? 1 : -1;
      }
    });
    assert('both modes were played with two players', seenE2.has('memory') && seenE2.has('signs'));
    assert('each player had their own memory board', ownBoards === 1);
    assert('typed sign answers of two players were judged as expected', logE2.length >= 2 && logE2.every(e => e[1]), JSON.stringify(logE2.filter(e => !e[1])));
    assert('the leader is cheered before the result screen', es2.over && es2.banner.visible && es2.bannerKey.key === 'minigame.englisch.winner' && ctx.screens.top()?.id === 'minigame' && es2.slots[0].tally.correct > es2.slots[1].tally.correct);
    env.until(() => ctx.screens.top()?.id === 'minigameResult', 200);
    assert('the cheer ends in the result screen', ctx.screens.top()?.id === 'minigameResult');
    step(2);
    press(1, 'interact');
    const r2e = await englisch2;
    assert('both players get a full, own result (the lead is only cosmetic)', r2e.perPlayer.length === 2 && r2e.perPlayer[0].score > r2e.perPlayer[1].score
      && r2e.perPlayer.every(p => p.xp > 0 && p.effort > 0.5) && r2e.total === es2.slots[0].tally.total + es2.slots[1].tally.total);
    assert('each player was learned separately and paid', learned(0) === n0e + es2.slots[0].tally.total && learned(1) === n1e + es2.slots[1].tally.total && state.players[1].xp === xp1e + r2e.perPlayer[1].xp);
    assert('the world is restored after two-player Englisch', ctx.frozen === false && ctx.screens.size === 0 && !game.scene.isActive('MG_englisch'));
    step(5);
    assert('two-player Englisch leaks nothing', JSON.stringify(snapshot()) === JSON.stringify(beforeE), `${JSON.stringify(beforeE)} -> ${JSON.stringify(snapshot())}`);

    // ---- Englisch: forgotten pairs are mistakes with the explanation, quitting still works ----
    const quitEnglisch = MG.start('englisch', { players: [0] });
    step(1);
    const es3 = game.scene.getScene('MG_englisch');
    es3.plan = { first: 'memory', second: 'memory', switchMs: 1000 };
    env.until(() => es3.clock.phase === 'play', 400);
    const e3 = es3.slots[0];
    const e3total = e3.tally.total;
    const e3board = e3.board;
    const idx3 = (entry, side) => e3board.cards.findIndex(c => c.entry === entry && c.side === side);
    for (let round = 0; round < 3; round++) {
      e3.grid.tap(idx3(0, 'en'));
      e3.grid.tap(idx3(1, 'de'));
      env.until(() => !e3board.locked, 120);
    }
    assert('flipping two known cards of different pairs is a mistake for both pairs', e3board.faults[0] === 2 && e3board.faults[1] === 2 && e3board.faults[2] === 0 && e3board.totalFaults() === 4, JSON.stringify(e3board.faults));
    const pairs3 = e3board.entries.length;
    for (let e = 0; e < pairs3; e++) { e3.grid.tap(idx3(e, 'en')); e3.grid.tap(idx3(e, 'de')); }
    const answered = e3.tally.total - e3total;
    assert('the finished board answered every pair: forgotten pairs wrong, the others right', e3board.complete && answered === (e3.deal.whole ? 1 : pairs3) && e3.tally.correct === (e3.deal.whole ? 0 : pairs3 - 2), `${answered} answered, ${e3.tally.correct} right`);
    env.until(() => e3.board !== e3board, 120);
    assert('the next board follows by itself', e3.board !== e3board && e3.board.up.every(u => !u) && e3.note.text === '');
    press(0, 'pause');
    ctx.screens.top().menu.rows.find(r => r.items[0].label() === ctx.t('minigame.quit')).items[0].on();
    const rqe = await quitEnglisch;
    assert('quitting Englisch resolves without rewards and restores the world', rqe.quit === true && rqe.xp === 0 && ctx.frozen === false && ctx.minigames.active === null);

    // ---- Erdkunde: "Wo liegt ...?" on the map and Hauptstadt-Match ----
    // Taps the map where the question asks (the handler of a real tap, through GermanyMap.pick) or answers the capital
    // buttons with the number keys. Player p answers `right(p, n)` correctly (n = questions answered so far).
    const playErdkunde = (scene, right, seen, { watch } = {}) => {
      for (let f = 0; f < 6000 && ctx.screens.top()?.id === 'minigame' && !scene.over; f++) {
        watch?.();
        for (const slot of scene.slots) {
          if (slot.mode) seen.add(slot.mode);
          if (!slot.q) continue;
          const ok = right(slot.index, slot.tally.total);
          if (slot.mode === 'wo') {
            if (slot.locked) continue;
            const anchors = slot.map.anchors();
            const at = ok ? anchors.find(a => a.id === slot.target.target) : anchors.find(a => a.id !== slot.target.target);
            slot.map.onTap(slot.map.pick(at.x, at.y));
          } else if (!slot.panel.locked) {
            const good = slot.q.answers.findIndex(a => a.correct);
            intents[slot.index].answer = 1 + (ok ? good : (good + 1) % slot.q.answers.length);
          }
        }
        step(1);
        for (const slot of scene.slots) intents[slot.index].answer = 0;
      }
    };
    const nk = learned(0);
    const xpk = state.players[0].xp;
    const moneyk = state.shared.money;
    const beforeK = snapshot();
    const erdkunde = MG.start('erdkunde', { players: [0], difficulty: 3 });
    step(1);
    const ks1 = game.scene.getScene('MG_erdkunde');
    ks1.plan = { first: 'wo', second: 'capital', switchMs: 30000 };
    assert('the Erdkunde scene shows its title and instructions during the countdown', ks1.title.text === ctx.t('minigame.erdkunde.title') && ks1.help.visible && ks1.help.text.length > 10);
    env.until(() => ks1.clock.phase === 'play', 400);
    const kslot = ks1.slots[0];
    assert('"Wo liegt ...?" starts with the question above the big map and the panel hidden', kslot.mode === 'wo' && kslot.map.base.visible && kslot.question.visible && kslot.question.text === ctx.learning.localize(kslot.q).q && !kslot.panel.rows[0].bg.visible && kslot.target.mode === 'wo');
    assert('the map targets match the question (states or rivers) and a cursor is on one of them', ['states', 'rivers'].includes(kslot.map.what) && kslot.map.anchors().some(a => a.id === kslot.sel) && kslot.map.hover === kslot.sel);
    const sel0 = kslot.sel;
    intents[0].move.x = 1; step(1); intents[0].move.x = 0; step(1);
    intents[0].move.y = 1; step(1); intents[0].move.y = 0; step(1);
    assert('the arrow keys move the map cursor to a neighbouring target', (kslot.sel !== sel0 || kslot.map.anchors().length < 3) && kslot.map.hover === kslot.sel);
    const k0 = kslot.tally.total;
    press(0, 'jump');
    assert('confirm picks the cursor target: one answer, the right one lit green, the note explains', kslot.tally.total === k0 + 1 && kslot.locked && kslot.map.marks.get(kslot.target.target) === 'good' && kslot.note.text.length > 5);
    kslot.map.onTap(null);
    kslot.map.onTap(kslot.target.target);
    assert('a tap on water or while locked does nothing', kslot.tally.total === k0 + 1);
    ctx.i18n.set('en');
    assert('a language switch re-translates the question', kslot.question.text === ctx.learning.localize(kslot.q, 'en').q && kslot.tag.text === ctx.t('minigame.erdkunde.mode.wo'));
    ctx.i18n.set('de');
    const seenK = new Set();
    let capChecked = false;
    playErdkunde(ks1, (p, n) => n % 5 !== 4, seenK, {
      watch: () => {
        const slot = ks1.slots[0];
        if (capChecked || slot.mode !== 'capital' || !slot.q || slot.panel.locked) return;
        capChecked = true;
        assert('Hauptstadt-Match: the state glows on the map beside the answer buttons (a plain item shows them without)', slot.target ? slot.map.marks.get(slot.target.target) === 'focus' && slot.target.mode === 'capital' : slot.q.type === 'choice');
        assert('the answer panel is beside the map, not under it', slot.panel.rect.x + slot.panel.rect.w <= slot.map.rect.x && slot.panel.rows[0].bg.visible);
      }
    });
    assert('both modes were played in one run', seenK.has('wo') && seenK.has('capital'), [...seenK].join());
    step(2);
    assert('the round ended on the result screen after about 70 s', ctx.screens.top()?.id === 'minigameResult' && ks1.clock.phase === 'done' && ks1.clock.elapsedMs >= 69000, `${ctx.screens.top()?.id} ${ks1.clock.elapsedMs}`);
    press(0, 'jump');
    const rk = await erdkunde;
    assert('Erdkunde result: graded, rewarded and counted like any minigame', rk.id === 'erdkunde' && rk.subject === 'erdkunde' && rk.total >= 8 && rk.correct >= 1 && rk.correct < rk.total && rk.score > 0 && rk.score < 1
      && rk.grade >= 1 && rk.grade <= 6 && rk.xp > 0 && rk.moneyCents > 0 && rk.ms >= 69000 && rk.quit === false, JSON.stringify(rk));
    assert('every map and capital question went through the learning engine', learned(0) === nk + rk.total, `${learned(0)} vs ${nk + rk.total}`);
    assert('Erdkunde rewards were applied', state.players[0].xp === xpk + rk.xp && state.shared.money === moneyk + rk.moneyCents);
    assert('the grade comes from ctx.grades', rk.grade === ctx.grades.preview(0, 'erdkunde', { score: rk.score, effort: rk.effort, difficulty: 3 }).grade);
    assert('the world is back after Erdkunde', ctx.frozen === false && ctx.screens.size === 0 && !game.scene.isActive('MG_erdkunde'));
    step(5);
    assert('Erdkunde leaks nothing (display objects, textures, listeners)', JSON.stringify(snapshot()) === JSON.stringify(beforeK), `${JSON.stringify(beforeK)} -> ${JSON.stringify(snapshot())}`);

    // ---- Erdkunde: two players side by side with their own maps, capital match first ----
    const n0k = learned(0);
    const n1k = learned(1);
    const xp1k = state.players[1].xp;
    const erdkunde2 = MG.start('erdkunde', { players: [0, 1], difficulty: 4 });
    step(1);
    const ks2 = game.scene.getScene('MG_erdkunde');
    ks2.plan = { first: 'capital', second: 'wo', switchMs: 30000 };
    env.until(() => ks2.clock.phase === 'play', 400);
    assert('two players get two areas with their own maps and streams', ks2.slots.length === 2 && ks2.slots.every(s => s.mode === 'capital' && s.q && s.map) && ks2.slots[0].map !== ks2.slots[1].map && ks2.slots[0].rect.x < ks2.slots[1].rect.x && ks2.slots[0].q !== ks2.slots[1].q);
    const seenK2 = new Set();
    playErdkunde(ks2, (p, n) => p === 0 || n % 2 === 0, seenK2);
    assert('both modes were played with two players', seenK2.has('wo') && seenK2.has('capital'));
    assert('the leader is cheered before the result screen', ks2.over && ks2.banner.visible && ks2.bannerKey.key === 'minigame.erdkunde.winner' && ctx.screens.top()?.id === 'minigame' && ks2.slots[0].tally.correct > ks2.slots[1].tally.correct);
    env.until(() => ctx.screens.top()?.id === 'minigameResult', 200);
    assert('the cheer ends in the result screen', ctx.screens.top()?.id === 'minigameResult');
    step(2);
    press(1, 'interact');
    const r2k = await erdkunde2;
    assert('both players get a full, own result (the lead is only cosmetic)', r2k.perPlayer.length === 2 && r2k.perPlayer[0].score > r2k.perPlayer[1].score
      && r2k.perPlayer.every(p => p.xp > 0 && p.effort > 0.5) && r2k.total === ks2.slots[0].tally.total + ks2.slots[1].tally.total);
    assert('each player was learned separately and paid', learned(0) === n0k + ks2.slots[0].tally.total && learned(1) === n1k + ks2.slots[1].tally.total && state.players[1].xp === xp1k + r2k.perPlayer[1].xp);
    assert('the world is restored after two-player Erdkunde', ctx.frozen === false && ctx.screens.size === 0 && !game.scene.isActive('MG_erdkunde'));
    step(5);
    assert('two-player Erdkunde leaks nothing', JSON.stringify(snapshot()) === JSON.stringify(beforeK), `${JSON.stringify(beforeK)} -> ${JSON.stringify(snapshot())}`);

    // ---- Erdkunde: the plain-choice fallback for unmapped items, quitting still works ----
    const quitErdkunde = MG.start('erdkunde', { players: [0] });
    step(1);
    const ks3 = game.scene.getScene('MG_erdkunde');
    ks3.plan = { first: 'capital', second: 'capital', switchMs: 1000 };
    env.until(() => ks3.clock.phase === 'play', 400);
    const realRandom = Math.random;
    Math.random = () => 0;
    const plainQ = ks3.nextQuestion(ks3.slots[0], 'capital');
    Math.random = realRandom;
    assert('an unmapped geo or karte item falls back to plain choice rendering', !ks3.info.has(plainQ.id) && plainQ.type === 'choice' && plainQ.tags.some(t => ks3.def.options.tags.includes(t)));
    press(0, 'pause');
    ctx.screens.top().menu.rows.find(r => r.items[0].label() === ctx.t('minigame.quit')).items[0].on();
    const rqk = await quitErdkunde;
    assert('quitting Erdkunde resolves without rewards and restores the world', rqk.quit === true && rqk.xp === 0 && ctx.frozen === false && ctx.minigames.active === null);
    // ---- Science: Sortier-Labor, Stromkreis-Tüftler and the Quick-Quiz between the puzzles ----
    const by = id => ctx.learning.next('science', { player: 0, filter: q => q.id === id });
    const startScience = async (players, plan, difficulty = 3) => {
      const run = MG.start('science', { players, difficulty });
      step(1);
      const scene = game.scene.getScene('MG_science');
      scene.plan = plan;
      return { run, scene };
    };
    // Plays the tasks like a player: a sorting set card by card (one wrong card for a mistake), the circuit by picking the
    // parts, a Quick-Quiz with the number keys. Player p answers `right(p, n)` correctly (n = tasks answered so far).
    const playScience = (scene, right, seen, { watch } = {}) => {
      for (let f = 0; f < 6000 && ctx.screens.top()?.id === 'minigame' && !scene.over; f++) {
        for (const slot of scene.slots) {
          if (slot.kind) seen.add(slot.kind);
          if (!slot.q) continue;
          const ok = right(slot.index, slot.tally.total);
          if (slot.kind === 'quiz') {
            if (!slot.panel.locked) {
              const good = slot.q.answers.findIndex(a => a.correct);
              intents[slot.index].answer = 1 + (ok ? good : (good + 1) % slot.q.answers.length);
            }
          } else if (slot.locked) {
            continue;
          } else if (slot.kind === 'sort') {
            const item = slot.order[slot.pos];
            const bin = slot.set.cats.findIndex(c => c.id === slot.set.items[item].cat);
            slot.lab.onBin(ok || slot.pos > 0 ? bin : (bin + 1) % slot.set.cats.length);
          } else {
            const id = ok ? slot.fix.find(x => !slot.fixed.includes(x)) : slot.cells.find(c => !slot.fix.includes(c.id)).id;
            slot.board.onPick(slot.cells.findIndex(c => c.id === id));
          }
        }
        watch?.();
        step(1);
        for (const slot of scene.slots) intents[slot.index].answer = 0;
      }
    };
    const beforeS = snapshot();
    const nS = learned(0);

    // the input methods of the sorting game: cursor, number key, tap and drag
    const sci1 = await startScience([0], { first: 'sort', second: 'sort', switchMs: 30000 });
    const sciRun1 = sci1.run;
    const ss = sci1.scene;
    assert('the Science scene shows its title and instructions during the countdown', ss.title.text === ctx.t('minigame.science.title') && ss.help.visible && ss.help.text.length > 10);
    env.until(() => ss.clock.phase === 'play', 400);
    const sl = ss.slots[0];
    assert('Sortier-Labor starts with a card, bins and the question', sl.kind === 'sort' && sl.lab.card.visible && sl.lab.word.text === sl.set.items[sl.order[0]].text && sl.lab.trays.filter(t => t.tray.visible).length === sl.set.cats.length && sl.tag.text === ctx.t('minigame.science.mode.sort'));
    const total1 = sl.set.items.length;
    intents[0].move.x = 1; step(1); intents[0].move.x = 0; step(1);
    assert('the arrow keys move the bin cursor', sl.lab.focus === 1);
    press(0, 'jump');
    assert('confirm puts the card into the focused bin', sl.pos === 1 && sl.resp[sl.order[0]] === sl.set.cats[1].id && sl.lab.levels[1] === 1);
    intents[0].answer = 2; step(1); intents[0].answer = 0; step(1);
    assert('a number key picks the bin directly', sl.pos === 2 && sl.resp[sl.order[1]] === sl.set.cats[1].id);
    sl.lab.tap(0);
    assert('a tap on a bin drops the card there', sl.pos === 3 && sl.resp[sl.order[2]] === sl.set.cats[0].id);
    const r1 = sl.lab.binRects[1];
    sl.lab.card.emit('drag', null, r1.x + r1.w / 2, r1.y + r1.h / 2);
    sl.lab.card.emit('dragend');
    assert('dragging the card over a bin drops it there', sl.pos === 4 && sl.resp[sl.order[3]] === sl.set.cats[1].id);
    sl.lab.card.emit('drag', null, 5, 5);
    sl.lab.card.emit('dragend');
    assert('dropping the card outside every bin sends it back', sl.pos === 4 && sl.lab.card.x === sl.lab.home.x && sl.lab.card.y === sl.lab.home.y);
    while (sl.pos < total1) { const it = sl.order[sl.pos]; sl.lab.onBin(sl.set.cats.findIndex(c => c.id === sl.set.items[it].cat)); }
    assert('the set is judged once, by the engine, after the last card', sl.tally.total === 1 && learned(0) === nS + 1 && sl.locked && !sl.lab.card.visible && sl.fb !== null && sl.note.text.length > 5);
    assert('the bins show green or amber after the judging', sl.lab.bad !== null && sl.lab.bad.length === sl.set.cats.length);
    ctx.i18n.set('en');
    assert('a language switch re-translates tag, question and note', sl.tag.text === ctx.t('minigame.science.mode.sort') && sl.lab.question.text === ctx.learning.localize(sl.q, 'en').q);
    ctx.i18n.set('de');
    press(0, 'pause');
    ctx.screens.top().menu.rows.find(r => r.items[0].label() === ctx.t('minigame.quit')).items[0].on();
    const rqs = await sciRun1;
    assert('quitting Science resolves without rewards and restores the world', rqs.quit === true && rqs.xp === 0 && ctx.frozen === false && ctx.minigames.active === null);

    // the circuit puzzle by hand: two repairs, a lit bulb, a wrong pick that explains why
    const sci2 = await startScience([0], { first: 'circuit', second: 'circuit', switchMs: 30000 });
    const sc2 = sci2.scene;
    sc2.nextQuestion = (slot, kind) => (kind === 'circuit' ? by('sc-062') : by('sc-003'));
    env.until(() => sc2.clock.phase === 'play', 400);
    const cl = sc2.slots[0];
    assert('Stromkreis-Tüftler draws the loop with a dark bulb and labels', cl.kind === 'circuit' && cl.board.cells.length === 4 && !cl.board.lit && !cl.board.glow[0].visible && cl.board.labels[0].text.includes(ctx.t('minigame.science.cell.battery')) && !cl.lab.card.visible);
    intents[0].move.x = 1; step(1); intents[0].move.x = 0; step(1);
    assert('the cursor moves along the loop', cl.board.focus === 1);
    const nC = learned(0);
    press(0, 'jump');
    assert('picking a needed repair closes that switch but the bulb stays dark', cl.fixed.length === 1 && cl.cells[1].state === 'closed' && !cl.board.lit && cl.note.text === ctx.t('minigame.science.circuit.partial') && learned(0) === nC);
    intents[0].answer = 4; step(1); intents[0].answer = 0; step(1);
    assert('the last repair lights the bulb: glow, current and one right answer for the engine', cl.board.lit && cl.board.glow[0].visible && cl.board.dots[0].visible && cl.fb?.ok === true && cl.tally.correct === 1 && learned(0) === nC + 1 && cl.locked);
    step(30);
    assert('the current flows while the bulb is lit', cl.board.dots[0].x !== 0 || cl.board.dots[0].y !== 0);
    sc2.nextQuestion = () => by('sc-060');
    env.until(() => cl.wait <= 0 && !cl.locked, 600);
    assert('after the pause the next puzzle comes: one repair (the gap)', cl.kind === 'circuit' && !cl.locked && cl.fixed.length === 0 && !cl.board.lit && cl.q.id === 'sc-060' && cl.fix.join() === 'c2');
    const nC2 = learned(0);
    cl.board.onPick(0);
    assert('a wrong pick ends the puzzle: why the current cannot flow, the explanation and the solution', cl.fb?.ok === false && cl.tally.total === 2 && learned(0) === nC2 + 1 && cl.note.text.includes(ctx.t('minigame.science.why.battery')) && cl.note.text.includes(ctx.learning.localize(cl.q).explain) && cl.board.lit && cl.board.cells[2].kind === 'wire');
    ctx.i18n.set('en');
    assert('the note and the labels follow a language switch', cl.note.text.includes(ctx.t('minigame.science.why.battery')) && cl.board.labels[0].text.includes(ctx.t('minigame.science.cell.battery')));
    ctx.i18n.set('de');
    // Quick-Quiz after the puzzles: a wrong answer shows the right one, the explanation and the fun fact
    sc2.nextQuestion = () => by('sc-003');
    cl.since = sc2.def.options.quizEvery;
    cl.wait = 1;
    step(3);
    assert('after enough puzzles a Quick-Quiz question appears in the answer panel', cl.kind === 'quiz' && cl.panel.q?.id === 'sc-003' && cl.panel.rows[0].bg.visible && !cl.board.labels[0].visible && cl.since === 0 && cl.panel.back.visible);
    const goodS = cl.q.answers.findIndex(a => a.correct);
    intents[0].answer = 1 + (goodS + 1) % cl.q.answers.length; step(1); intents[0].answer = 0; step(1);
    assert('a wrong Quick-Quiz answer: correct answer, explanation and fun fact', cl.panel.fb?.ok === false && cl.panel.note.text.includes(ctx.learning.localize(cl.q).fact) && cl.panel.note.text.includes(ctx.learning.localize(cl.q).explain) && cl.tally.total === 3);
    press(0, 'pause');
    ctx.screens.top().menu.rows.find(r => r.items[0].label() === ctx.t('minigame.quit')).items[0].on();
    await sci2.run;
    delete sc2.nextQuestion; // the scene instance is reused by the next run
    step(5);
    assert('Science leaks nothing after the hand-played runs', JSON.stringify(snapshot()) === JSON.stringify(beforeS), `${JSON.stringify(beforeS)} -> ${JSON.stringify(snapshot())}`);

    // a whole run: sorting first, then circuits, with Quick-Quiz questions between
    const nW = learned(0);
    const xpW = state.players[0].xp;
    const moneyW = state.shared.money;
    const sci3 = await startScience([0], { first: 'sort', second: 'circuit', switchMs: 30000 }, 3);
    const sc3 = sci3.scene;
    env.until(() => sc3.clock.phase === 'play', 400);
    const seenS = new Set();
    let litChecked = false;
    let wrongChecked = false;
    playScience(sc3, (p, n) => n % 4 !== 3, seenS, {
      watch: () => {
        const slot = sc3.slots[0];
        if (slot.kind !== 'circuit' || !slot.fb) return;
        if (slot.fb.ok && !litChecked) { litChecked = true; assert('a solved circuit lights the bulb with a glow', slot.board.lit && slot.board.glow[0].visible); }
        if (!slot.fb.ok && !wrongChecked) { wrongChecked = true; assert('a wrong circuit pick explains and still shows the working circuit', slot.why !== null && slot.board.lit && slot.note.text.length > 20); }
      }
    });
    assert('both modes and the Quick-Quiz were played in one run', seenS.has('sort') && seenS.has('circuit') && seenS.has('quiz'), [...seenS].join());
    step(2);
    assert('the round ended on the result screen after about 70 s', ctx.screens.top()?.id === 'minigameResult' && sc3.clock.phase === 'done' && sc3.clock.elapsedMs >= 69000, `${ctx.screens.top()?.id} ${sc3.clock.elapsedMs}`);
    press(0, 'jump');
    const rs = await sci3.run;
    assert('Science result: graded, rewarded and counted like any minigame', rs.id === 'science' && rs.subject === 'science' && rs.total >= 8 && rs.correct >= 1 && rs.correct < rs.total && rs.score > 0 && rs.score < 1
      && rs.grade >= 1 && rs.grade <= 6 && rs.xp > 0 && rs.moneyCents > 0 && rs.ms >= 69000 && rs.quit === false, JSON.stringify(rs));
    assert('every sorted set, circuit and quiz question went through the learning engine', learned(0) === nW + rs.total, `${learned(0)} vs ${nW + rs.total}`);
    assert('Science rewards were applied', state.players[0].xp === xpW + rs.xp && state.shared.money === moneyW + rs.moneyCents);
    assert('the grade comes from ctx.grades', rs.grade === ctx.grades.preview(0, 'science', { score: rs.score, effort: rs.effort, difficulty: 3 }).grade);
    assert('the world is back after Science', ctx.frozen === false && ctx.screens.size === 0 && !game.scene.isActive('MG_science'));
    step(5);
    assert('a whole Science run leaks nothing (display objects, textures, listeners)', JSON.stringify(snapshot()) === JSON.stringify(beforeS), `${JSON.stringify(beforeS)} -> ${JSON.stringify(snapshot())}`);

    // two players side by side, circuits first
    const n0S = learned(0);
    const n1S = learned(1);
    const xp1S = state.players[1].xp;
    const sci4 = await startScience([0, 1], { first: 'circuit', second: 'sort', switchMs: 30000 }, 4);
    const sc4 = sci4.scene;
    env.until(() => sc4.clock.phase === 'play', 400);
    assert('two players get two areas with their own labs and streams', sc4.slots.length === 2 && sc4.slots.every(s => s.kind === 'circuit' && s.q) && sc4.slots[0].board !== sc4.slots[1].board && sc4.slots[0].rect.x < sc4.slots[1].rect.x);
    const seenS2 = new Set();
    playScience(sc4, (p, n) => p === 0 || n % 2 === 0, seenS2);
    assert('both modes were played with two players', seenS2.has('sort') && seenS2.has('circuit'));
    assert('the leader is cheered before the result screen', sc4.over && sc4.banner.visible && sc4.bannerKey.key === 'minigame.science.winner' && ctx.screens.top()?.id === 'minigame' && sc4.slots[0].tally.correct > sc4.slots[1].tally.correct);
    env.until(() => ctx.screens.top()?.id === 'minigameResult', 200);
    step(2);
    press(1, 'interact');
    const r4 = await sci4.run;
    assert('both players get a full, own result (the lead is only cosmetic)', r4.perPlayer.length === 2 && r4.perPlayer[0].score > r4.perPlayer[1].score
      && r4.perPlayer.every(p => p.xp > 0 && p.effort > 0.5) && r4.total === sc4.slots[0].tally.total + sc4.slots[1].tally.total);
    assert('each player was learned separately and paid', learned(0) === n0S + sc4.slots[0].tally.total && learned(1) === n1S + sc4.slots[1].tally.total && state.players[1].xp === xp1S + r4.perPlayer[1].xp);
    assert('the world is restored after two-player Science', ctx.frozen === false && ctx.screens.size === 0 && !game.scene.isActive('MG_science'));
    step(5);
    assert('two-player Science leaks nothing', JSON.stringify(snapshot()) === JSON.stringify(beforeS), `${JSON.stringify(beforeS)} -> ${JSON.stringify(snapshot())}`);
    // ---- Musik: the rhythm game, played silently with the beat from the round clock ----
    const perks0 = ctx.players[0].perks;
    ctx.players[0].perks = { ...perks0, musicArtBonus: 0 }; // an earlier scenario may have left a Jonas player
    const beforeMu = snapshot();
    const noteEvents = [];
    const beatEvents = [];
    const sfxEvents = [];
    ctx.events.on('music:note', e => noteEvents.push(e));
    ctx.events.on('music:beat', e => beatEvents.push(e));
    ctx.events.on('sfx:play', e => sfxEvents.push(e));
    const nextNote = slot => {
      let best = -1;
      for (let l = 0; l < slot.track.queue.length; l++) {
        const i = slot.track.queue[l][slot.track.head[l]];
        if (i !== undefined && (best < 0 || i < best)) best = i;
      }
      return best;
    };
    // Plays the notes like a player through the intents: the number key of the lane when the note is due (`late(p)` ms
    // after its time); notes for which skip(p, i) is true are left out. Runs until the round is over or stop() is true.
    const playMusik = (scene, { skip = () => false, late = () => 0, stop = () => false } = {}) => {
      for (let f = 0; f < 4200 && ctx.screens.top()?.id === 'minigame' && !scene.over && !stop(); f++) {
        const now = scene.clock.elapsedMs;
        for (const slot of scene.slots) {
          const { track } = slot;
          for (let l = 0; l < track.queue.length; l++) {
            const i = track.queue[l][track.head[l]];
            if (i !== undefined && !skip(slot.index, i) && now >= track.t[i] + late(slot.index)) { intents[slot.index].answer = l + 1; break; }
          }
        }
        step(1);
        for (const slot of scene.slots) intents[slot.index].answer = 0;
      }
    };
    const xpMu = state.players[0].xp;
    const moneyMu = state.shared.money;
    const runMu = MG.start('musik', { players: [0], difficulty: 3 });
    step(1);
    const ms = game.scene.getScene('MG_musik');
    assert('the Musik scene shows its title and instructions during the countdown', ms.title.text === ctx.t('minigame.musik.title') && ms.help.visible && ms.help.text.includes('A S W D'));
    env.until(() => ms.clock.phase === 'play', 400);
    const m0 = ms.slots[0];
    assert('difficulty 3 plays the medium chart: four lanes, notes spread over the round, ring and pads on the stage', m0.tier === 'medium' && m0.track.queue.length === 4 && m0.track.n >= 80 && m0.track.t.at(-1) <= 59100 && m0.stage.pad.length === 4 && m0.stage.ring.visible);
    assert('the stage shows the registry song and no bonus for a kid without the perk', ms.songs.songs.includes(ms.song) && m0.stage.songText.text === ctx.t(`minigame.musik.song.${ms.song.id}`) && m0.bonus === 0 && m0.stage.bonusText.text === '');
    const ringScales = new Set();
    let maxVisible = 0;
    const sample = () => {
      ringScales.add(Math.round(m0.stage.ring.scale * 100));
      maxVisible = Math.max(maxVisible, m0.stage.notes.filter(n => n.box.visible).length);
      return ms.clock.elapsedMs > 12000;
    };
    playMusik(ms, { skip: (p, i) => i % 5 === 4, stop: sample });
    assert('good play hits notes, builds a combo and shows it', m0.track.counts.perfect > 10 && m0.scorer.best >= 3 && m0.stage.comboText.text === (m0.scorer.combo >= 3 ? ctx.t('minigame.musik.combo', { n: m0.scorer.combo }) : '') && m0.scorer.points > 1000, `${m0.scorer.best} ${m0.scorer.combo} ${m0.scorer.points}`);
    assert('every hit counts as a right answer in the tally, every missed note as a wrong one', m0.tally.correct === m0.track.counts.perfect + m0.track.counts.good && m0.tally.total === m0.track.judged && m0.track.counts.miss > 0 && m0.tally.total - m0.tally.correct === m0.track.counts.miss);
    assert('the score text shows the points', m0.score.text === ctx.t('minigame.musik.points', { n: m0.scorer.points }));
    assert('the visual metronome pulses with the beat and the notes stay within the pool', ringScales.size >= 8 && maxVisible >= 3 && maxVisible <= 16, `${ringScales.size} ${maxVisible}`);
    assert('hooks for the audio epic: music:note per judged note, music:beat per beat, sfx:play names',
      noteEvents.length === m0.tally.total && noteEvents.every(e => e.pitch >= 40 && ['perfect', 'good', 'miss'].includes(e.grade) && e.song === ms.song.id && e.tier === 'medium')
      && beatEvents.length >= 12 * ms.song.bpm / 60 - 2 && beatEvents.every((e, i) => e.beat === beatEvents[0].beat + i) && ['musik.perfect', 'musik.miss'].every(n => sfxEvents.some(e => e.name === n)), `${noteEvents.length} ${m0.tally.total} ${beatEvents.length}`);
    // pause: the song stands still
    const tMu = ms.clock.elapsedMs;
    const pointsMu = m0.scorer.points;
    press(0, 'pause');
    step(40);
    assert('pausing stops the beat and the notes', ctx.screens.top()?.id === 'pause' && ms.clock.elapsedMs === tMu && m0.scorer.points === pointsMu);
    press(0, 'pause');
    // a tap on a lane plays it too
    let tapped = false;
    for (let f = 0; f < 600 && !tapped; f++) {
      const i = nextNote(m0);
      if (ms.clock.elapsedMs >= m0.track.t[i]) {
        const before = m0.track.counts.perfect + m0.track.counts.good;
        m0.stage.onTap(m0.track.lane[i]);
        tapped = m0.track.counts.perfect + m0.track.counts.good === before + 1;
      } else step(1);
    }
    assert('tapping the lane in time hits the note', tapped);
    ctx.i18n.set('en');
    step(2);
    assert('a language switch re-translates the Musik texts', m0.score.text.startsWith('Points') && m0.stage.songText.text === ctx.t(`minigame.musik.song.${ms.song.id}`));
    ctx.i18n.set('de');
    playMusik(ms, { skip: (p, i) => i % 5 === 4 });
    step(2);
    assert('the round ends on the timer at 60 s and shows the result', ctx.screens.top()?.id === 'minigameResult' && ms.clock.phase === 'done' && ms.clock.elapsedMs >= 59000, `${ctx.screens.top()?.id} ${ms.clock.elapsedMs}`);
    press(0, 'jump');
    const rmu = await runMu;
    assert('Musik result: graded, rewarded and counted like any minigame (share of notes hit)', rmu.id === 'musik' && rmu.subject === 'musik' && rmu.total >= 60 && rmu.score > 0.6 && rmu.score < 0.95 && rmu.effort === 1 && rmu.stats.bestStreak >= 3
      && rmu.grade >= 1 && rmu.grade <= 6 && rmu.xp > 0 && rmu.moneyCents > 0 && rmu.ms >= 59000 && rmu.quit === false, JSON.stringify(rmu));
    assert('the grade comes from ctx.grades', rmu.grade === ctx.grades.preview(0, 'musik', { score: rmu.score, effort: rmu.effort, difficulty: 3 }).grade);
    assert('Musik rewards were applied', state.players[0].xp === xpMu + rmu.xp && state.shared.money === moneyMu + rmu.moneyCents);
    assert('the world is back after Musik', ctx.frozen === false && ctx.screens.size === 0 && !game.scene.isActive('MG_musik'));
    step(5);
    assert('a whole Musik run leaks nothing', JSON.stringify(snapshot()) === JSON.stringify(beforeMu), `${JSON.stringify(beforeMu)} -> ${JSON.stringify(snapshot())}`);

    // two players, the second with the Jonas perk: the same slightly late timing hits more for her and she is cheered
    const perks1 = ctx.players[1].perks;
    ctx.players[1].perks = { ...perks1, musicArtBonus: 0.3 };
    const duoMu = MG.start('musik', { players: [0, 1], difficulty: 4 });
    step(1);
    const md = game.scene.getScene('MG_musik');
    env.until(() => md.clock.phase === 'play', 400);
    const [a, b] = md.slots;
    assert('two players get two stages side by side with their own charts', md.slots.length === 2 && a.stage.rect.x < b.stage.rect.x && a.track !== b.track && a.tier === 'hard' && b.tier === 'hard');
    assert('the Jonas perk widens the hit windows and shows the talent bonus', a.track.win.good < b.track.win.good && Math.abs(b.track.win.good / a.track.win.good - 1.3) < 1e-9 && b.stage.bonusText.text === ctx.t('minigame.musicart.bonus', { n: 30 }) && a.stage.bonusText.text === '');
    playMusik(md, { late: () => 150 });
    assert('the same timing: more hits with the wider windows, then the leader is cheered', b.tally.correct > a.tally.correct && md.over && md.banner.visible && md.bannerKey.key === 'minigame.musik.winner' && ctx.screens.top()?.id === 'minigame', `${a.tally.correct} ${b.tally.correct}`);
    assert('the perk also multiplies the points', b.scorer.bonus === 0.3 && b.scorer.points > a.scorer.points);
    env.until(() => ctx.screens.top()?.id === 'minigameResult', 200);
    step(2);
    press(1, 'interact');
    const r2mu = await duoMu;
    ctx.players[1].perks = perks1;
    assert('both players get a full, own result; the perk shows in the better score', r2mu.perPlayer.length === 2 && r2mu.perPlayer[1].score > r2mu.perPlayer[0].score && r2mu.perPlayer.every(p => p.xp > 0 && p.effort === 1));
    assert('the world is restored after two-player Musik', ctx.frozen === false && ctx.screens.size === 0 && !game.scene.isActive('MG_musik'));
    step(5);
    assert('two-player Musik leaks nothing', JSON.stringify(snapshot()) === JSON.stringify(beforeMu), `${JSON.stringify(beforeMu)} -> ${JSON.stringify(snapshot())}`);

    // ---- Kunst: Pixel-Muster merken ----
    const beforeKu = snapshot();
    const swatchOf = (slot, color) => slot.palette.indexOf(color);
    // Paints cells through the mouse path: `wrong` cells get another colour, cells from `until` on stay empty.
    const paintCopy = (slot, { wrong = [], until = Infinity } = {}) => {
      const n = slot.pattern.size;
      for (let i = 0; i < slot.pattern.cells.length && i < until; i++) {
        const want = slot.pattern.cells[i];
        const color = wrong.includes(i) ? slot.palette.find(c => c !== want) : want;
        slot.easel.onSwatch(swatchOf(slot, color));
        slot.easel.onCell(i % n, Math.floor(i / n), false);
      }
    };
    const untilPhase = (slot, phase) => env.until(() => slot.phase === phase, 900);
    const xpKu = state.players[0].xp;
    const runKu = MG.start('kunst', { players: [0], difficulty: 1 });
    step(1);
    const ks = game.scene.getScene('MG_kunst');
    assert('the Kunst scene shows its title and instructions during the countdown', ks.title.text === ctx.t('minigame.kunst.title') && ks.help.visible && ks.help.text.length > 20);
    env.until(() => ks.clock.phase === 'play', 400);
    const ku0 = ks.slots[0];
    assert('difficulty 1: a 4x4 pattern is shown with a time bar for about 6.5 s', ku0.phase === 'show' && ku0.pattern.size === 4 && ku0.pattern.colors.length === 2 && ku0.showMs === 6500 && ku0.easel.barFill.visible && ku0.easel.msg.text === ctx.t('minigame.kunst.memorize') && ku0.model === null);
    step(60);
    assert('the memorize bar shrinks with the round clock', ku0.easel.barFill.scaleX < 0.95 && ku0.easel.barFill.scaleX > 0.5 && ku0.t > 900);
    ctx.i18n.set('en');
    step(1);
    assert('a language switch re-translates the line above the easel', ku0.easel.msg.text === ctx.t('minigame.kunst.memorize') && ku0.easel.sub.text === ctx.t('minigame.kunst.skip'));
    ctx.i18n.set('de');
    untilPhase(ku0, 'paint');
    assert('the pattern is hidden for painting: an empty canvas, the palette offers its colours', ku0.phase === 'paint' && ku0.model.cells.every(c => c === -1) && ku0.pattern.colors.every(c => ku0.palette.includes(c)) && !ku0.easel.barFill.visible && ku0.easel.canvasZone.visible && ku0.easel.zones.filter(z => z.visible).length === ku0.palette.length);
    // the keyboard: pick a colour with the number key, paint with confirm, a stroke by holding confirm while moving
    const patK = ku0.pattern;
    intents[0].answer = swatchOf(ku0, patK.cells[0]) + 1; step(1); intents[0].answer = 0; step(1);
    press(0, 'jump');
    assert('number key picks the colour and confirm paints the cell under the cursor', ku0.model.color === swatchOf(ku0, patK.cells[0]) && ku0.model.cells[0] === patK.cells[0]);
    intents[0].jump = true; step(1);
    for (let i = 0; i < 2; i++) { intents[0].move.x = 1; step(1); intents[0].move.x = 0; step(1); }
    intents[0].jump = false; step(1);
    assert('holding confirm while moving draws a stroke', ku0.model.cells[1] === ku0.palette[ku0.model.color] && ku0.model.cells[2] === ku0.palette[ku0.model.color] && ku0.model.cx === 2);
    // mouse path for the rest, leaving the last cell empty and cell 5 wrong
    paintCopy(ku0, { wrong: [5], until: ku0.pattern.cells.length - 1 });
    assert('mouse painting fills the canvas', ku0.model.painted === ku0.pattern.cells.length - 1);
    // finish through the keyboard: down to the palette, right to the Fertig button, confirm
    ku0.model.cx = 0;
    ku0.model.cy = 3;
    intents[0].move.y = 1; step(1); intents[0].move.y = 0; step(1);
    assert('arrow down from the last row enters the palette row', ku0.model.focus === 'palette');
    for (let i = 0; i < ku0.palette.length + 1; i++) { intents[0].move.x = 1; step(1); intents[0].move.x = 0; step(1); }
    assert('the cursor reaches the Fertig button', ku0.model.item === ku0.palette.length);
    press(0, 'jump');
    const wrongSet = new Set([5, ku0.pattern.cells.length - 1, ...[0, 1, 2].filter(i => ku0.model.cells[i] !== patK.cells[i])]);
    assert('Fertig judges the copy cell by cell: partial credit, a friendly line, the result view', ku0.phase === 'result' && ku0.tally.total === 16 && ku0.tally.correct === 16 - wrongSet.size && ku0.tally.correct >= 12 && ku0.easel.msg.text.includes(`${ku0.tally.correct} `) && ku0.easel.labels[0].visible && ku0.easel.mode === 'result', `${ku0.tally.correct}/${ku0.tally.total} ${ku0.easel.msg.text}`);
    assert('the score line counts the right cells and the level stays', ku0.score.text === ctx.t('minigame.kunst.score', { n: ku0.tally.correct }) && ku0.level === 1);
    untilPhase(ku0, 'show');
    assert('after the result the next pattern is shown', ku0.phase === 'show' && ku0.n === 2 && ku0.easel.mode === 'show');
    untilPhase(ku0, 'paint');
    // a perfect copy celebrates and the next pattern is harder
    paintCopy(ku0);
    ku0.easel.onDone();
    assert('a perfect copy: the celebration line, sparkles, level up', ku0.phase === 'result' && ku0.msg.key === 'minigame.kunst.result.perfect' && ku0.level === 2 && ks.pop.fx.emitter.getAliveParticleCount() > 5 && ku0.tally.correct === 16 - wrongSet.size + 16 && ku0.tally.total === 32);
    untilPhase(ku0, 'show');
    assert('the next pattern is a level-2 one (4x4, up to three colours)', ku0.pattern.size === 4 && ku0.pattern.colors.length >= 2 && ku0.pattern.colors.length <= 3);
    untilPhase(ku0, 'paint');
    paintCopy(ku0, { until: 8 });
    ks.clock.elapsedMs = ks.clock.durationMs - 100;
    step(12);
    assert('when the timer ends mid-painting the copy still counts as it is', ks.finished && ku0.tally.total === 48 && ku0.tally.correct < 48 && ku0.tally.correct >= 16 - wrongSet.size + 16 + 8, `${ku0.tally.correct}/${ku0.tally.total}`);
    env.until(() => ctx.screens.top()?.id === 'minigameResult', 100);
    step(2);
    press(0, 'jump');
    const rku = await runKu;
    assert('Kunst result: graded, rewarded, cell accuracy as score', rku.id === 'kunst' && rku.subject === 'kunst' && rku.correct === ku0.tally.correct && rku.total === 48 && rku.score === Math.round(ku0.tally.correct / 48 * 100) / 100 && rku.grade >= 1 && rku.grade <= 6 && rku.xp > 0 && state.players[0].xp === xpKu + rku.xp);
    assert('the grade comes from ctx.grades', rku.grade === ctx.grades.preview(0, 'kunst', { score: rku.score, effort: rku.effort, difficulty: 1 }).grade);
    assert('the world is back after Kunst', ctx.frozen === false && ctx.screens.size === 0 && !game.scene.isActive('MG_kunst'));
    step(5);
    assert('a Kunst run leaks nothing', JSON.stringify(snapshot()) === JSON.stringify(beforeKu), `${JSON.stringify(beforeKu)} -> ${JSON.stringify(snapshot())}`);

    // two players side by side, the second with the Jonas perk (longer memorize time), top difficulty
    ctx.players[1].perks = { ...perks1, musicArtBonus: 0.3 };
    const duoKu = MG.start('kunst', { players: [0, 1], difficulty: 5 });
    step(1);
    const kd = game.scene.getScene('MG_kunst');
    env.until(() => kd.clock.phase === 'play', 400);
    const [p1, p2] = kd.slots;
    assert('two players get their own easels and 7x7 patterns', kd.slots.length === 2 && p1.easel !== p2.easel && p1.easel.rect.x < p2.easel.rect.x && p1.pattern.size === 7 && p2.pattern.size === 7);
    assert('Jonas gets longer to memorize (+30%) and the talent bonus label', p1.showMs === 4500 && p2.showMs === Math.round(4500 * 1.3) && p2.bonusText.text === ctx.t('minigame.musicart.bonus', { n: 30 }) && p1.bonusText === null);
    assert('the palette has the pattern colours plus at most a decoy', p1.palette.length <= 6 && p1.pattern.colors.every(c => p1.palette.includes(c)));
    step(40);
    press(0, 'jump');
    assert('confirm ends the memorize phase early', p1.phase === 'paint' && p2.phase === 'show');
    paintCopy(p1);
    p1.easel.onDone();
    assert('player 1 finished a perfect copy while player 2 still memorizes', p1.phase === 'result' && p1.tally.correct === 49 && p2.phase === 'show' && p2.tally.total === 0);
    untilPhase(p2, 'paint');
    paintCopy(p2, { wrong: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] });
    p2.easel.onDone();
    assert('player 2 gets partial credit for 39 of 49 cells', p2.tally.correct === 39 && p2.tally.total === 49, `${p2.tally.correct}`);
    kd.clock.elapsedMs = kd.clock.durationMs - 100;
    step(12);
    assert('the leader is cheered before the result screen', kd.over && kd.banner.visible && kd.bannerKey.key === 'minigame.kunst.winner' && ctx.screens.top()?.id === 'minigame');
    env.until(() => ctx.screens.top()?.id === 'minigameResult', 200);
    step(2);
    press(1, 'interact');
    const r2ku = await duoKu;
    ctx.players[1].perks = perks1;
    ctx.players[0].perks = perks0;
    assert('both players get a full, own result', r2ku.perPlayer.length === 2 && r2ku.perPlayer[0].score > r2ku.perPlayer[1].score && r2ku.perPlayer.every(p => p.xp > 0) && r2ku.total === p1.tally.total + p2.tally.total);
    assert('the world is restored after two-player Kunst', ctx.frozen === false && ctx.screens.size === 0 && !game.scene.isActive('MG_kunst'));
    step(5);
    assert('two-player Kunst leaks nothing', JSON.stringify(snapshot()) === JSON.stringify(beforeKu), `${JSON.stringify(beforeKu)} -> ${JSON.stringify(snapshot())}`);
  }
};
