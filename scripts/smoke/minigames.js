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
    assert('demos are listed only in debug sessions, real minigames always', MG.list().length === (window.SCHULWEG_DEBUG ? 4 : 2) && MG.list().some(d => d.id === 'mathe') && MG.list().some(d => d.id === 'deutsch'));

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
  }
};
