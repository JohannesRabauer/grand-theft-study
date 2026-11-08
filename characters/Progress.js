// XP and levels (story 10.2, ctx.progress), Phaser-free apart from the optional celebration effects.
// - XP for activities (data/xp.json): each matching event becomes xp.add actions (the only writer of XP, AD-16).
// - Level-ups: whenever a kid's saved level rises (from any xp.add: lessons, tricks, missions, this table) the service emits
//   `level:up` { player, level } once, shows a toast and bursts sparks at the kid. Loading a save never celebrates.
//   data/attr-growth.json can hook attribute growth onto `level:up`.
export class Progress {
  constructor(ctx, table) {
    this.ctx = ctx;
    this.rules = table.rules;
    this.levels = ctx.state.players.map(p => p.level);
    ctx.progress = this;
    for (const event of new Set(this.rules.map(r => r.event))) {
      ctx.events.on(event, payload => this.award(event, payload ?? {}));
    }
    ctx.events.on('state:changed', ev => this.onState(ev));
  }

  // XP for an event: every rule of that event whose filter fits, for every kid the payload names.
  award(event, payload) {
    const { ctx } = this;
    const players = Array.isArray(payload.players) ? payload.players : [payload.player ?? 0];
    for (const rule of this.rules) {
      if (rule.event !== event) continue;
      if (rule.filter && Object.entries(rule.filter).some(([k, v]) => payload[k] !== v)) continue;
      for (const player of players) if (ctx.state.players[player]) ctx.state.dispatch('xp.add', { player, amount: rule.amount });
    }
  }

  onState(ev) {
    const { ctx } = this;
    if (ev.path === '' || ev.path === undefined) { this.levels = ctx.state.players.map(p => p.level); return; } // a load or a new game: no celebration
    const m = /^players\.(\d+)\.level$/.exec(ev.path);
    if (!m) return;
    const player = Number(m[1]);
    const level = ctx.state.players[player]?.level;
    if (level === undefined) return;
    const before = this.levels[player] ?? level;
    this.levels[player] = level;
    if (level > before) this.celebrate(player, level);
  }

  celebrate(player, level) {
    const { ctx } = this;
    const who = ctx.players[player]?.character?.name ?? ctx.t('menu.slot.player', { n: player + 1 });
    ctx.events.emit('level:up', { player, level });
    ctx.events.emit('ui:toast', { key: 'xp.levelUp', params: { who, level } });
    const p = ctx.players[player];
    if (p && ctx.particles) ctx.particles.emit('spark', p.x, p.y - 8, { count: 24 });
  }
}
