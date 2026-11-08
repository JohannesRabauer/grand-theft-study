// Smoke scenario: contextual explanations (story 11.5, 11.6). Registered in scripts/smoke/index.js.
// The other scenarios run with tips switched off (env.js); this one switches them on, drives the real screen and
// leaves the game quiet again.
export const hints = {
  name: 'hints',
  run(game, assert, env) {
    const { step, intent, ctx, ui, gs } = env;
    const flags = () => ctx.state.shared.flags;
    const hintFlags = () => Object.keys(flags()).filter(k => k.startsWith('hint.'));
    const top = () => ui.screens.top();
    const text = () => `${top().title.text} ${top().body.text} ${top().footer.text}`;
    game.hintsOff = false;
    ctx.hints.nextAt = 0;

    // a bike ride opens the bike hint with the player's real keys, and freezes the world while it is read
    intent.jump = true; // still held from play when the screen opens
    ctx.events.emit('player:vehicle', { player: 0, id: 'bike' });
    step(1);
    assert('the first bike ride opens the bike explanation and freezes the world', top()?.id === 'hint' && ctx.frozen && gs.paused, top()?.id);
    assert('it names the real keys, in the active language, with no placeholder left', text().includes('F') && text().includes('Space') && !/[{}]/.test(text()), text());
    step(240);
    assert('a key held since before the screen opened cannot dismiss it, and it stays open for as long as it is read', top()?.id === 'hint' && ctx.frozen);
    intent.jump = false;
    step(2);
    assert('releasing the key alone does not dismiss it either', top()?.id === 'hint');
    env.press('jump');
    assert('a fresh confirmation closes it, restores the world and marks it seen for that player', !top() && !ctx.frozen && !gs.paused && flags()['hint.bike.0'] === true, hintFlags().join());

    // cooldown and repeat suppression
    ctx.events.emit('player:vehicle', { player: 0, id: 'skateboard' });
    step(1);
    assert('a second tip does not follow straight after the first', !top());
    ctx.events.emit('player:vehicle', { player: 0, id: 'bike' });
    ctx.hints.nextAt = 0;
    step(1);
    assert('an explained mechanic is not explained again', !top());

    // Esc closes a tip and counts as read
    ctx.events.emit('player:vehicle', { player: 0, id: 'skateboard' });
    step(1);
    assert('the skateboard explanation opens once the cooldown is over', top()?.id === 'hint' && text().includes('Space'), text());
    intent.pause = true;
    step(1);
    intent.pause = false;
    assert('Esc closes it, restores the world and marks it seen', !top() && !ctx.frozen && flags()['hint.skateboard.0'] === true);

    // a tip never opens over another screen or during a lesson
    ctx.hints.nextAt = 0;
    intent.pause = true;
    step(1);
    intent.pause = false;
    assert('the pause screen is open', top()?.id === 'pause');
    ctx.events.emit('player:vehicle', { player: 0, id: 'skates' });
    step(1);
    assert('no tip opens over the pause screen', top()?.id === 'pause');
    intent.pause = true;
    step(1);
    intent.pause = false;

    // the help browser pages through every tip without marking anything
    const before = hintFlags().join();
    ctx.openHelp();
    step(1);
    const total = ctx.hints.defs.length;
    assert('Help opens the first tip with a counter and freezes the world', top()?.id === 'hint' && top().counter.text.includes(`1`) && top().counter.text.includes(String(total)) && ctx.frozen, top()?.counter?.text);
    const first = top().title.text;
    intent.move.x = 1;
    step(1);
    intent.move.x = 0;
    step(1);
    assert('right pages to the next tip', top().title.text !== first && top().counter.text.includes('2'), top().counter.text);
    intent.move.x = -1;
    step(1);
    intent.move.x = 0;
    intent.move.x = -1;
    step(1);
    intent.move.x = 0;
    step(1);
    assert('left wraps around to the last tip', top().counter.text.includes(`${total} `) || top().counter.text.endsWith(`${total}`) || top().counter.text.includes(`${total}`), top().counter.text);
    assert('reading every tip in Help marks nothing as seen', hintFlags().join() === before);
    env.press('interact');
    assert('confirm closes Help and unfreezes the world', !top() && !ctx.frozen);

    // switching the language re-resolves the open tip
    ctx.hints.nextAt = 0;
    ctx.events.emit('player:vehicle', { player: 0, id: 'skates' });
    step(1);
    const en = top()?.title.text;
    const i18n = game.registry.get('app').i18n;
    i18n.set(i18n.lang === 'de' ? 'en' : 'de'); // emits lang:changed
    step(1);
    assert('a change of language re-translates the open tip', top()?.id === 'hint' && top().title.text !== en, `${en} -> ${top()?.title.text}`);
    i18n.set(env.savedLang);
    env.press('jump');

    // leave the game quiet for the scenarios that follow
    game.hintsOff = true;
    const clean = Object.fromEntries(Object.entries(flags()).filter(([k]) => !k.startsWith('hint.'))); // the saved data is frozen: replace it
    ctx.state.replace({ ...ctx.state.data, shared: { ...ctx.state.shared, flags: clean } });
    ui.screens.clear();
    step(2);
    assert('hint scenario leaves no screen open and the world running', !top() && !ctx.frozen);
  }
};
