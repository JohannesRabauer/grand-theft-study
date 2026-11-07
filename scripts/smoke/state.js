// Smoke scenarios: state. Each export is { name, run(game, assert, env) }; registered in scripts/smoke/index.js.
// quit to the menu and start a second run
export const quitAndSecondRun = {
  name: 'quitAndSecondRun',
  run(game, assert, env) {
    const { step, pools, player, ctx } = env;
    // ---- back to menu, second run ----
    ctx.events.emit('game:quit');
    step(4);
    assert('quit returns to menu', game.scene.isActive('Menu') && !game.scene.isActive('Game') && !game.scene.isActive('UI'));
    game.scene.getScene('Menu').scene.start('Game');
    step(4);
    const gs2 = game.scene.getScene('Game');
    assert('second run starts', game.scene.isActive('Game') && gs2.ctx && gs2.ctx !== ctx);
    gs2.ctx.input.update = () => {};
    gs2.ctx.input.intent.move.x = 1;
    step(120);
    assert('second run is playable', gs2.ctx.players[0].x > (gs2.ctx.caught?.home?.x ?? 0) || gs2.ctx.players[0].move.velSpeed > 5);
    gs2.ctx.input.intent.move.x = 0;
    const bad = [...gs2.ctx.pools.byName].filter(([, p]) => p.live() > p.cap).map(([n]) => n);
    assert('second run pools within cap', bad.length === 0, bad.join(','));
    assert('player position is finite', Number.isFinite(gs2.ctx.players[0].x) && Number.isFinite(gs2.ctx.players[0].y));
  }
};
