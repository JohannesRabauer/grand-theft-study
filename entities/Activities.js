// Question activities in the town (story 9.2, ctx.activities): the Pfand machine (the map object `pfand-machine`: walk up on foot, interact)
// and the bakery counter (reached from the bakery shop screen). Both open ActivityScreen for the kid who started them, at most
// `perDay` times a game day per kid. `finish` pays what the run earned: pocket money into the family wallet, xp for the kid; the learning
// results were already recorded answer by answer through the learning engine. Emits `activity:started` { id, player } and
// `activity:done` { id, variant, player, correct, total, cents, xp }.
import { ActivityScreen } from '../ui/screens/ActivityScreen.js';
import { stopKey } from '../services/commuteLogic.js';
import { canPlay, dayKey, reward, spotKey, timesToday } from '../services/activityLogic.js';

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

  start(id, player, spot) {
    const { ctx } = this;
    if (!ctx.screens || ctx.screens.top()) return null;
    if (!canPlay(this.cfg, ctx.state.shared.flags, id, this.day, player, spot)) {
      ctx.events.emit('ui:toast', { key: 'activity.limit' });
      return null;
    }
    ctx.events.emit('activity:started', { id, player, spot });
    return ctx.screens.push(new ActivityScreen(this.scene.scene.get('UI'), ctx, ctx.screens, this, id, player, spot));
  }

  finish({ id, variant, player, spot, correct, total }) {
    const { ctx } = this;
    const r = reward(this.cfg, id, variant, correct, total);
    if (this.cfg[id].perSign) ctx.state.dispatch('flags.set', { key: spotKey(id, spot, player), value: true });
    else ctx.state.dispatch('flags.set', { key: dayKey(id, this.day, player), value: timesToday(ctx.state.shared.flags, id, this.day, player) + 1 });
    if (id === 'tramquiz' && correct >= 1) {
      ctx.state.dispatch('flags.set', { key: stopKey(spot), value: true });
      ctx.events.emit('tram:unlocked', { stop: spot, player });
      ctx.events.emit('ui:toast', { key: 'tram.unlocked', params: { stop: ctx.t(`tram.stop.${spot}`) } });
    }
    if (id === 'route') for (let i = 0; i < correct; i++) ctx.events.emit('route:hit', { player, n: i + 1 });
    if (r.cents > 0) ctx.state.dispatch('wallet.earn', { cents: r.cents, reason: `activity-${id}` });
    if (r.xp > 0) ctx.state.dispatch('xp.add', { player, amount: r.xp });
    ctx.events.emit('activity:done', { id, variant, player, correct, total, ...r });
    return r;
  }

  // The spots of the town an activity starts from: the Pfand machine, the newsstand and the English signs (once per kid each).
  spots() {
    const { map } = this.ctx;
    if (this._spotsFor !== map) {
      this._spotsFor = map;
      this._spots = map.indoor ? [] : map.objects.flatMap(o => {
        const id = o.type === 'pfand-machine' ? 'pfand' : o.type === 'newsstand' ? 'route' : o.type === 'sign' && o.board ? 'scan' : null;
        return id ? [{ id, spot: o.id, x: (o.x + 0.5) * map.tileSize, y: (o.y + 0.5) * map.tileSize, r: id === 'scan' ? 26 : 30 }] : [];
      });
    }
    return this._spots;
  }

  machine() { return this.ctx.map.objects.find(o => o.type === 'pfand-machine'); }

  // The nearest usable spot for a player, or null; a play spot standing closer keeps its own interact.
  spotNear(p) {
    const { flags } = this.ctx.state.shared;
    let best = null;
    let bd = Infinity;
    for (const s of this.spots()) {
      const d = Math.hypot(p.x - s.x, p.y - s.y);
      if (d > s.r || d >= bd) continue;
      if (this.cfg[s.id].perSign && flags[spotKey(s.id, s.spot, p.index)]) continue;
      best = s;
      bd = d;
    }
    return best && !this.playSpotCloser(p, bd) ? best : null;
  }

  playSpotCloser(p, d) {
    const { map } = this.ctx;
    for (const o of map.objects) if (o.type === 'play' && Math.hypot(p.x - (o.x + 0.5) * map.tileSize, p.y - (o.y + 0.5) * map.tileSize) < d) return true;
    return false;
  }

  update() {
    const { ctx } = this;
    for (const p of ctx.players) {
      const label = this.labels[p.index];
      const s = !ctx.screens?.top() && p.alive && !p.pinned && p.vehicle === 'foot' ? this.spotNear(p) : null;
      label.setVisible(!!s);
      if (!s) continue;
      if (ctx.input.intents[p.index].interact && !p.vehicleSwapped) { label.setVisible(false); this.start(s.id, p.index, s.spot); continue; }
      label.setPosition(p.x, p.y - 24);
      const text = `${ctx.t(`world.interact.${ctx.input.type === 'keyboard' && p.index === 1 ? 'keyboardP2' : ctx.input.type}`)} ${ctx.t(`activity.${s.id}.prompt`)}`;
      if (label.actText !== text) { label.setText(text); label.actText = text; }
    }
  }
}
