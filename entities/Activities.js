// Question activities in the town (story 9.2, ctx.activities): the Pfand machine (the map object `pfand-machine`: walk up on foot, interact)
// and the bakery counter (reached from the bakery shop screen). Both open ActivityScreen for the kid who started them, at most
// `perDay` times a game day per kid. `finish` pays what the run earned: pocket money into the family wallet, xp for the kid; the learning
// results were already recorded answer by answer through the learning engine. Emits `activity:started` { id, player } and
// `activity:done` { id, variant, player, correct, total, cents, xp }.
import { ActivityScreen } from '../ui/screens/ActivityScreen.js';
import { canPlay, dayKey, reward, timesToday } from '../services/activityLogic.js';

export class Activities {
  constructor(scene, ctx, cfg, inputCfg) {
    this.scene = scene;
    this.ctx = ctx;
    this.cfg = cfg;
    this.inputCfg = inputCfg;
    ctx.activities = this;
    this.labels = Array.from({ length: ctx.maxPlayers }, () => scene.add.text(0, 0, '', {
      fontFamily: 'monospace', fontSize: '8px', color: '#fff2a8', backgroundColor: '#243d46', resolution: ctx.res.scale
    }).setOrigin(0.5).setDepth(8100).setVisible(false));
    ctx.events.on('lang:changed', () => { for (const l of this.labels) l.actText = null; });
  }

  get day() { return this.ctx.state.shared.clock.day; }

  left(id, player) { return this.cfg[id].perDay - timesToday(this.ctx.state.shared.flags, id, this.day, player); }

  start(id, player) {
    const { ctx } = this;
    if (!ctx.screens || ctx.screens.top()) return null;
    if (!canPlay(this.cfg, ctx.state.shared.flags, id, this.day, player)) {
      ctx.events.emit('ui:toast', { key: 'activity.limit' });
      return null;
    }
    ctx.events.emit('activity:started', { id, player });
    return ctx.screens.push(new ActivityScreen(this.scene.scene.get('UI'), ctx, ctx.screens, this, id, player));
  }

  finish({ id, variant, player, correct, total }) {
    const { ctx } = this;
    const r = reward(this.cfg, id, variant, correct, total);
    ctx.state.dispatch('flags.set', { key: dayKey(id, this.day, player), value: timesToday(ctx.state.shared.flags, id, this.day, player) + 1 });
    if (r.cents > 0) ctx.state.dispatch('wallet.earn', { cents: r.cents, reason: `activity-${id}` });
    if (r.xp > 0) ctx.state.dispatch('xp.add', { player, amount: r.xp });
    ctx.events.emit('activity:done', { id, variant, player, correct, total, ...r });
    return r;
  }

  machine() { return this.ctx.map.objects.find(o => o.type === 'pfand-machine'); }

  // A play spot (dominoes, ...) next to the machine keeps its own interact when the player stands closer to it.
  playSpotCloser(p, d) {
    const { map } = this.ctx;
    for (const o of map.objects) if (o.type === 'play' && Math.hypot(p.x - (o.x + 0.5) * map.tileSize, p.y - (o.y + 0.5) * map.tileSize) < d) return true;
    return false;
  }

  update() {
    const { ctx } = this;
    const m = !ctx.map.indoor ? this.machine() : null;
    for (const p of ctx.players) {
      const label = this.labels[p.index];
      const d = m ? Math.hypot(p.x - (m.x + 0.5) * ctx.map.tileSize, p.y - (m.y + 0.5) * ctx.map.tileSize) : Infinity;
      const near = m && d <= 30 && !ctx.screens?.top() && p.alive && !p.pinned && p.vehicle === 'foot' && !this.playSpotCloser(p, d);
      label.setVisible(!!near);
      if (!near) continue;
      if (ctx.input.intents[p.index].interact && !p.vehicleSwapped) { label.setVisible(false); this.start('pfand', p.index); continue; }
      label.setPosition(p.x, p.y - 24);
      const text = `${ctx.t(`world.interact.${ctx.input.type === 'keyboard' && p.index === 1 ? 'keyboardP2' : ctx.input.type}`)} ${ctx.t('activity.pfand.prompt')}`;
      if (label.actText !== text) { label.setText(text); label.actText = text; }
    }
  }
}
