// Smoke scenario: the Lernbuch (story 10.5). Registered in scripts/smoke/index.js. Plays scripted questions through the live learning
// engine and checks that the bars, numbers and medals on the screen follow the saved accuracy; the saved state is put back afterwards.
import { progressOf } from '../../learning/lernbuch.js';

export const lernbuch = {
  name: 'lernbuch',
  run(game, assert, env) {
    const { step, ctx, ui } = env;
    const data0 = ctx.state.data;
    const top = () => ui.screens.top();
    ctx.state.replace({ ...ctx.state.data, players: ctx.state.players.map(p => ({ ...p, learning: {} })) });
    const cfg = ctx.state.cfg.lernbuch ?? game.cache.json.get('lernbuch');
    const play = (topic, pattern) => { for (const ok of pattern) ctx.learning.answer(ctx.learning.next(topic, { player: 0 }), ok, 3500, { player: 0 }); };

    ctx.openLernbuch();
    step(2);
    let scr = top();
    assert('the book opens frozen with an empty page for a kid who has not answered anything', scr?.id === 'lernbuch' && ctx.frozen && scr.total.text === ctx.t('lernbuch.empty') && scr.rows.every(r => r.pct.text === '-'), scr?.total?.text);
    env.press('pause');
    assert('Esc closes it', !top() && !ctx.frozen);

    play('mathe', Array.from({ length: 40 }, (_, i) => i % 5 !== 4)); // 32 right, 8 wrong: 80 percent
    play('deutsch', Array.from({ length: 10 }, (_, i) => i < 4)); // 4 of 10: 40 percent
    ctx.openLernbuch();
    step(2);
    scr = top();
    const mathe = progressOf(ctx.learning.stats(0, 'mathe'), ctx.learning.poolSize('mathe'), cfg);
    const row = scr.rows.find(r => r.topic === 'mathe');
    assert('the Mathe bar is the real accuracy of what was answered: 32 of 40', Math.abs(mathe.accuracy - 0.8) < 1e-9 && row.pct.text === '80%' && row.info.text.includes('40'), `${row.pct.text} ${row.info.text}`);
    assert('a silver medal for 40 answers at 80 percent, and nothing for 40 percent', mathe.medal === 'silver' && progressOf(ctx.learning.stats(0, 'deutsch'), 1, cfg).medal === null);
    assert('a subject never played is an empty bar', scr.rows.find(r => r.topic === 'sachkunde').pct.text === '-');
    assert('the total counts every subject', scr.total.text.includes('50') && scr.total.text.includes('72%'), scr.total.text);
    const lang = ctx.i18n.lang;
    const name = row.name.text;
    ctx.i18n.set(lang === 'de' ? 'en' : 'de');
    assert('the subject names follow the language', row.name.text !== name && row.name.text === ctx.t('grades.subject.mathe'));
    ctx.i18n.set(lang);
    env.press('pause');

    play('mathe', Array(30).fill(true)); // 70 answers, 62 right
    ctx.openLernbuch();
    step(2);
    scr = top();
    const after = progressOf(ctx.learning.stats(0, 'mathe'), ctx.learning.poolSize('mathe'), cfg);
    assert('more play moves the bar and the medal: gold at 70 answers and 88 percent', after.answered === 70 && after.medal === 'gold' && scr.rows.find(r => r.topic === 'mathe').pct.text === '89%' && after.badges.streak, `${scr.rows.find(r => r.topic === 'mathe').pct.text}`);
    env.press('pause');

    ctx.state.replace(data0);
    step(2);
    assert('the Lernbuch scenario leaves the world running', !ctx.frozen && !top());
  }
};
