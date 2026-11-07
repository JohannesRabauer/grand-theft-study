import { mulberry32, rollLoot, rollRange, readyToday } from '../tools/swingLogic.js';

// Bushes from map objects of type `bush` (story 6.2): walk-through scenery the stick can shake. Whacking one makes it shake and
// throw leaves; after its `hp` whacks it drops one thing from its loot table (`bush.tables` in data/stick-world.json: coins,
// a sticker, ammo for the slingshot, the lost homework, or nothing) through LootDrops, with the table rolled by a seeded
// generator. A bush gives out once per game day: flag `bush-<id>-day` holds the day it last did, later whacks only shake it.
// Emits `bush:shake` { id, player } on each whack and `bush:loot` { id, player, item } when it drops (item is the table entry, 'nothing' included).
export class Bushes {
  constructor(scene, ctx, cfg) {
    this.scene = scene;
    this.ctx = ctx;
    this.cfg = cfg.bush;
    this.rng = mulberry32(cfg.seed);
    this.items = [];
    this.shaking = 0;
    ctx.swingTargets.bush = this;
    this.loadMap();
    ctx.world.register(this);
  }

  loadMap() {
    const { ctx, scene } = this;
    const ts = ctx.map.tileSize;
    this.items = ctx.map.objects.filter(o => o.type === 'bush').map(o => {
      const x = (o.x + 0.5) * ts;
      const y = (o.y + 0.5) * ts;
      return { o, id: o.id, x, y, r: o.r, hp: o.hp, shake: 0, flag: `bush-${o.id}-day`, sprite: scene.add.image(x, y + 6, 'bush').setOrigin(0.5, 0.85).setScale(ctx.res.inv).setDepth(y + 6) };
    });
  }

  unloadMap() {
    for (const b of this.items) b.sprite.destroy();
    this.items = [];
    this.shaking = 0;
  }

  // The hit candidates for the stick: fills pt with the bush's circle.
  locate(b, pt) {
    pt.x = b.x;
    pt.y = b.y;
    pt.r = b.r;
    return true;
  }

  whack(b, player) {
    const { ctx, cfg } = this;
    b.shake = cfg.shake;
    this.shaking++;
    ctx.particles.emit('leaves', b.x, b.y - 4, { count: cfg.leaves });
    ctx.events.emit('bush:shake', { id: b.id, player: player.index });
    const flags = ctx.state.shared.flags;
    const day = ctx.state.shared.clock.day;
    if (!readyToday(flags, b.flag, day) || --b.hp > 0) return;
    b.hp = b.o.hp;
    ctx.state.dispatch('flags.set', { key: b.flag, value: day });
    const entry = rollLoot(this.table(b), this.rng, flags);
    const item = entry.item;
    if (item === 'coins') ctx.loot.drop('coin', b.x, b.y - 4, { cents: rollRange(entry.cents, this.rng) });
    else if (item === 'ammo') ctx.loot.drop('ammo', b.x, b.y - 4, { kind: entry.kind });
    else if (item === 'sticker') ctx.loot.drop('sticker', b.x, b.y - 4, { source: 'bush' });
    else if (item === 'homework') ctx.loot.drop('homework', b.x, b.y - 4);
    else ctx.events.emit('ui:toast', { key: 'stick.bushNothing' });
    ctx.events.emit('bush:loot', { id: b.id, player: player.index, item });
  }

  table(b) {
    return this.cfg.tables[b.o.loot];
  }

  update(dt) {
    if (!this.shaking) return;
    this.shaking = 0;
    for (const b of this.items) {
      if (b.shake <= 0) continue;
      b.shake = Math.max(0, b.shake - dt);
      const k = b.shake / this.cfg.shake;
      b.sprite.setRotation(Math.sin(b.shake * 50) * 0.16 * k).setScale((1 + 0.08 * k) * this.ctx.res.inv, (1 - 0.06 * k) * this.ctx.res.inv);
      if (b.shake > 0) this.shaking++;
    }
  }
}
