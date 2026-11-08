// Smoke scenario: achievements and streaks (story 10.4). Registered in scripts/smoke/index.js. Unlocks an achievement through game events,
// opens the screen in both languages, settles a streak day and checks persistence in the saved flags; the saved state is put back afterwards.
export const achievements = {
  name: 'achievements',
  run(game, assert, env) {
    const { step, ctx, ui } = env;
    const log = [];
    for (const n of ['achievement:unlocked', 'streak:up', 'ui:toast']) ctx.events.on(n, e => log.push([n, e]));
    const count = (n, pred = () => true) => log.filter(e => e[0] === n && pred(e[1])).length;
    const data0 = ctx.state.data;
    const svc = ctx.achievements;
    const top = () => ui.screens.top();
    const flags = () => ctx.state.shared.flags;
    const clean = Object.fromEntries(Object.entries(ctx.state.shared.flags).filter(([k]) => !/^(ach\.|streak\.|helped\.)/.test(k)));
    ctx.state.replace({ ...ctx.state.data, shared: { ...ctx.state.shared, flags: clean } });

    // ---- unlocking through events
    svc.onEvent('lesson:done', { player: 0, effort: 1 }); // straight to the service: the real events are heard by the whole game (a bell moves pedestrians and buses)
    assert('a finished lesson unlocks Fresh Start: event, toast with the name, saved in the flags', count('achievement:unlocked', e => e.id === 'first-lesson' && e.player === 0) === 1 && count('ui:toast', e => e.key === 'ach.unlocked') >= 1 && !!flags()['ach.first-lesson.0']);
    for (let i = 0; i < 24; i++) svc.onEvent('bike:bell', { player: 0 });
    assert('24 bell rings are not yet a champion', !svc.unlocked('bell-ringer', 0) && svc.count('bell-ringer', 0) === 24);
    svc.onEvent('bike:bell', { player: 0 });
    assert('the 25th makes a Ding-Dong Champion', svc.unlocked('bell-ringer', 0) && count('achievement:unlocked', e => e.id === 'bell-ringer') === 1);
    svc.onEvent('bike:bell', { player: 0 });
    assert('and nothing unlocks twice', count('achievement:unlocked', e => e.id === 'bell-ringer') === 1);

    // ---- the screen
    ctx.openAchievements();
    step(2);
    const scr = top();
    assert('the screen opens frozen with the count, the streaks and the funny names', scr?.id === 'achievements' && ctx.frozen && scr.owner.text.includes('2') && scr.streaks.text.length > 20 && scr.rows[0].name.text.includes(ctx.t('ach.first-lesson.name')), scr?.owner?.text);
    assert('an unlocked one is marked, a locked one shows its progress', scr.rows[0].name.text.startsWith('*') && scr.rows[1].prog.text.length > 0 && scr.rows[0].prog.text === '');
    scr.sel = 4;
    scr.render();
    assert('the description of the selected one is shown', scr.desc.text === `${ctx.t('ach.bell-ringer.name')}: ${ctx.t('ach.bell-ringer.desc')}`);
    const lang = ctx.i18n.lang;
    const before = scr.desc.text;
    ctx.i18n.set(lang === 'de' ? 'en' : 'de');
    assert('names and descriptions follow the language', scr.desc.text !== before && scr.desc.text.includes(ctx.t('ach.bell-ringer.name')));
    ctx.i18n.set(lang);
    env.press('pause');
    assert('Esc closes it and unfreezes the world', !top() && !ctx.frozen);

    // ---- a streak: lessons on consecutive days, settled when the day ends
    const day = 60;
    const grade = (d, i) => ctx.state.dispatch('grades.record', { player: 0, subject: 'mathe', score: 0.8, grade: 2, lessonId: `ach-${d}-${i}`, day: d });
    ctx.state.dispatch('clock.set', { day, minute: 1300, phase: 'evening' });
    for (let i = 0; i < 3; i++) grade(day, i);
    let lines = svc.settleDay(day);
    assert('the first day of a streak is counted quietly', svc.streak('school', 0).n === 1 && lines.length === 0 && count('streak:up', e => e.id === 'school' && e.n === 1) === 1);
    ctx.state.dispatch('clock.set', { day: day + 1, minute: 1300, phase: 'evening' });
    for (let i = 0; i < 3; i++) grade(day + 1, i);
    lines = svc.settleDay(day + 1);
    assert('the second day in a row is celebrated in the good-night lines', svc.streak('school', 0).n === 2 && lines.some(l => l.includes(ctx.t('streak.school.name'))), JSON.stringify(lines));
    lines = svc.settleDay(day + 2);
    assert('a day without lessons ends the streak kindly and keeps the best', svc.streak('school', 0).n === 0 && svc.streak('school', 0).best === 2 && lines.some(l => l === ctx.t('streak.reset', { who: ctx.schoolEvents.who(0), name: ctx.t('streak.school.name') })));
    assert('the progress is in the saved flags', !!flags()['streak.school.0'] && flags()['streak.school.0'].best === 2);

    ctx.state.replace(data0);
    step(2);
    assert('the achievements scenario leaves the world running', !ctx.frozen && !top());
  }
};
