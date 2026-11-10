// Smoke scenario: vegetation (story 16.6). Every tree tile has a crown sprite in the layer above the objects, every hedge tile a
// sliced hedge sprite, the crowns follow the season, a kid standing behind a crown makes it see-through (and it comes back),
// and none of it changed the solid tiles. Registered in scripts/smoke/index.js.
export const vegetation = {
  name: 'vegetation',
  run(game, assert, env) {
    const { step, ctx, gs, player } = env;
    const veg = gs.vegetation;
    const { map, surfaces } = ctx;
    const count = id => map.rows.reduce((n, row) => n + [...row].filter(c => map.legend[c] === id).length, 0);
    assert('one crown sprite per tree tile and one hedge sprite per hedge tile', veg.trees.length === count('tree') && veg.hedges.length === count('hedge'), `${veg.trees.length}/${count('tree')} ${veg.hedges.length}/${count('hedge')}`);
    assert('trees and hedges are still solid tiles', veg.trees.every(t => surfaces.solid(surfaces.at(t.x, t.y - 4))) && veg.hedges.every(h => surfaces.solid(surfaces.at(h.x + 13, h.y + 20))));
    assert('the crowns are one layer above every object and overlap the tile to their north', veg.trees.every(t => t.sprite.depth === veg.cfg.depth && t.sprite.depth > 5000) && veg.trees.every(t => t.sprite.getBounds().top < t.ty * 16 - 4));
    const season = ctx.day.season;
    assert('the crowns wear the current season (a pine keeps its summer look in spring and autumn)', veg.trees.every(t => t.sprite.frame.name.startsWith(`veg-crown-${t.species}-${t.shape}-`)) && gs.textures.get('veg-crowns').has(`veg-crown-oak-0-${season}`));
    assert('Medium sways in the wind pipeline', !veg.webgl || veg.trees[0].sprite.pipeline.name === 'SchulwegWind', veg.trees[0].sprite.pipeline?.name);

    // a kid behind a crown: the crown fades; away from it, it is solid again
    const tree = veg.trees.find(t => !surfaces.solid(surfaces.at(t.x, t.y - 22)) && !surfaces.solid(surfaces.at(t.x, t.y + 14)));
    const home = { x: player.x, y: player.y };
    player.teleport(tree.x, tree.y - 22);
    step(40);
    assert('a kid behind the crown makes it see-through', tree.sprite.alpha < 0.5, `alpha ${tree.sprite.alpha}`);
    assert('crowns that nobody stands behind stay opaque', veg.trees.filter(t => t !== tree && Math.hypot(t.x - tree.x, t.y - tree.y) > 40).every(t => t.sprite.alpha === 1));
    player.teleport(tree.x, tree.y + 14);
    step(60);
    assert('in front of the trunk the crown is solid again', tree.sprite.alpha === 1, `alpha ${tree.sprite.alpha}`);
    player.teleport(home.x, home.y);
    step(2);
  }
};
