// Smoke scenario: difficulty by age (story 11.7). Registered in scripts/smoke/index.js. Opens the real parent settings, picks a challenge age
// for the kid through the settings row, checks that the learning engine uses it at once, that it is saved in the family's flags and that
// going back to the character's age restores the default; the learning stats stay as they were. Everything is put back afterwards.
import { ParentSettingsScreen } from '../../ui/screens/ParentSettingsScreen.js';
import { ageFlag } from '../../services/ageLogic.js';

export const age = {
  name: 'age',
  run(game, assert, env) {
    const { step, ctx, ui } = env;
    const data0 = ctx.state.data;
    const flags = () => ctx.state.shared.flags;
    const top = () => ui.screens.top();
    const charAge = ctx.characters?.def(0)?.age;
    const map = ctx.learning.cfg.ageMap;
    const stats0 = JSON.stringify(ctx.state.players[0].learning ?? {});
    ctx.state.dispatch('flags.set', { key: 'parentDifficulty', value: 1 });
    ctx.state.dispatch('flags.set', { key: ageFlag(0), value: null });
    const base = ctx.learning.core.pd(0);
    assert('by default the character age sets the challenge factor', Math.abs(base - (charAge ? map.steps.find(s => charAge <= s.upTo).factor : 1)) < 1e-9, `${base} for age ${charAge}`);

    ctx.screens.push(new ParentSettingsScreen(ui, ctx, ctx.screens, game.cache.json.get('parent')));
    step(2);
    const st = top();
    assert('the settings have a challenge age row for the kid', st?.id === 'parentSettings' && st.menu.rows.length >= 5 && st.menu.rows.some(r => r.caption === 'parent.age.p1'), `${st?.menu.rows.length}`);
    const row = st.menu.rows.find(r => r.caption === 'parent.age.p1');
    row.items[1].on(); // the first age choice
    assert('picking an age is saved for the kid and applied at once', flags()[ageFlag(0)] === map.choices[0] && Math.abs(ctx.learning.core.pd(0) - map.steps.find(s => map.choices[0] <= s.upTo).factor) < 1e-9 && row.items[1].selected());
    row.items[map.choices.length].on(); // the oldest choice
    assert('the oldest age gives the strongest challenge, whatever the character', ctx.learning.core.pd(0) === 1.1 && ctx.state.players[0].character !== undefined || ctx.learning.core.pd(0) === 1.1);
    row.items[0].on(); // like the character
    assert('back to the character age restores the default', Math.abs(ctx.learning.core.pd(0) - base) < 1e-9 && row.items[0].selected());
    assert('the learning stats were never touched', JSON.stringify(ctx.state.players[0].learning ?? {}) === stats0);
    env.press('pause');
    step(2);
    assert('the settings close and the world runs', !top() && !ctx.frozen);

    ctx.state.replace(data0);
    step(2);
  }
};
