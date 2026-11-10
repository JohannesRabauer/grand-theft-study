// Small collectibles that pop out of bushes, crates, boxes and the pinata (story 6.2): a coin, a candy, a pebble or acorn for the
// slingshot, a sticker, the lost homework. A pooled ring of sprites (the oldest is recycled when full); any player who walks over a
// drop collects it and its effect goes through the state store or an event:
//   coin / candy -> `wallet.earn`; ammo -> the collector's slingshot magazine (stays on the ground while it is full);
//   sticker -> `sticker:found` { player, source } (the sticker collection comes in epic 10); homework -> flag `lostHomeworkFound`
//   (the lost-homework mission hooks onto it) and `homework:found` { player }.
// Crates and boxes that break (`prop:broken`) may hide a few coins (`loot` in data/props.json).
// `drop(kind, x, y, data)`: data is { cents } for coins and candy, { kind } for ammo, { source } for stickers. Emits `loot:collected` { player, kind, ... }.
import { mulberry32, rollRange } from '../tools/swingLogic.js';

export class LootDrops {
  constructor(scene, ctx, cfg, toolCfg) {
    this.ctx = ctx;
    this.cfg = cfg.drops;
    this.toolCfg = toolCfg;
    this.items = [];
    for (let i = 0; i < this.cfg.pool; i++) {
      this.items.push({
        sprite: scene.add.image(0, 0, 'loot-coin').setScale(ctx.res.inv).setVisible(false),
        active: false, kind: '', x: 0, y: 0, fromX: 0, fromY: 0, t: 0, life: 0, data: null
      });
    }
    this.next = 0;
    this.rng = mulberry32(cfg.seed + 1);
    ctx.events.on('prop:broken', e => this.propBroken(e));
    ctx.loot = this;
    ctx.world.register(this);
    const self = this;
    ctx.pools.register('lootDrops', { live: () => self.items.filter(i => i.active).length, cap: this.cfg.pool });
  }

  texture(kind, data) {
    return kind === 'ammo' ? this.toolCfg.ammo[data.kind].texture : `loot-${kind}`;
  }

  // The drop pops up from (x, y) and lands a few px away on free ground.
  drop(kind, x, y, data = null) {
    const it = this.items[this.next];
    this.next = (this.next + 1) % this.items.length;
    const { surfaces } = this.ctx;
    const a = Math.random() * Math.PI * 2;
    const d = this.cfg.spread * (0.5 + Math.random() * 0.5);
    const lx = x + Math.cos(a) * d;
    const ly = y + Math.sin(a) * d;
    const free = !surfaces.solid(surfaces.at(lx, ly));
    it.active = true;
    it.kind = kind;
    it.data = data;
    it.fromX = x;
    it.fromY = y;
    it.x = free ? lx : x;
    it.y = free ? ly : y;
    it.t = 0;
    it.life = this.cfg.life;
    it.sprite.setTexture(this.texture(kind, data)).setPosition(x, y).setDepth(y + 10).setVisible(true);
    return it;
  }

  propBroken({ prop, x, y }) {
    const loot = prop.k.loot;
    if (loot && this.rng() < loot.chance) this.drop('coin', x, y, { cents: rollRange(loot.cents, this.rng) });
  }

  unloadMap() {
    for (const it of this.items) {
      it.active = false;
      it.sprite.setVisible(false);
    }
  }

  loadMap() {}

  update(dt) {
    const { cfg } = this;
    const { players } = this.ctx;
    for (const it of this.items) {
      if (!it.active) continue;
      it.t += dt;
      if (it.t >= it.life) {
        this.release(it);
        continue;
      }
      const u = Math.min(1, it.t / cfg.popSeconds);
      const lift = u < 1 ? Math.sin(Math.PI * u) * cfg.pop : Math.sin(it.t * 5) * 0.8 - 1;
      it.sprite.setPosition(it.fromX + (it.x - it.fromX) * u, it.fromY + (it.y - it.fromY) * u - lift).setDepth(it.y + 10);
      it.sprite.setAlpha(it.life - it.t < 3 ? 0.4 + 0.6 * Math.abs(Math.sin(it.t * 12)) : 1); // blinks before it is gone
      if (u < 1) continue;
      for (const p of players) {
        if (p.pinned || Math.hypot(p.x - it.x, p.y - it.y) > cfg.radius) continue;
        if (this.collect(it, p)) break;
      }
    }
  }

  release(it) {
    it.active = false;
    it.sprite.setVisible(false);
  }

  // false when the player cannot take it now (a full slingshot magazine)
  collect(it, player) {
    const { ctx } = this;
    const { state, events } = ctx;
    const info = { player: player.index, kind: it.kind };
    if (it.kind === 'coin' || it.kind === 'candy') {
      state.dispatch('wallet.earn', { cents: it.data.cents, reason: `loot-${it.kind}` });
      info.cents = it.data.cents;
    } else if (it.kind === 'ammo') {
      const sling = player.toolbelt.tools.find(t => t.id === 'slingshot');
      const amount = this.toolCfg.ammo[it.data.kind].amount;
      if (!sling || sling.ammo >= sling.max) return false;
      sling.addAmmo(amount);
      events.emit('ammo:pickup', { player: player.index, kind: it.data.kind, amount });
      info.amount = amount;
    } else if (it.kind === 'sticker') {
      events.emit('sticker:found', { player: player.index, source: it.data?.source });
      events.emit('ui:toast', { key: 'loot.sticker' });
    } else if (it.kind === 'homework') {
      state.dispatch('flags.set', { key: 'lostHomeworkFound' });
      events.emit('homework:found', { player: player.index });
      events.emit('ui:toast', { key: 'loot.homework' });
    }
    ctx.particles.emit('sparkle', it.x, it.y - 3, { count: 3 });
    events.emit('loot:collected', info);
    this.release(it);
    return true;
  }
}
