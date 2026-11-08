// Smoke scenario: surprise events in the school day (story 8.4). Registered in scripts/smoke/index.js. The other scenarios run
// with the surprises switched off (env.js); this one switches them on, checks the lesson introduction text and the events,
// and puts everything back.
import { schedule } from '../../services/schoolEvents.js';

export const schoolEvents = {
  name: 'schoolEvents',
  async run(game, assert, env) {
    const { ctx } = env;
    const log = [];
    for (const n of ['homework:forgotten', 'homework:done', 'school:substitute', 'school:popquiz']) ctx.events.on(n, e => log.push([n, e]));
    const count = (n, pred = () => true) => log.filter(e => e[0] === n && pred(e[1])).length;
    const data0 = ctx.state.data;
    const cfg = ctx.schoolEvents.cfg;
    const lessonsOf = day => ctx.school.schedule(day).lessons;
    const find = pred => Array.from({ length: 60 }, (_, i) => i + 1).find(pred);
    const sched = day => schedule(cfg, day, lessonsOf(day).length);
    const ordnung = () => ctx.state.players[0].kopfnoten.ordnung;
    const morningOf = (day, missing) => ctx.state.replace({ ...ctx.state.data, players: ctx.state.players.map((p, i) => (i === 0 ? { ...p, morning: { day, breakfast: true, packed: true, missing } } : p)) });
    game.schoolEventsOff = false;

    // ---- the homework check before the first lesson, with a forgotten homework
    const day = find(d => sched(d).substitute < 0); // a plain day first
    const first = lessonsOf(day)[0];
    morningOf(day, ['homework']);
    const o0 = ordnung();
    let notice = ctx.school.noticeFor(first, [0]);
    assert('the lesson introduction names the forgotten homework kindly', notice?.key === 'school.notice.events' && notice.params.events.includes(ctx.t('school.event.homework.forgot', { who: ctx.schoolEvents.who(0) })), JSON.stringify(notice));
    assert('the forgotten homework is an event and lowers Ordnung a little', count('homework:forgotten', e => e.player === 0) === 1 && ordnung() < o0 && o0 - ordnung() <= 0.5, `${o0} -> ${ordnung()}`);
    notice = ctx.school.noticeFor(first, [0]);
    assert('asking again the same day does not check twice', count('homework:forgotten') === 1);

    // ---- homework brought: praised
    const day2 = find(d => d !== day && sched(d).substitute < 0);
    const first2 = lessonsOf(day2)[0];
    morningOf(day2, []);
    const o1 = ordnung();
    notice = ctx.school.noticeFor(first2, [0]);
    assert('packed homework is praised and raises Ordnung', count('homework:done', e => e.player === 0) === 1 && ordnung() > o1 && notice.params.events.includes(ctx.t('school.event.homework.ok', { who: ctx.schoolEvents.who(0) })), `${o1} -> ${ordnung()}`);

    // ---- a substitute teacher
    const day3 = find(d => sched(d).substitute === 0);
    const first3 = lessonsOf(day3)[0];
    morningOf(day3, []);
    notice = ctx.school.noticeFor(first3, [0]);
    const n = sched(day3).substituteName;
    assert('a substitute teacher is announced with a funny quirk', count('school:substitute', e => e.day === day3 && e.name === n) === 1 && notice.params.events.includes(ctx.t(`school.sub.${n}.name`)) && notice.params.events.includes(ctx.t(`school.sub.${n}.quirk`)));

    // ---- the pop quiz: an extra round of the same subject after exactly its lesson
    const day4 = find(d => sched(d).popQuiz >= 1);
    const quizLesson = lessonsOf(day4)[sched(day4).popQuiz];
    assert('the pop quiz is scheduled for one later lesson only', ctx.schoolEvents.popQuiz(quizLesson) && !ctx.schoolEvents.popQuiz(lessonsOf(day4)[0]));
    const start = ctx.minigames.start;
    let call = null;
    ctx.minigames.start = async (id, opts) => { call = { id, opts }; return { quit: true, perPlayer: [] }; };
    await ctx.school.popQuiz(quizLesson, [0]);
    ctx.minigames.start = start;
    assert('it starts an extra round of the lesson subject with its own ledger id and an announcement', call?.id === quizLesson.minigame && call.opts.lessonId === `${quizLesson.id}-quiz` && call.opts.notice.key === 'school.popquiz.notice' && count('school:popquiz') === 1);

    // ---- surprises can be switched off, and everything is put back
    game.schoolEventsOff = true;
    assert('with the test switch on there are no surprises', ctx.schoolEvents.before(first, [0]) === null && !ctx.schoolEvents.popQuiz(quizLesson));
    ctx.state.replace(data0);
    assert('the school events scenario leaves the world running', !ctx.frozen);
  }
};
