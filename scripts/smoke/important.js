// Smoke scenario: important text waits for explicit acknowledgement (story 11.6). Registered in scripts/smoke/index.js. A message screen and
// the phone stay open for half a minute of frames while the world stays frozen and the clock stands still, a key held since before they
// opened cannot dismiss them, and a fresh press closes them and the game runs on. Toasts stay incidental: they time out and never freeze.
import { MessageScreen } from '../../ui/screens/MessageScreen.js';

export const important = {
  name: 'important',
  run(game, assert, env) {
    const { step, ctx, ui } = env;
    const top = () => ui.screens.top();
    const intent = ctx.input.intents[0];
    const data0 = ctx.state.data;
    let done = 0;
    const minute0 = ctx.day.minute;
    const lines = ['Important rules, read as long as you like.', 'Second paragraph.'];

    // ---- a message that arrives while a key is still held
    intent.jump = true;
    ctx.screens.push(new MessageScreen(ui, ctx, ctx.screens, { title: 'Read me', lines, inputCfg: game.cache.json.get('input'), onDone: () => { done++; } }));
    step(1800);
    assert('a message stays open for half a minute of frames with the world frozen and the clock still', top()?.id === 'message' && ctx.frozen && ctx.day.minute === minute0 && done === 0, `${top()?.id} ${ctx.day.minute} vs ${minute0}`);
    intent.jump = false;
    step(2);
    intent.jump = true;
    step(2);
    intent.jump = false;
    step(2);
    assert('a fresh press closes it, calls onDone once and the game runs again', !top() && !ctx.frozen && done === 1, `${top()?.id} ${done}`);

    // ---- the phone stays too
    ctx.phone.deliver({ id: 'mom-morning', from: 'mom', on: 'day:morning', perDay: true });
    ctx.phone.toggle();
    step(1800);
    assert('the phone stays open as long as it is read', top()?.id === 'phone' && ctx.frozen, `${top()?.id} ${ctx.frozen} ${ctx.phone.inbox.length}`);
    ctx.phone.toggle();
    step(2);
    assert('and closes on request', !top() && !ctx.frozen);

    // ---- toasts are incidental
    ctx.events.emit('ui:toast', { key: 'phone.new', params: { from: 'x' } });
    step(2);
    assert('a toast does not freeze the game', !ctx.frozen && !top());
    step(300);
    assert('and times out by itself', !ui.hud.get('toast').text.visible || ui.hud.get('toast').until <= ui.time.now);

    ctx.state.replace(data0);
    step(2);
  }
};
