// Smoke scenario: buildings (story 16.7). Every roof edge has its eave image at the depth of its base line, the walls are still
// solid, the awnings hang above the objects, and with the evening switched on the windows near the kid show lit panes and
// (where the light map draws) take their ground lights from the pool without passing the tier limit. Registered in scripts/smoke/index.js.
import { roofEdges } from '../../render/buildingMath.js';
import { outdoorInfo } from '../../scenes/BuildingArt.js';

export const buildings = {
  name: 'buildings',
  run(game, assert, env) {
    const { step, ctx, gs, player } = env;
    const b = gs.buildings;
    const { map, surfaces } = ctx;
    const info = outdoorInfo(map, ctx.world.id);
    let edges = 0;
    for (const bd of info.list) for (const [tx, ty] of bd.cells) if (roofEdges(info, tx, ty)) edges++;
    const pieces = b.chunks.flatMap(c => c.pieces);
    const rims = pieces.filter(p => p.frame.startsWith('rim-'));
    assert('every roof edge tile has an eave piece', rims.length === edges && edges > 100, `${rims.length}/${edges}`);
    assert('eaves sort with the objects by the base line of their tile', rims.every(p => Math.abs((p.depth + 0.5) % 16) < 1e-6));
    assert('buildings are still solid', info.list.every(bd => bd.cells.every(([tx, ty]) => surfaces.solid(surfaces.at(tx * 16 + 8, ty * 16 + 8)))));
    assert('awnings hang in the layer above the objects', b.objs.filter(o => o.frame.name.startsWith('awning-')).every(o => o.depth === b.cfg.awningDepth));

    assert('only chunks near the view have images', b.chunks.length > 5 && b.chunks.some(c => !c.imgs) && b.chunks.some(c => c.imgs) && b.chunks.every(c => !c.imgs || c.imgs.length === c.pieces.length), `${b.chunks.filter(c => c.imgs).length}/${b.chunks.length}`);

    // the evening: switch the schedule on and darken the light map, then stand in front of a window
    const w = b.wins.find(x => x.occupied && x.ty > 4 && !surfaces.solid(surfaces.at(x.x, (x.ty + 1) * 16 + 10)));
    const saved = { on: b.cfg.windows.on, dark: gs.lightMap.dark, x: player.x, y: player.y };
    b.cfg.windows.on = 0;
    gs.lightMap.dark = 0.4;
    player.teleport(w.x, (w.ty + 1) * 16 + 10);
    step(60);
    const shown = b.wins.filter(x => x.img && x.img.visible);
    assert('windows in view show lit panes', shown.length > 0 && shown.every(x => x.img.alpha > 0.5), `${shown.length}`);
    const limit = ctx.quality.tier.windowLights ?? 0;
    assert('window lights stay within the tier limit', b.held <= limit && ctx.lights.count <= ctx.lights.limit, `${b.held}/${limit} ${ctx.lights.count}/${ctx.lights.limit}`);
    assert('where the light map draws, the window ahead has its ground light', !ctx.lights.mapActive || limit === 0 || b.held > 0, `${b.held}`);
    b.cfg.windows.on = saved.on;
    gs.lightMap.dark = saved.dark;
    player.teleport(saved.x, saved.y);
    step(60);
    assert('by day the lights go out again', b.held === 0 || gs.lightMap.dark > 0.1, `${b.held}`);
  }
};
