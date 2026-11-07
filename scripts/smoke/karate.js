// Smoke scenario: the dojo and belt training (story 6.4, AD-24, AD-28). Registered in scripts/smoke/index.js.
// Through the town door into the dojo and back (nothing leaks), the sensei greets and starts the training on interact, a
// perfectly played session (through the real intents) promotes white to yellow with the cheer, a poorly played one gives points but
// no belt, the belt survives a save and load and grows Ordnung, the third session of the day closes the dojo until the next
// morning, quitting trains nothing, and two kids train side by side on their own belts.
import { CAT } from '../../physics/categories.js';

const mapBodies = gs => Phaser.Physics.Matter.Matter.Composite.allBodies(gs.matter.world.localWorld)
  .filter(b => ![CAT.STATIC, CAT.NPC, CAT.ANIMAL].includes(b.collisionFilter.category)).length;

export const karate = {
  name: 'karate',
  async run(game, assert, env) {
    const { step, until } = env;
    // a fresh single-player run: earlier scenarios may have left co-op or a restarted scene behind
    const prev = game.scene.getScene('Game');
    prev.ctx.state.dispatch('coop.set', { on: false });
    prev.scene.restart();
    step(4);
    let gs = game.scene.getScene('Game');
    let ctx = gs.ctx;
    const ui = game.scene.getScene('UI');
    ctx.input.update = () => {};
    let intents = ctx.input.intents;
    intents[0].aim = null;
    let player = ctx.players[0];
    for (const ride of [gs.bikes, gs.skateboards, gs.skates]) if (ride.isMounted(0)) ride.dismount(player);
    step(2);
    const T = t => env.h.tilePx(ctx, t);
    const cfg = gs.cache.json.get('karate');
    const kata = gs.cache.json.get('kata');
    const log = [];
    const listen = () => { for (const n of ['karate:trained', 'karate:belt', 'karate:celebrate', 'ui:toast', 'world:enter', 'world:leave']) ctx.events.on(n, e => log.push([n, e])); };
    listen();
    const of = n => log.filter(e => e[0] === n).map(e => e[1]);
    let promise = null;
    const start = ctx.minigames.start.bind(ctx.minigames);
    ctx.minigames.start = (...a) => (promise = start(...a));
        // what the dojo owns (facade, sensei, tags, graphics) rather than gs.children.length: other systems rebuild theirs on a map switch (a stolen-bike marker of an earlier scenario)
    const owned = () => gs.children.list.filter(o => o.type === 'Graphics' || ['dojo-facade', 'sensei', 'belt-tag'].includes(o.texture?.key)).length;
    const snapshot = () => ({ owned: owned(), ui: ui.children.length, scenes: game.scene.scenes.length, textures: game.textures.getTextureKeys().length, lang: ctx.events.listenerCount('lang:changed'), bodies: mapBodies(gs), pools: [...ctx.pools.byName.keys()].join() });
    const k = i => ctx.state.players[i].karate;
    const press = (i, key) => { intents[i][key] = true; step(1); intents[i][key] = false; step(1); };

    // ---- the town: dojo facade, door and sign
    const door = ctx.map.objects.find(o => o.id === 'door-dojo');
    const building = ctx.map.objects.find(o => o.type === 'dojo' && o.role === 'building');
    assert('the town has the dojo building with its sign board, a door and a sign', !!door && !!building && !!gs.dojo.facade && gs.dojo.facade.visible && gs.dojo.label.text === ctx.t('dojo.signboard') && gs.doors.list.some(d => d.o.id === 'door-dojo') && ctx.map.objects.some(o => o.id === 'dojo-sign'));
    assert('the facade covers the building and stands in front of the wall tiles', gs.dojo.facade.x === building.x * 16 && gs.dojo.facade.y === (building.y - 1) * 16 && gs.dojo.facade.depth === (building.y + building.h) * 16 && !gs.dojo.sensei.active);
    assert('every kid wears a white belt tag on the waist', ctx.karate.beltOf(0) === 'white' && gs.beltTags.tags[0].image.visible && gs.beltTags.tags[0].image.tintTopLeft === 0xf4f4f4, `${gs.beltTags.tags[0].image.tintTopLeft}`);
    assert('ctx.karate answers for the belt, points and sessions', ctx.karate.beltOf(player) === 'white' && ctx.karate.trainingPoints(0) === 0 && ctx.karate.canTrain(0) && ctx.karate.sessionsLeft(0) === cfg.training.maxSessionsPerDay);

    // ---- town -> dojo through the auto door and back: nothing leaks
    player.teleport(T(door.x + 1), T(door.y + 2));
    step(30);
    const before = snapshot();
    intents[0].move.y = -1;
    const inFrames = until(() => ctx.world.id === 'dojo', 120);
    intents[0].move.y = 0;
    step(2);
    const dojo = ctx.map;
    assert('walking into the door leads into the dojo map', inFrames >= 0 && ctx.world.id === 'dojo' && dojo.indoor && ctx.surfaces.cols === 24, `${ctx.world.id} ${inFrames}`);
    assert('world events fired in order with the entry', JSON.stringify(of('world:enter').at(-1)) === JSON.stringify({ map: 'dojo', entry: 'from-town' }) && of('world:leave').at(-1).map === 'town');
    assert('the facade is gone, the sensei stands in the pool, the interior art and the rack exist', gs.dojo.facade === null && gs.dojo.sensei.active && ctx.pools.byName.get('sensei').live() === 1 && gs.dojo.parts.length === 2);
    assert('the hint toast tells how to train', of('ui:toast').some(t => t.key === 'dojo.hint'));
    const spot = dojo.objects.find(o => o.role === 'sensei');
    assert('the sensei stands on his spot as a still NPC body', Math.hypot(gs.dojo.sensei.x - T(spot.x), gs.dojo.sensei.y - T(spot.y)) < 1 && gs.dojo.sensei.body.collisionFilter.category === CAT.NPC && gs.dojo.sensei.body.isStatic);
    step(60);
    assert('arriving does not bounce the kid back through the door', ctx.world.id === 'dojo');
    intents[0].move.y = 1;
    const outFrames = until(() => ctx.world.id === 'town', 240);
    intents[0].move.y = 0;
    step(60);
    assert('the dojo door leads back to the street in front of the building', outFrames >= 0 && ctx.world.id === 'town' && Math.abs(player.x - T(ctx.map.objects.find(o => o.id === 'from-dojo').x)) < 2 && gs.dojo.facade !== null && !gs.dojo.sensei.active);
    assert('a round trip leaks nothing', JSON.stringify(snapshot()) === JSON.stringify(before), `${JSON.stringify(before)} -> ${JSON.stringify(snapshot())}`);

    // ---- in the dojo: the greeting, then interact starts the training
    ctx.world.load('dojo', 'from-town');
    step(5);
    const sensei = gs.dojo.sensei;
    player.teleport(sensei.x, sensei.y + 40);
    step(5);
    player.teleport(sensei.x, sensei.y + 22);
    step(3);
    const greetings = Array.from({ length: cfg.sensei.lines }, (_, i) => ctx.t(`dojo.sensei.greet.${i + 1}`));
    assert('coming close, the sensei greets with a line from the data', gs.dojo.bubbles.items.some(b => b.owner === sensei && greetings.includes(b.text.text)));
    assert('the greetings are warm and about calm and respect', greetings.some(g => g.includes('Kämpfer')) && ctx.t('dojo.sensei.greet.1') === 'Ein echter Kämpfer ist der, der gar nicht kämpfen muss.');
    const xp0 = ctx.state.players[0].xp;
    const money0 = ctx.state.shared.money;
    const ordnung0 = ctx.state.players[0].attributes.ordnung;
    const beforeRun = snapshot();
    press(0, 'interact');
    assert('interact next to the sensei starts the karate minigame for this kid', !!ctx.minigames.active && ctx.minigames.active.def.id === 'karate' && ctx.minigames.active.players.join() === '0' && ctx.frozen);
    step(1);
    let scene = game.scene.getScene('MG_karate');
    until(() => scene.clock.phase === 'play', 400);
    assert('the training scene shows one stage with the kata of the white belt, five lanes and the countdown done', scene.slots.length === 1 && scene.slots[0].belt === 'white' && scene.slots[0].session.schedule.n >= 30 && scene.slots[0].stage.lanes === 5);

    // Plays every note of every slot through the real intents: press(si, k) says whether note k of slot si is played.
    const drive = (sc, plays, maxFrames = 6000) => {
      const ptr = sc.slots.map(() => 0);
      for (let f = 0; f < maxFrames && ctx.screens.top()?.id === 'minigame' && !sc.over; f++) {
        sc.slots.forEach((slot, si) => {
          const it = intents[slot.index];
          it.move.x = it.move.y = 0;
          it.kiai = false;
          it.defend = false;
          const s = slot.session.schedule;
          if (sc.clock.phase !== 'play' || ptr[si] >= s.n) return;
          const now = sc.clock.elapsedMs;
          if (now < s.t[ptr[si]] - 10) return;
          const n = ptr[si]++;
          if (!plays(si, n)) return;
          const lane = s.lane[n];
          if (lane === 0) it.move.x = -1;
          else if (lane === 4) it.move.x = 1;
          else if (lane === 2) it.kiai = true;
          else if (n % 2) it.defend = true; // every other block through the defend key
          else it.move.y = lane === 1 ? -1 : 1;
        });
        step(1);
      }
      for (const slot of sc.slots) { const it = intents[slot.index]; it.move.x = it.move.y = 0; it.kiai = false; it.defend = false; }
    };
    const finish = async sc => {
      until(() => ctx.screens.top()?.id === 'minigameResult', 600);
      const shown = sc.slots.map(s => ({ banner: s.stage.banner.visible && s.stage.banner.text, outcome: s.outcome }));
      step(2);
      intents[0].interact = true; // the confirm press closes the result screen; the sensei must not take it as a new training
      step(1);
      intents[0].interact = false;
      const result = await promise;
      return { result, shown };
    };

    // ---- a perfect session promotes white to yellow
    drive(scene, () => true);
    assert('every note was played perfectly, combo and Fokus are full', scene.slots[0].session.track.counts.miss === 0 && scene.slots[0].session.track.counts.good === 0 && scene.slots[0].session.fokus.calm && scene.slots[0].session.scorer.best === scene.slots[0].session.schedule.n);
    assert('the exam banner appears and the belt is promoted at once', scene.over && scene.slots[0].stage.banner.visible && scene.slots[0].outcome.promote === 'yellow' && k(0).belt === 'yellow' && scene.slots[0].stage.banner.text.includes(ctx.t('karate.belt.yellow')), scene.slots[0].stage.banner.text);
    const first = await finish(scene);
    assert('the result is graded and rewarded like any minigame (a perfect round)', first.result.id === 'karate' && first.result.score === 1 && first.result.xp === 35 && first.result.moneyCents === 40 && ctx.state.players[0].xp === xp0 + 35 && ctx.state.shared.money === money0 + 40, JSON.stringify(first.result));
    assert('the belt and points are in the state; the session counts', k(0).belt === 'yellow' && k(0).points >= cfg.belts[1].trainingPoints && k(0).sessions === 1 && k(0).trainedToday === 1 && k(0).lastExamDay === 1, JSON.stringify(k(0)));
    assert('karate:trained and karate:belt fired for this kid', of('karate:trained').length === 1 && of('karate:trained')[0].player === 0 && of('karate:trained')[0].score === 1 && JSON.stringify(of('karate:belt')) === JSON.stringify([{ player: 0, belt: 'yellow' }]));
    assert('Ordnung grew through the growth hook', ctx.state.players[0].attributes.ordnung > ordnung0 && ctx.state.players[0].attributes.ordnung === ordnung0 + 1, `${ordnung0} -> ${ctx.state.players[0].attributes.ordnung}`);
    assert('the world is back; the session leaked nothing', ctx.frozen === false && ctx.screens.size === 0 && !game.scene.isActive('MG_karate') && JSON.stringify(snapshot()) === JSON.stringify(beforeRun), `${JSON.stringify(beforeRun)} -> ${JSON.stringify(snapshot())}`);
    step(3);
    assert('then the cheer: the funny belt line as a toast and confetti over the kid', of('ui:toast').at(-1).key === 'karate.belt.yellow.line' && ui.hud.get('toast').text.text === ctx.t('karate.belt.yellow.line') && ctx.t('karate.belt.yellow.line') === 'Neuer Gürtel! Du bist jetzt gelb – wie eine Banane, aber mit Stil!' && ctx.particles.emitters.confetti.emitter.getAliveParticleCount() > 0 && of('karate:celebrate').length === 1);
    assert('the sensei names what the belt unlocks', gs.dojo.bubbles.items.some(b => b.owner === sensei && b.text.text === ctx.t('karate.unlock.yellow')));
    assert('the belt tag turns yellow and the rack marks the belt', gs.beltTags.tags[0].image.tintTopLeft === 0xffd23f && ctx.karate.beltOf(0) === 'yellow' && ctx.karate.statsOf(0).dodgeDistance > cfg.belts[0].dodgeDistance);
    intents[0].pause = true;
    step(1);
    intents[0].pause = false;
    assert('the pause menu lists the belt', ctx.screens.top()?.id === 'pause' && ctx.screens.top().belts.text.includes(ctx.t('karate.belt.yellow')), ctx.screens.top()?.belts?.text);
    press(0, 'pause');
    assert('and closes again', ctx.screens.top()?.id !== 'pause');

    // ---- a poor session: points, no promotion
    const points1 = k(0).points;
    press(0, 'interact');
    step(1);
    scene = game.scene.getScene('MG_karate');
    assert('the kata of the yellow belt are faster than the white ones', scene.slots[0].belt === 'yellow' && scene.slots[0].session.schedule.stages[0].stepMs < kata.belts.white.kata[0].speed * 60000 / kata.belts.white.stepsPerMinute);
    until(() => scene.clock.phase === 'play', 400);
    drive(scene, (si, n) => n % 3 === 0);
    const second = await finish(scene);
    assert('poor play still earns training points, but no belt and no punishment', k(0).belt === 'yellow' && k(0).points > points1 && k(0).points - points1 < 60 && second.shown[0].outcome.promote === null && second.result.score > 0.1 && second.result.score < 0.5 && k(0).sessions === 2, JSON.stringify(second.shown[0].outcome));
    assert('the banner stays friendly', !/verloren|versagt|schlecht|failed/i.test(second.shown[0].banner) && second.shown[0].banner.includes(ctx.t('karate.exam.points', { n: second.shown[0].outcome.points })), second.shown[0].banner);

    // ---- the belt survives a save and load
    const saved = { belt: k(0).belt, points: k(0).points, sessions: k(0).sessions };
    assert('saved to a slot', ctx.saves.save(3));
    ctx.state.dispatch('karate.addPoints', { player: 0, amount: 7, day: 1 });
    assert('loaded again: belt, points and sessions are back', ctx.saves.load(3) && k(0).belt === saved.belt && k(0).points === saved.points && k(0).sessions === saved.sessions && ctx.karate.beltOf(0) === 'yellow');
    ctx.saves.delete(3);

    // ---- the third session closes the dojo for the day
    press(0, 'interact');
    step(1);
    scene = game.scene.getScene('MG_karate');
    until(() => scene.clock.phase === 'play', 400);
    drive(scene, (si, n) => n % 2 === 0);
    await finish(scene);
    assert('the daily limit is reached after the third session', k(0).trainedToday === cfg.training.maxSessionsPerDay && !ctx.karate.canTrain(0) && ctx.karate.sessionsLeft(0) === 0);
    const started = of('karate:trained').length;
    press(0, 'interact');
    step(2);
    assert('a gentle message instead of a fourth session: no minigame, the sensei sends the kid home to sleep', !ctx.minigames.active && !ctx.frozen && of('karate:trained').length === started && [1, 2].some(i => gs.dojo.bubbles.items.some(b => b.owner === sensei && b.text.text === ctx.t(`dojo.sensei.closed.${i}`))));

    // ---- next morning the dojo opens again; quitting trains nothing
    for (let i = 0; i < 8 && ctx.day.phase !== 'morning'; i++) ctx.day.advance('smoke');
    step(2);
    assert('a new morning (freeplay day counter) gives the sessions back', ctx.day.phase === 'morning' && ctx.karate.canTrain(0) && ctx.karate.sessionsLeft(0) === cfg.training.maxSessionsPerDay);
    ctx.state.dispatch('flags.set', { key: 'smokeNoop' });
    player.teleport(sensei.x, sensei.y + 22);
    step(3);
    press(0, 'interact');
    step(1);
    scene = game.scene.getScene('MG_karate');
    until(() => scene.clock.phase === 'play', 400);
    drive(scene, () => true, 120);
    const sessions = k(0).sessions;
    const points = k(0).points;
    ctx.minigames.quit();
    const quit = await promise;
    step(3);
    assert('quitting midway submits nothing: no points, no session, no belt', quit.quit && k(0).sessions === sessions && k(0).points === points && of('karate:trained').length === started && ctx.screens.size === 0 && !game.scene.isActive('MG_karate'));

    // ---- two kids train side by side on their own belts
    const solo = structuredClone(ctx.state.data); // player 1 with Helena (karate rank from an earlier scenario) is dropped: the co-op partner is then a fresh Kilian
    solo.players = solo.players.slice(0, 1);
    solo.players[0].character = 'helena';
    ctx.state.replace(solo);
    game.setCoop(true);
    step(4);
    gs = game.scene.getScene('Game');
    ctx = gs.ctx;
    intents = ctx.input.intents;
    ctx.input.update = () => {};
    listen();
    promise = null;
    const start2 = ctx.minigames.start.bind(ctx.minigames);
    ctx.minigames.start = (...a) => (promise = start2(...a));
    for (const p of ctx.players) for (const ride of [gs.bikes, gs.skateboards, gs.skates]) if (ride.isMounted(p.index)) ride.dismount(p);
    for (let i = 0; i < 8 && ctx.day.phase !== 'morning'; i++) ctx.day.advance('smoke'); // the restart began a fresh freeplay day: the sessions of the first kid were used up on it
    ctx.world.load('dojo', 'from-town');
    step(5);
    const master = gs.dojo.sensei;
    const [p0, p1] = ctx.players;
    p0.teleport(master.x - 12, master.y + 22);
    p1.teleport(master.x + 12, master.y + 22);
    step(3);
    const belt1 = ctx.karate.beltOf(1);
    const ordnung1 = ctx.state.players[1].attributes.ordnung;
    const kBefore = [0, 1].map(i => ({ ...ctx.state.players[i].karate }));
    assert('two kids: the second starts white (or its own belt) while the first is yellow', ctx.karate.beltOf(0) === 'yellow' && belt1 === 'white' && ctx.players.length === 2);
    press(0, 'interact');
    step(1);
    assert('interact starts the training for both kids standing next to the sensei', ctx.minigames.active?.players.join() === '0,1');
    const duo = game.scene.getScene('MG_karate');
    until(() => duo.clock.phase === 'play', 400);
    const [a, b] = duo.slots;
    assert('two stages side by side, each with the kata of its own belt', a.rect.x < b.rect.x && a.belt === 'yellow' && b.belt === 'white' && a.session !== b.session && a.session.schedule.n !== b.session.schedule.n);
    drive(duo, (si, n) => si === 1 || n % 3 === 0);
    assert('the first kid played poorly, the second perfectly: independent exams', a.outcome.promote === null && b.outcome.promote === 'yellow' && a.session.summary().score < 0.5 && b.session.summary().score === 1, `${a.outcome?.reason} ${b.outcome?.reason}`);
    const duoRun = await finish(duo);
    assert('each kid has their own result', duoRun.result.perPlayer.length === 2 && duoRun.result.perPlayer[1].score > duoRun.result.perPlayer[0].score);
    assert('only the second kid was promoted; both counted a session of their own', ctx.karate.beltOf(0) === 'yellow' && ctx.karate.beltOf(1) === 'yellow' && ctx.state.players[1].karate.sessions === kBefore[1].sessions + 1 && ctx.state.players[0].karate.sessions === kBefore[0].sessions + 1 && ctx.state.players[0].karate.points > kBefore[0].points, JSON.stringify([ctx.state.players[0].karate, ctx.state.players[1].karate]));
    assert('the Ordnung of the promoted kid grew, the other one stayed', ctx.state.players[1].attributes.ordnung === ordnung1 + 1 && JSON.stringify(of('karate:belt').at(-1)) === JSON.stringify({ player: 1, belt: 'yellow' }));
    step(3);
    assert('both belt tags follow their belts', gs.beltTags.tags[0].image.tintTopLeft === 0xffd23f && gs.beltTags.tags[1].image.tintTopLeft === 0xffd23f);
    game.setCoop(false);
    step(4);
  }
};
