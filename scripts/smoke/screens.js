// Smoke scenarios: screens. Each export is { name, run(game, assert, env) }; registered in scripts/smoke/index.js.
import { TestScreen } from '../../ui/screens/TestScreen.js';

// pause screen via the intent, exclusive input, nested freezes
export const screenStack = {
  name: 'screenStack',
  run(game, assert, env) {
    const { step, intent, player, ctx, gs, ui } = env;
    // ---- screen stack: pause via the intent, exclusive input, nested freezes ----
    intent.pause = true;
    step(1);
    intent.pause = false;
    assert('pause intent opens the pause screen and freezes the world', ui.screens.top()?.id === 'pause' && gs.paused && ctx.frozen);
    intent.pause = true;
    step(1);
    intent.pause = false;
    assert('pause intent closes it again', !ui.screens.top() && !ctx.frozen && !gs.paused);
    const px0 = player.x;
    const a = ui.screens.push(new TestScreen(ui, ctx, ui.screens, 'test'));
    const b = ui.screens.push(new TestScreen(ui, ctx, ui.screens, 'test', 40));
    intent.move.x = 1;
    step(20);
    assert('test screens freeze the world and only the top one gets input', ctx.frozen && player.x === px0 && b.received === 20 && a.received === 0, `x ${player.x.toFixed(1)}, top ${b.received}, below ${a.received}`);
    intent.move.x = 0;
    intent.pause = true;
    step(1);
    intent.pause = false;
    assert('popping the top screen keeps the world frozen for the one below', ui.screens.top() === a && ctx.frozen);
    intent.pause = true;
    step(1);
    intent.pause = false;
    assert('popping the last freezing screen restores the world', !ui.screens.top() && !ctx.frozen);
  }
};
