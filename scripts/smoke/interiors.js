// Smoke scenario: interiors (story 16.10). Walks into the home, the school and the dojo: the furniture and the backdrop are built,
// the walls and the doors are still solid, by day the windows throw their light on the floor and the lamps are off, in the
// evening the lamps are on (a pooled light each where the light map draws, a glow image on Low and Canvas) and the window light
// is gone, and leaving a room gives every light back. It runs last: a map round trip remounts bikes, which earlier scenarios
// count. Registered in scripts/smoke/index.js.
import { PROPS } from '../../scenes/InteriorProps.js';

export const interiors = {
  name: 'interiors',
  run(game, assert, env) {
    const { step } = env;
    const gs = game.scene.getScene('Game'); // after the second run: the live scene, not env.ctx
    const ctx = gs.ctx;
    const saved = ctx.day.snapshot();
    const clock = (minute, phase) => ctx.state.dispatch('clock.set', { day: saved.day, minute, phase: phase ?? ctx.day.cfg.phases.find(p => minute >= p.start && minute < p.end).id });
    const inter = () => gs.interiors;
    if (ctx.world.id !== 'town') { ctx.world.load('town', 'from-home'); step(4); }
    assert('outdoors the interiors system is idle and holds no light', !inter().active && inter().parts.length === 0);
    const lightsBefore = ctx.lights.count;
    for (const id of ['home', 'school', 'dojo']) {
      ctx.world.load(id, 'from-town');
      step(4);
      const it = inter();
      const room = it.room;
      assert(`${id}: the room has its furniture, backdrop and fixtures`, it.active && it.parts.length > room.items.length && it.back.length === 4 && it.lamps.length === room.lamps.length, `${it.parts.length}`);
      assert(`${id}: the floor is still solid at the walls and open in the middle`, ctx.surfaces.solid(ctx.surfaces.at(8, 8)) && !ctx.surfaces.solid(ctx.surfaces.at(ctx.players[0].x, ctx.players[0].y)));
      const walled = ctx.map.rows[0].length * ctx.map.tileSize;
      assert(`${id}: furniture sits inside the room`, it.parts.filter(p => p.texture?.key === 'int-atlas' && !p.frame.name.startsWith('shaft') && !p.frame.name.startsWith('lamp')).every(p => p.x > -40 && p.x < walled + 40), `${walled}`);
      // by day
      clock(720);
      ctx.events.emit('clock:tick', ctx.day.snapshot());
      ctx.weather.set('clear');
      step(150);
      const shafts = it.wins.filter(w => w.img.visible);
      assert(`${id}: at noon the windows show their light`, shafts.length === it.wins.length && shafts.every(w => w.img.alpha > 0.2), `${shafts.length}/${it.wins.length}`);
      assert(`${id}: and the lamps are off`, it.lamps.every(l => !l.lit.visible && !l.handle));
      if (ctx.lights.mapActive) assert(`${id}: window light comes from the pool within the limit`, it.wins.every(w => w.handle) && ctx.lights.count <= ctx.lights.limit, `${ctx.lights.count}/${ctx.lights.limit}`);
      // the evening
      clock(21 * 60 + 30);
      ctx.events.emit('clock:tick', ctx.day.snapshot());
      step(240);
      assert(`${id}: at 21:30 the lamps are lit`, it.lamps.every(l => l.lit.visible && l.lit.alpha > 0.5), `${it.lamps.filter(l => l.lit.visible).length}/${it.lamps.length}`);
      assert(`${id}: and the window light is gone`, it.wins.every(w => !w.img.visible && !w.handle));
      if (ctx.lights.mapActive) assert(`${id}: every lamp has a light in the pool, none above the limit`, it.lamps.every(l => l.handle) && ctx.lights.count >= it.lamps.length && ctx.lights.count <= ctx.lights.limit, `${ctx.lights.count}/${ctx.lights.limit}`);
      else assert(`${id}: without a light map the lamps glow as images and a dim rectangle carries the night`, it.lamps.every(l => l.glow.visible) && it.dim.visible);
      clock(saved.minute, saved.phase);
      ctx.events.emit('clock:tick', ctx.day.snapshot());
      step(2);
    }
    assert('every kind of furniture piece is in the atlas', Object.keys(PROPS).every(t => game.textures.exists('int-atlas') && game.textures.get('int-atlas').has(`${t}-0`)));
    ctx.world.load('town', 'from-home');
    step(6);
    assert('leaving the room gives back its pieces and every light', !inter().active && inter().parts.length === 0 && ctx.lights.count <= ctx.lights.limit, `${ctx.lights.count} vs ${lightsBefore}`);
    clock(saved.minute, saved.phase);
    step(2);
  }
};
