// The quest runner (story 9.1, ctx.quests): missions from data/missions.json, saved in state.shared.quests (AD-16 actions).
// - Start: at a phone booth (walk up on foot, interact: the next mission that wants a call and fits the time of day) or
//   by itself when its `trigger.event` fires (the stolen-bike theft emits mission:trigger { id }).
// - Steps end by reaching a place (any player) or by a game event; each advance is a state action and an event.
// - Objective: `objective()` is where the arrow points and the line the HUD shows while a step is open.
// - End: the last step pays the reward (shared wallet cents, xp for every player) and emits mission:done { id, kind }.
// Events: mission:started { id }, mission:step { id, step }, mission:done { id, kind }.
import { MessageScreen } from '../ui/screens/MessageScreen.js';
import { canStart, currentStep, missionById, nextCall, reached, stepFinishedBy } from '../services/questLogic.js';
import { matches } from '../services/Hints.js';

export class Quests {
  constructor(scene, ctx, cfg, inputCfg) {
    this.scene = scene;
    this.ctx = ctx;
    this.cfg = cfg;
    this.inputCfg = inputCfg;
    ctx.quests = this;
    this.booths = new WeakMap();
    this.labels = Array.from({ length: ctx.maxPlayers }, () => scene.add.text(0, 0, '', {
      fontFamily: 'monospace', fontSize: '8px', color: '#fff2a8', backgroundColor: '#243d46', resolution: ctx.res.scale
    }).setOrigin(0.5).setDepth(8100).setVisible(false));
    const names = new Set();
    for (const m of cfg.missions) {
      if (m.trigger?.event) names.add(m.trigger.event);
      for (const f of m.failOn ?? []) names.add(f.event);
      for (const s of m.steps) if (s.event) names.add(s.event);
    }
    for (const name of names) ctx.events.on(name, payload => this.onEvent(name, payload));
    ctx.events.on('lang:changed', () => { for (const l of this.labels) l.questText = null; });
  }

  get quests() { return this.ctx.state.shared.quests; }

  // The booths of the current map: tiles whose ground is a phone booth.
  boothsHere() {
    const { map } = this.ctx;
    let list = this.booths.get(map);
    if (!list) {
      list = [];
      const ts = map.tileSize;
      map.rows.forEach((row, y) => [...row].forEach((c, x) => { if (map.legend[c] === 'booth') list.push({ x: (x + 0.5) * ts, y: (y + 0.5) * ts }); }));
      this.booths.set(map, list);
    }
    return list;
  }

  boothNear(p) { return this.boothsHere().find(b => Math.hypot(p.x - b.x, p.y - b.y) <= 30) ?? null; }

  title(id) { return this.ctx.t(`mission.${id}.title`); }

  // The first open mission step: where to go and what to do, or null.
  objective() {
    for (const entry of this.quests.active) {
      const step = currentStep(this.cfg, entry);
      if (!step?.objective) continue;
      const o = this.place(step.objective);
      if (o) return { id: entry.id, ...o, text: step.text, title: this.title(entry.id) };
    }
    return null;
  }

  // A step's objective as a map spot: fixed, or the hideout of the stolen bike (dynamic).
  place(o) {
    if (!o.dynamic) return o;
    const bike = this.ctx.state.shared.flags[o.dynamic];
    if (!bike) return null;
    const ts = this.ctx.map.tileSize;
    return { map: bike.map, x: bike.x / ts - 0.5, y: bike.y / ts - 0.5 };
  }

  show(title, lines, onDone) {
    const { ctx } = this;
    if (!ctx.screens) { onDone?.(); return; }
    ctx.screens.push(new MessageScreen(this.scene.scene.get('UI'), ctx, ctx.screens, { title, lines, inputCfg: this.inputCfg, onDone }));
  }

  // `call`: a phone call at a booth opens a message to read; a mission that starts by itself (a theft in the middle of a ride)
  // only announces itself with a phone toast, so the world never freezes at a bad moment.
  start(id, call = true) {
    const { ctx } = this;
    if (!ctx.state.dispatch('quest.start', { id })) return false;
    ctx.events.emit('mission:started', { id });
    this.skipDone(id);
    const now = this.quests.active.find(q => q.id === id);
    if (!call) { ctx.events.emit('ui:toast', { key: `mission.${id}.intro`, style: 'phone' }); return true; }
    this.show(this.title(id), [ctx.t(`mission.${id}.intro`), ctx.t('quest.firstStep', { step: ctx.t(missionById(this.cfg, id).steps[now?.step ?? 0].text) })]);
    return true;
  }

  // A phone call at a booth: offers the next mission that fits, or says kindly that nobody has anything now.
  call() {
    const { ctx } = this;
    const m = nextCall(this.cfg, this.quests, ctx.day.phase, ctx.day.day, ctx.state.shared.flags);
    if (m) return this.start(m.id);
    ctx.events.emit('ui:toast', { key: 'quest.noCall' });
    return false;
  }

  advance(id) {
    const { ctx } = this;
    const m = missionById(this.cfg, id);
    const entry = this.quests.active.find(q => q.id === id);
    if (!m || !entry) return;
    if (entry.step + 1 < m.steps.length) {
      ctx.state.dispatch('quest.advance', { id });
      const step = m.steps[entry.step + 1];
      ctx.events.emit('mission:step', { id, step: entry.step + 1 });
      ctx.events.emit('ui:toast', { key: 'quest.next', params: { step: ctx.t(step.text) } });
      this.skipDone(id);
      return;
    }
    if (!ctx.state.dispatch('quest.finish', { id })) return;
    const { cents, xp } = m.reward;
    if (cents > 0) ctx.state.dispatch('wallet.earn', { cents, reason: `mission-${id}` });
    if (xp > 0) for (const p of ctx.players) ctx.state.dispatch('xp.add', { player: p.index, amount: xp });
    ctx.events.emit('mission:done', { id, kind: m.kind, cents, xp });
    if (m.finishEvent) ctx.events.emit(m.finishEvent.name, { ...m.finishEvent.payload });
    const money = ctx.t('hud.money', { v: (cents / 100).toFixed(2).replace('.', ctx.i18n.lang === 'de' ? ',' : '.') });
    if (!m.booth) { ctx.events.emit('ui:toast', { key: `mission.${id}.done`, style: 'phone' }); return; } // started by itself: it also ends with a toast, never a screen that takes the next key press
    this.show(ctx.t('quest.done.title', { title: this.title(id) }), [ctx.t(`mission.${id}.done`), ctx.t('quest.reward', { money, xp })]);
  }

  // A step whose goal is already met (flag) is passed at once; the last step is never skipped.
  skipDone(id) {
    const m = missionById(this.cfg, id);
    const entry = this.quests.active.find(q => q.id === id);
    const step = entry && m.steps[entry.step];
    if (step?.skipIfFlag && this.ctx.state.shared.flags[step.skipIfFlag] && entry.step + 1 < m.steps.length) this.advance(id);
  }

  // A bump to a fragile load costs a life; with none left the mission fails and can be tried again.
  hit(entry, m) {
    const { ctx } = this;
    if (!ctx.state.dispatch('quest.hit', { id: entry.id })) return;
    const left = this.quests.active.find(q => q.id === entry.id).lives;
    if (left > 0) { ctx.events.emit('ui:toast', { key: `mission.${entry.id}.hit`, params: { n: left } }); return; }
    ctx.state.dispatch('quest.abort', { id: entry.id });
    ctx.events.emit('mission:failed', { id: entry.id });
    this.show(this.title(entry.id), [ctx.t(`mission.${entry.id}.fail`)]);
  }

  onEvent(name, payload) {
    const { ctx } = this;
    for (const entry of [...this.quests.active]) {
      const m = missionById(this.cfg, entry.id);
      if (m.failOn?.some(f => f.event === name && matches(f.match, payload)) && entry.step >= (m.failFromStep ?? 0)) this.hit(entry, m);
    }
    for (const m of this.cfg.missions) {
      if (m.trigger?.event === name && matches(m.trigger.match, payload) && canStart(this.cfg, this.quests, m.id, null, ctx.day.day, ctx.state.shared.flags)) this.start(m.id, false);
    }
    for (const entry of [...this.quests.active]) {
      if (stepFinishedBy(currentStep(this.cfg, entry), name, payload)) this.advance(entry.id);
    }
  }

  update() {
    const { ctx } = this;
    if (ctx.screens?.top()) return;
    for (const entry of [...this.quests.active]) {
      const step = currentStep(this.cfg, entry);
      if (!step?.reach) continue;
      const ts = ctx.map.tileSize;
      if (ctx.players.some(p => p.alive && !p.pinned && reached(step, ctx.world.id, p.x, p.y, ts))) { this.advance(entry.id); return; }
    }
    for (const p of ctx.players) {
      const label = this.labels[p.index];
      const booth = !ctx.map.indoor && p.alive && !p.pinned && p.vehicle === 'foot' ? this.boothNear(p) : null;
      label.setVisible(!!booth);
      if (!booth) continue;
      if (ctx.input.intents[p.index].interact && !p.vehicleSwapped) { label.setVisible(false); this.call(); return; }
      label.setPosition(p.x, p.y - 24);
      const text = `${ctx.t(`world.interact.${ctx.input.type === 'keyboard' && p.index === 1 ? 'keyboardP2' : ctx.input.type}`)} ${ctx.t('quest.call')}`;
      if (label.questText !== text) { label.setText(text); label.questText = text; }
    }
  }
}
