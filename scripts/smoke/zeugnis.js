// Smoke scenario: the Zeugnis after bedtime (story 8.6). Registered in scripts/smoke/index.js. Plays the end of a school year with
// good grades (promoted, confetti, the class-4 message once) and the next one with bad grades (a bonus lap with the comeback bonus),
// through the real screens, and puts world, clock and state back.
export const zeugnis = {
  name: 'zeugnis',
  run(game, assert, env) {
    const { step } = env;
    const gs = game.scene.getScene('Game'); // the live game: after the quit-and-second-run scenario the shared env is stale
    const ctx = gs.ctx;
    const ui = game.scene.getScene('UI');
    const player = ctx.players[0];
    ctx.input.update = () => {};
    const intent = ctx.input.intents[0];
    for (const key of ['interact', 'jump', 'pause']) intent[key] = false;
    intent.move.x = intent.move.y = 0;
    const press = key => { intent[key] = true; step(1); intent[key] = false; };
    const tap = () => { step(1); press('jump'); };
    const top = () => ui.screens.top();
    const log = [];
    for (const n of ['day:zeugnis', 'day:end-of-class', 'zeugnis:done', 'day:morning']) ctx.events.on(n, e => log.push([n, e]));
    const count = (n, pred = () => true) => log.filter(e => e[0] === n && pred(e[1])).length;
    const mem = new Map();
    const storage = ctx.saves.storage;
    ctx.saves.storage = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) };
    const slot0 = ctx.saves.activeSlot;
    const data0 = ctx.state.data;
    const home0 = { x: player.x, y: player.y, vehicle: player.vehicle };
    const flags = () => ctx.state.shared.flags;
    const give = (day, list) => list.forEach(([subject, grade], i) => ctx.grades.record(0, { subject, score: Math.max(0, 1 - (grade - 1) * 0.18), grade, lessonId: `zs-${day}-${i}`, day }));
    const GOOD = [['mathe', 1], ['deutsch', 2], ['englisch', 2], ['sachkunde', 3], ['science', 1], ['sport', 2]];
    const BAD = [['mathe', 5], ['deutsch', 5], ['englisch', 5], ['sachkunde', 4], ['science', 4]];
    for (const ride of gs.mountables) if (ride.isMounted(0)) ride.dismount(player);
    if (ctx.world.id !== 'town') ctx.world.load('town', 'from-home');
    ctx.day.mode = 'story';
    ctx.saves.activeSlot = 1;

    // ---- a good year: the report card, confetti, class 4 coming soon (once), then the morning at home
    ctx.state.dispatch('clock.set', { day: 20, minute: 21 * 60 + 59, phase: 'evening' });
    give(20, GOOD);
    ctx.day.advance('time');
    step(2);
    assert('bedtime comes first, with the good-night message', top()?.id === 'message');
    tap();
    assert('then the Zeugnis opens for every kid, frozen, with the grades of this year and the promotion', top()?.id === 'reportCard' && ctx.frozen && top().cards.length === ctx.players.length && top().cards[0].promotion.promoted && top().rows[0].name.visible, top()?.id);
    assert('it names the subjects, the grades, the conduct and the comments', top().rows.some(r => r.name.visible && r.name.text === ctx.t('grades.subject.mathe') && r.grade.text === '1') && top().conduct.text.length > 20 && top().teacher.text.length > 30 && top().parents.text.length > 30 && top().result.text.includes(ctx.t('zeugnis.promoted')));
    assert('a promoted kid gets confetti', top().confetti.length > 0);
    assert('the consequence was settled when it opened: class 4 reached, once', flags().klasse4 === true && flags()['zeugnis.20.0'] === 'promoted' && count('zeugnis:done', e => e.player === 0 && e.promoted) === 1);
    const lang = ctx.i18n.lang;
    ctx.i18n.set(lang === 'de' ? 'en' : 'de');
    assert('a change of language re-reads the comments', top().result.text.includes(ctx.t('zeugnis.promoted')) && top().rows[0].name.text === ctx.t(`grades.subject.${Object.keys(top().cards[0].zeugnis)[0]}`));
    ctx.i18n.set(lang);
    const pages = top().cards.length;
    for (let i = 0; i < pages; i++) tap();
    assert('after the last page the end of class 3 is told once: Klasse 4 is coming soon', top()?.id === 'message' && top().title.text === ctx.t('zeugnis.end.title') && flags().endShown === true && count('day:end-of-class') === 1);
    tap();
    assert('then the morning begins at home and the world runs', ctx.world.id === 'home' && !ctx.frozen && ctx.day.day === 21 && count('day:morning', e => e.day === 21) === 1);

    // ---- a year to repeat: the bonus lap with the comeback bonus, and no end message again
    ctx.world.load('town', 'from-home');
    step(2);
    ctx.state.dispatch('clock.set', { day: 21, minute: 21 * 60 + 59, phase: 'evening' });
    give(21, BAD);
    const money0 = ctx.state.shared.money;
    const xp0 = ctx.state.players[0].xp;
    ctx.day.advance('time');
    step(2);
    tap();
    assert('the bad year gets a Zeugnis too, put as a bonus lap with the comeback bonus', top()?.id === 'reportCard' && !top().cards[0].promotion.promoted && top().result.text.includes(ctx.t('zeugnis.repeat')) && top().bonus.text.length > 5);
    assert('the bonus was paid once: xp, pocket money and the perk', ctx.state.players[0].xp === xp0 + 150 && ctx.state.shared.money === money0 + 500 && flags()['perk.extraHints.0'] === true && flags()['zeugnis.21.0'] === 'repeat', `${money0} -> ${ctx.state.shared.money}, xp ${xp0} -> ${ctx.state.players[0].xp}`);
    const pages2 = top().cards.length;
    for (let i = 0; i < pages2; i++) tap();
    assert('a repeated year ends straight at home, without telling about class 4 again', !top() && ctx.world.id === 'home' && count('day:end-of-class') === 1 && ctx.day.day === 22);

    // ---- put everything back
    ctx.world.load('town', 'from-home');
    step(2);
    ctx.saves.storage = storage;
    ctx.saves.activeSlot = slot0;
    ctx.day.mode = 'freeplay';
    ctx.state.replace(data0);
    ctx.state.dispatch('clock.set', { day: 1, minute: 465, phase: 'commute' });
    ctx.chase.reset();
    player.teleport(home0.x, home0.y);
    if (home0.vehicle === 'bike') gs.bikes.giveBike(player);
    else if (home0.vehicle === 'skateboard') gs.skateboards.giveBoard(player);
    else if (home0.vehicle === 'skates') gs.skates.giveBoard(player);
    gs.snapCamera();
    step(3);
    assert('the Zeugnis scenario leaves the world running in the town', !ctx.frozen && ctx.world.id === 'town');
  }
};
