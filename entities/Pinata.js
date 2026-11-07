import { newPinata, whackPinata, rehangPinata } from './stickWorldLogic.js';
import { rollRange, mulberry32 } from '../tools/swingLogic.js';

// The birthday pinata (story 6.2): a `pinata` map object { hp } hung from a party frame (frame, bunting, table with a cake and
// presents are drawn around it). The stick whacks it: it wobbles, and on its last hit it bursts into confetti, candies and coins
// (collectible LootDrops: a candy is worth a few cents, a coin a few more) and a sticker. One burst per game day, flag
// `pinata-<id>-day` holds the day it happened; the next day a new one hangs there. Events: `pinata:hit` { id, player, hp },
// `pinata:burst` { id, player } (the birthday mission of epic 9 listens to it).
const FRAME_HEIGHT = 36; // px of the party-decor texture; the beam sits 6 px below its top

export class Pinata {
  constructor(scene, ctx, cfg) {
    this.scene = scene;
    this.ctx = ctx;
    this.cfg = cfg.pinata;
    this.rng = mulberry32(cfg.seed + 2);
    this.items = [];
    this.day = 0;
    ctx.swingTargets.pinata = this;
    this.loadMap();
    ctx.world.register(this);
  }

  loadMap() {
    const { ctx, scene } = this;
    const ts = ctx.map.tileSize;
    this.day = ctx.state.shared.clock.day;
    this.items = ctx.map.objects.filter(o => o.type === 'pinata').map(o => {
      const x = (o.x + 0.5) * ts;
      const bottom = (o.y + 1) * ts;
      const beam = bottom - FRAME_HEIGHT + 6;
      const item = {
        o, id: o.id, x, y: bottom - 20, flag: `pinata-${o.id}-day`, wobble: 0, state: newPinata(o.hp),
        decor: scene.add.image(x, bottom, 'party-decor').setOrigin(0.5, 1).setScale(ctx.res.inv).setDepth(bottom),
        sprite: scene.add.image(x, beam + 1, 'pinata').setOrigin(0.5, 0).setScale(ctx.res.inv).setDepth(bottom + 1)
      };
      if (ctx.state.shared.flags[item.flag] === this.day) this.setBurst(item, true);
      return item;
    });
  }

  unloadMap() {
    for (const p of this.items) {
      p.decor.destroy();
      p.sprite.destroy();
    }
    this.items = [];
  }

  setBurst(p, burst) {
    p.state.burst = burst;
    p.sprite.setVisible(!burst);
  }

  // The stick can hit a pinata that still hangs there.
  locate(p, pt) {
    pt.x = p.x;
    pt.y = p.y;
    pt.r = this.cfg.radius;
    return !p.state.burst;
  }

  whack(p, player) {
    const { ctx, cfg } = this;
    p.wobble = cfg.wobble;
    const burst = whackPinata(p.state);
    ctx.events.emit('pinata:hit', { id: p.id, player: player.index, hp: p.state.hp });
    if (!burst) return;
    p.sprite.setVisible(false);
    ctx.state.dispatch('flags.set', { key: p.flag, value: this.day });
    ctx.particles.emit('confetti', p.x, p.y, { count: cfg.confetti });
    ctx.particles.emit('paper', p.x, p.y, { count: 6 });
    for (let i = 0; i < cfg.candies; i++) ctx.loot.drop('candy', p.x, p.y, { cents: rollRange(cfg.candyCents, this.rng) });
    for (let i = 0; i < cfg.coins; i++) ctx.loot.drop('coin', p.x, p.y, { cents: rollRange(ctx.loot.cfg.coinCents, this.rng) });
    ctx.loot.drop('sticker', p.x, p.y, { source: 'pinata' });
    ctx.events.emit('ui:toast', { key: 'stick.pinataBurst' });
    ctx.events.emit('pinata:burst', { id: p.id, player: player.index });
  }

  update(dt) {
    const day = this.ctx.state.shared.clock.day;
    if (day !== this.day) { // a new game day: a fresh pinata
      this.day = day;
      for (const p of this.items) if (p.state.burst && this.ctx.state.shared.flags[p.flag] !== day) { rehangPinata(p.state); this.setBurst(p, false); }
    }
    for (const p of this.items) {
      if (p.wobble <= 0) continue;
      p.wobble = Math.max(0, p.wobble - dt);
      p.sprite.setRotation(Math.sin(p.wobble * 28) * 0.55 * (p.wobble / this.cfg.wobble));
    }
  }
}
