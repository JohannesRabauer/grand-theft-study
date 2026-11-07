export const school = {
  name: 'school',
  async run(game, assert, env) {
    const { step, until } = env;
    const gs = game.scene.getScene('Game'), ctx = gs.ctx;
    ctx.input.update = () => {};
    for (const intent of ctx.input.intents) {
      intent.interact = intent.jump = intent.pause = false;
      intent.move.x = intent.move.y = 0;
    }
    const ui = game.scene.getScene('UI');
    const player = ctx.players[0];
    for (const ride of [gs.bikes, gs.skateboards, gs.skates]) if (ride.isMounted(0)) ride.dismount(player);
    if (ctx.world.id !== 'town') ctx.world.load('town', 'from-school');
    const partsBefore = gs.school.parts.length;
    const listenersBefore = ctx.events.listenerCount('lang:changed');
    const door = ctx.map.objects.find(o => o.id === 'door-school');
    for (const p of ctx.players) p.teleport((door.x + 1.5) * 16, (door.y + 0.5) * 16);
    ctx.input.intents[0].interact = true;
    step(1);
    ctx.input.intents[0].interact = false;
    step(3);
    assert('school is reachable through the normal interact door', ctx.world.id === 'school' && ctx.map.indoor);
    assert('the classroom has readable art and an interaction spot', gs.school.spot !== null && gs.school.parts.length >= 3);
    for (const p of ctx.players) p.teleport(gs.school.spot.x, gs.school.spot.y + 20);
    step(2);
    const uiBefore = ui.children.length;
    ctx.input.intents[0].interact = true;
    step(1);
    ctx.input.intents[0].interact = false;
    step(2);
    const screen = ctx.screens.top();
    assert('classroom interaction opens a freezing timetable with 4-6 lessons', screen?.id === 'timetable' && ctx.frozen && screen.rows.length >= 4 && screen.rows.length <= 6);
    const clock = ctx.day.snapshot();
    step(30);
    assert('reading the timetable freezes the clock', JSON.stringify(clock) === JSON.stringify(ctx.day.snapshot()));
    const lang = ctx.i18n.lang;
    ctx.i18n.set(lang === 'de' ? 'en' : 'de');
    assert('the timetable and school signs follow the language', screen.title.text.includes(ctx.t(ctx.school.schedule().name)) && gs.school.labels.every(l => l.text.text === ctx.t(l.key)));
    ctx.i18n.set(lang);
    screen.close();
    assert('closing the timetable restores the world without UI leaks', !ctx.frozen && ui.children.length === uiBefore);

    // Start through the actual timetable button, then finish the registered scene with a scored result.
    // Individual minigame controls are covered by the minigames scenario.
    while (ctx.day.phase === 'afternoon' || ctx.day.phase === 'evening') ctx.day.advance('smoke-next-school-day');
    let promise;
    const attend = ctx.school.attend.bind(ctx.school);
    ctx.school.attend = () => (promise = attend());
    ctx.input.intents[0].interact = true;
    step(1);
    ctx.input.intents[0].interact = false;
    step(2);
    const lesson = ctx.school.next();
    const gradesBefore = ctx.state.players.map(p => p.grades.entries.length);
    const beforeMinute = ctx.day.minute;
    ctx.screens.top().button.emit('pointerdown');
    step(2);
    const session = ctx.minigames.active;
    assert('the timetable button launches the scheduled minigame for the children', session?.def.id === lesson.minigame && session.lessonId === lesson.id && ctx.frozen && ctx.day.phase === 'school');
    assert('attendance skips waiting without moving time backwards', ctx.day.minute >= beforeMinute && ctx.day.minute >= lesson.start);
    const mg = game.scene.getScene(session.def.scene);
    until(() => mg.clock.phase === 'play', 400);
    for (const slot of mg.slots) slot.tally.correct = slot.tally.total = 10;
    mg.finish();
    step(3);
    assert('a lesson result is shown while the world stays frozen', ctx.screens.top()?.id === 'minigameResult' && ctx.frozen);
    ctx.screens.top().proceed();
    await promise;
    step(3);
    assert('completed lessons record a grade per child with their lesson ID', ctx.players.every(p => ctx.school.recordFor(lesson, p.index)?.grade >= 1 && ctx.state.players[p.index].grades.entries.length === gradesBefore[p.index] + 1));
    assert('the next lesson resumes without repeating the completed one', ctx.school.next()?.id !== lesson.id && !ctx.school.running && !ctx.frozen);
    const schedule = ctx.school.schedule();
    let lessons = 1;
    while (ctx.school.canAttend()) {
      const next = ctx.school.next();
      const run = ctx.school.attend();
      step(2);
      const scene = game.scene.getScene(ctx.minigames.active.def.scene);
      until(() => scene.clock.phase === 'play', 400);
      for (const slot of scene.slots) slot.tally.correct = slot.tally.total = 10;
      scene.finish();
      step(3);
      ctx.screens.top().proceed();
      await run;
      step(3);
      lessons++;
      assert(`scheduled lesson ${next.index + 1} stores its grade`, !!ctx.school.recordFor(next, 0));
    }
    assert('the whole scheduled school day finishes in the afternoon with 4-6 grades', lessons === schedule.lessons.length && lessons >= 4 && lessons <= 6 && ctx.day.phase === 'afternoon' && ctx.day.time === '13:15' && ctx.school.next() === null);
    delete ctx.school.attend;
    ctx.world.load('town', 'from-school');
    step(3);
    assert('leaving school removes its art and restores its entrance without listener leaks', gs.school.spot === null && gs.school.parts.length === partsBefore && ctx.events.listenerCount('lang:changed') === listenersBefore);
  }
};
