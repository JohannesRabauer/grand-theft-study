// Smoke scenario: street dressing (story 16.9). Props near the kid are lent images from the fixed pool (never more than the tier
// allows, the pool never grows), props far away have none, a prop sorts by its feet and never blocks the kid's tile.
// It runs last, after the round trips of earlier scenarios: it moves the kid around the town. Registered in scripts/smoke/index.js.
export const street = {
  name: 'street',
  run(game, assert, env) {
    const { step, h } = env;
    const gs = game.scene.getScene('Game'); // after the second run: the live scene, not env.ctx
    const ctx = gs.ctx;
    const player = ctx.players[0];
    if (ctx.world.id !== 'town') { ctx.world.load('town', 'from-home'); step(4); }
    const sp = gs.streetProps;
    const { surfaces } = ctx;
    const cap = ctx.quality.tier.streetProps ?? 0;
    const pool = sp.free.length + sp.props.filter(p => p.img).length;
    assert('the town has street props and the pool is within the tier cap', sp.props.length >= 80 && pool <= cap && pool === Math.min(cap, sp.props.length), `${sp.props.length} props, pool ${pool}/${cap}`);
    const saved = { x: player.x, y: player.y };
    const hydrant = sp.props.find(p => p.kind === 'hydrant');
    h.teleport(gs, ctx, hydrant.tx, hydrant.ty + 1);
    step(40);
    assert('a prop near the kid has its image, sorted by its feet', !!hydrant.img && hydrant.img.visible && hydrant.img.depth === hydrant.y, `${hydrant.img?.depth} vs ${hydrant.y}`);
    const far = sp.props.filter(p => Math.hypot(p.x - hydrant.x, p.y - hydrant.y) > 400);
    assert('props far from the view have none', far.length > 10 && far.every(p => !p.img));
    assert('the pool does not grow while playing', sp.free.length + sp.props.filter(p => p.img).length === pool);
    assert('props never block: their tile is as walkable as before', !surfaces.solid(surfaces.at(hydrant.x, hydrant.y - 4)), `${hydrant.tx},${hydrant.ty}`);
    const kiosk = sp.props.find(p => p.kind === 'kiosk');
    h.teleport(gs, ctx, kiosk.tx, kiosk.ty + 1);
    step(40);
    assert('the kiosk shows at the newsstand', !!kiosk.img && kiosk.img.visible);
    assert('walking away gives the images back', !hydrant.img && sp.free.length + sp.props.filter(p => p.img).length === pool);
    h.teleport(gs, ctx, saved.x / 16 | 0, saved.y / 16 | 0);
    step(40);
  }
};
