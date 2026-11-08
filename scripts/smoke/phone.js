// Smoke scenario: the phone (story 11.3). Registered in scripts/smoke/index.js. Fires the scripted events with the real event bus, checks
// that the messages arrive once, show as a badge, open with the phone key, are marked read and close again; the saved state is put back.
export const phone = {
  name: 'phone',
  run(game, assert, env) {
    const { step, ctx, ui, hud, press } = env;
    const data0 = ctx.state.data;
    const ph = ctx.phone;
    const top = () => ui.screens.top();
    const got = [];
    ctx.events.on('phone:message', e => got.push(e));
    ctx.state.dispatch('flags.set', { key: 'phone.inbox', value: [] });
    const badge = { get visible() { return !!hud('phone').badge?.visible; }, get text() { return hud('phone').badge?.text ?? ''; } };

    ctx.events.emit('commute:ontime', { player: 0, early: 3 });
    step(2);
    assert('an on-time arrival brings a message from mom and shows the badge', got.length === 1 && got[0].id === 'mom-ontime' && ph.unread === 1 && badge.visible && badge.text.includes('1'), badge.text);
    ctx.events.emit('commute:ontime', { player: 0, early: 1 });
    assert('the same message does not arrive twice on one day', got.length === 1);
    ctx.events.emit('activity:done', { id: 'pfand', player: 0 });
    ctx.events.emit('activity:done', { id: 'unknown', player: 0 });
    assert('an activity message matches only its own activity', got.length === 2 && got[1].id === 'friend-pfand');
    ctx.events.emit('chase:level', { level: 0, reason: 'smoke' });
    assert('a calm chase level sends no taunt', got.length === 2);
    ctx.events.emit('chase:level', { level: 1, reason: 'smoke' });
    assert('a raised chase level brings a bully taunt', got.length === 3 && got[2].from === 'bully' && ph.unread === 3);
    ctx.state.dispatch('flags.set', { key: 'phone.inbox', value: [...ph.inbox, ...Array.from({ length: 40 }, (_, i) => ({ id: `old${i}`, day: 1, from: 'mom', read: true }))] });
    ctx.events.emit('school:late', { player: 0, minutes: 2 });
    assert('the inbox keeps only the newest messages', ph.inbox.length === ph.cfg.max && ph.inbox.at(-1).id === 'mom-late');

    ctx.state.dispatch('flags.set', { key: 'phone.inbox', value: [] });
    ctx.events.emit('school:late', { player: 0, minutes: 2 });
    ctx.events.emit('commute:ontime', { player: 0, early: 1 });
    press('phone');
    step(2);
    assert('the phone key opens the phone and freezes the world', top()?.id === 'phone' && ctx.frozen);
    assert('opening it reads everything and the badge goes away', ph.unread === 0 && !badge.visible && top().body.text.includes('*'), top().body.text);
    press('phone');
    step(2);
    assert('the phone key closes it again', !top() && !ctx.frozen);

    ctx.state.replace(data0);
    step(2);
    assert('the phone scenario leaves the world running', !ctx.frozen && !top());
  }
};
