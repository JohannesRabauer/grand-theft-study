// Smoke scenario: the minimap (story 11.2). Registered in scripts/smoke/index.js. Toggles it with the real map key intent and checks that it
// shows the world's tiles, the players, the objective and - with a bully on the street - the spotted radius, then hides it again.
export const minimap = {
  name: 'minimap',
  run(game, assert, env) {
    const { step, ctx, press, player } = env;
    const mm = ctx.minimap;
    const events = [];
    ctx.events.on('minimap:toggled', e => events.push(e));
    assert('the minimap exists and starts hidden', !!mm && mm.shown === false && !mm.image.visible);
    assert('it holds one pixel per tile of the town', mm.cols === ctx.map.rows[0].length && mm.rows === ctx.map.rows.length && game.textures.exists(mm.key) && game.textures.get(mm.key).getSourceImage().width === mm.cols);
    press('map');
    step(2);
    assert('the map key shows it', mm.shown && mm.image.visible && mm.gfx.visible && events.length === 1 && events[0].on === true);
    assert('the tile map fits its corner', mm.cols * mm.s <= 141 && mm.rows * mm.s <= 97 && mm.x0 + mm.cols * mm.s <= ctx.res.w);
    ctx.chase.lvl.set(1, 'smoke');
    step(30);
    const bullies = ctx.chase.bullies.filter(b => b.active).length;
    step(6);
    assert('the players, the objective and the bullies are drawn without errors', mm.gfx.commandBuffer.length > 0 && (bullies === 0 || mm.gfx.commandBuffer.length > 10), `${mm.gfx.commandBuffer.length} commands, ${bullies} bullies`);
    ctx.chase.reset();
    press('map');
    step(2);
    assert('pressing the map key again hides it', !mm.shown && !mm.image.visible && events.length === 2 && events[1].on === false);
  }
};
