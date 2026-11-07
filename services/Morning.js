export const missingItems = (required, packed) => required.filter(id => !packed.includes(id));

export function requiredItems(cfg, lessons) {
  return [...new Set([...cfg.always, ...lessons.flatMap(l => {
    const items = cfg.byMinigame[l.minigame];
    if (!items) throw new Error(`home: no supplies for "${l.minigame}"`);
    return items;
  })])];
}

export const morningStartMap = (index, maps, saves, clock) =>
  saves.activeSlot && (!clock.phase || clock.phase === 'morning') && maps.home ? 'home' : index.start;

export class Morning {
  constructor(ctx, cfg) {
    this.ctx = ctx;
    this.cfg = cfg;
    ctx.home = this;
    const ids = cfg.items.map(i => i.id);
    if (new Set(ids).size !== ids.length || [...cfg.always, ...Object.values(cfg.byMinigame).flat()].some(id => !ids.includes(id))) {
      throw new Error('home: invalid supply catalog');
    }
    ctx.events.on('phase:started', e => { if (e.phase === 'morning') this.begin(); });
    ctx.events.on('phase:ended', e => {
      if (e.phase === 'morning' && e.reason !== 'leave-home') {
        for (const p of ctx.players) this.check(p.index);
        this.save();
      }
    });
  }

  get available() { return ['morning', 'commute'].includes(this.ctx.day.phase); }
  get day() { return this.ctx.day.day; }
  progress(player) { return this.ctx.state.players[player].morning; }
  required() { return requiredItems(this.cfg, this.ctx.school.schedule().lessons); }
  names(items) { return items.map(id => this.ctx.t(this.cfg.items.find(i => i.id === id).label)).join(', '); }

  begin() {
    for (const p of this.ctx.players) if (this.progress(p.index).day !== this.day) {
      this.change('home.startDay', { player: p.index, day: this.day });
    }
  }

  change(action, payload) {
    if (!this.ctx.state.dispatch(action, payload)) throw new Error(`home: ${action} rejected`);
  }

  save() { if (this.ctx.saves?.activeSlot) this.ctx.saves.save(this.ctx.saves.activeSlot); }

  breakfast(player) {
    if (!this.available || this.ctx.world.id !== this.cfg.map) throw new Error('home: breakfast is not available here now');
    this.begin();
    if (this.progress(player).breakfast) {
      this.ctx.events.emit('ui:toast', { key: 'home.already-eaten' });
      return false;
    }
    this.change('home.breakfast', { player, day: this.day });
    const move = this.ctx.players[player].move;
    move.stamina = 1;
    move.exhausted = false;
    this.ctx.events.emit('player:stamina', { player, value: 1 });
    this.ctx.events.emit('breakfast:eaten', { player, day: this.day });
    this.ctx.events.emit('ui:toast', { key: 'home.breakfast-done' });
    this.save();
    return true;
  }

  setBag(player, items) {
    if (!this.available || this.ctx.world.id !== this.cfg.map) throw new Error('home: packing is not available here now');
    this.begin();
    this.change('bag.set', { player, day: this.day, items });
  }

  check(player) {
    this.begin();
    this.change('bag.check', { player, day: this.day, required: this.required() });
    this.ctx.events.emit('bag:checked', { player, day: this.day, missing: [...this.progress(player).missing] });
    return this.progress(player).missing;
  }

  // Called by the home door as well as the packing screen: walking out can deliberately leave supplies behind.
  leave() {
    if (!this.available) return;
    for (const p of this.ctx.players) this.check(p.index);
    if (this.ctx.day.phase === 'morning') this.ctx.day.advance('leave-home');
    else this.save();
  }

  depart() {
    this.ctx.events.emit('world:enter-request', { map: 'town', entry: 'from-home' });
  }

  lessonNotice(lesson, players) {
    const required = requiredItems(this.cfg, [lesson]);
    const lines = [];
    for (const player of players) {
      const p = this.ctx.state.players[player];
      const missing = missingItems(required, p.morning.day === lesson.day ? p.bag : []);
      if (!missing.length) continue;
      const who = this.ctx.players[player].character?.name ?? this.ctx.t('menu.slot.player', { n: player + 1 });
      lines.push(`${who}: ${this.names(missing)}`);
      this.ctx.events.emit('lesson:supplies-missing', { player, day: lesson.day, lessonId: lesson.id, missing });
    }
    return lines.length ? { key: 'home.borrow', params: { items: lines.join(' / ') } } : null;
  }
}
