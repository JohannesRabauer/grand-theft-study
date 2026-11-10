// Smoke scenario: water (story 16.8). Every body has its shore layer and water image under the shadow layer and above the ground, the
// water tiles are still solid, the tier decides between the pipeline and the frame loop (and a round trip leaves no textures behind),
// the loop advances, and a swimming duck leaves rings. Registered in scripts/smoke/index.js.
export const water = {
  name: 'water',
  run(game, assert, env) {
    const { step, ctx, gs, surfaces } = env;
    const w = gs.water;
    const tex = () => game.textures.getTextureKeys().filter(k => k.startsWith('water-')).length;
    assert('the town has its bodies of water, each with shore and water images', w.bodies.length >= 5 && w.bodies.every(b => b.shore && b.image), `${w.bodies.length}`);
    assert('water sits above the ground and below the shadows and the objects', w.bodies.every(b => b.shore.depth > b.image.depth && b.image.depth > -1 && b.shore.depth < -0.8));
    const tiles = [];
    ctx.map.rows.forEach((row, ty) => [...row].forEach((c, tx) => { if (ctx.map.legend[c] === 'water') tiles.push([tx, ty]); }));
    assert('water tiles are still solid', tiles.length > 200 && tiles.every(([tx, ty]) => surfaces.solid(surfaces.at(tx * 16 + 8, ty * 16 + 8))), `${tiles.length}`);
    const webgl = game.renderer.type === Phaser.WEBGL;
    assert('the tier picks the pipeline or the frame loop', w.shader === (webgl && !!ctx.quality.tier.waterFx), `${w.shader}`);
    const before = tex();
    for (const tier of ['low', 'high', 'medium']) {
      ctx.quality.set(tier);
      step(3);
      assert(`water follows the ${tier} tier`, w.shader === (webgl && !!ctx.quality.tier.waterFx) && w.bodies.every(b => b.image && (w.shader ? b.mask && !b.frames : b.frames && !b.mask)));
    }
    assert('a tier round trip leaves no water textures behind', tex() === before, `${tex()}/${before}`);
    if (!w.shader) {
      const b = w.bodies[0];
      const f = w.frame;
      env.player.teleport(b.ox + b.w / 2, b.oy + b.h + 24);
      step(30);
      assert('the fallback loop moves on', w.frame !== f || w.cfg.fallback.frames === 1, `${f} -> ${w.frame}`);
    }
    const duck = ctx.critters.list.find(c => c.kind === 'duck');
    if (duck) {
      const { x, y } = env.player;
      env.player.teleport(duck.x, duck.y + 40);
      step(5);
      duck.ripple = 0;
      step(1);
      assert('a duck on the pond leaves a ring and waits for the next', duck.ripple > 0.5, `${duck.ripple}`);
      env.player.teleport(x, y);
      step(5);
    }
  }
};
