// Achievements and daily streaks (story 10.4, ctx.achievements), Phaser-free apart from the optional spark burst. Data: data/achievements.json.
// - Achievements count matching events per kid and unlock once with a toast, sparks and a little xp (`achievement:unlocked`).
// - Streaks count days in a row on which a kid met a condition; DayFlow settles them when the day ends (`settleDay`) and puts the lines into
//   the good-night message. Missing a day starts again from zero, kindly. Milestones pay xp. Events: `streak:up` { player, id, n },
//   `streak:reset` { player, id }.
// All progress is saved in shared.flags (flags.set), so it persists with the save and needs no migration.
export const matchesRule = (rule, payload) => {
  if (rule.filter) for (const [k, v] of Object.entries(rule.filter)) if (payload[k] !== v) return false;
  if (rule.min) for (const [k, v] of Object.entries(rule.min)) if (!(Number(payload[k]) >= v)) return false;
  return true;
};

export class Achievements {
  constructor(ctx, cfg) {
    this.ctx = ctx;
    this.cfg = cfg;
    ctx.achievements = this;
    for (const event of new Set(cfg.achievements.map(a => a.event))) ctx.events.on(event, payload => this.onEvent(event, payload ?? {}));
    ctx.events.on('mission:done', () => this.markHelped());
  }

  get flags() { return this.ctx.state.shared.flags; }

  get day() { return this.ctx.state.shared.clock.day; }

  kidsOf(payload) {
    if (Array.isArray(payload.players)) return payload.players;
    if (Number.isInteger(payload.player)) return [payload.player];
    return this.ctx.players.map(p => p.index);
  }

  count(id, player) { return this.flags[`ach.count.${id}.${player}`] ?? 0; }

  unlocked(id, player) { return !!this.flags[`ach.${id}.${player}`]; }

  unlockedCount(player) { return this.cfg.achievements.filter(a => this.unlocked(a.id, player)).length; }

  onEvent(event, payload) {
    for (const a of this.cfg.achievements) {
      if (a.event !== event || !matchesRule(a, payload)) continue;
      for (const player of this.kidsOf(payload)) {
        if (!this.ctx.state.players[player] || this.unlocked(a.id, player)) continue;
        const n = this.count(a.id, player) + 1;
        this.ctx.state.dispatch('flags.set', { key: `ach.count.${a.id}.${player}`, value: n });
        if (n >= a.n) this.unlock(player, a);
      }
    }
  }

  unlock(player, a) {
    const { ctx } = this;
    ctx.state.dispatch('flags.set', { key: `ach.${a.id}.${player}`, value: this.day });
    ctx.state.dispatch('xp.add', { player, amount: this.cfg.xpReward });
    ctx.events.emit('achievement:unlocked', { player, id: a.id });
    ctx.events.emit('ui:toast', { key: 'ach.unlocked', params: { name: ctx.t(`ach.${a.id}.name`) } });
    const p = ctx.players[player];
    if (p && ctx.particles) ctx.particles.emit('spark', p.x, p.y - 8, { count: 20 });
  }

  markHelped() {
    for (const p of this.ctx.players) this.ctx.state.dispatch('flags.set', { key: `helped.${this.day}.${p.index}` });
  }

  // ---- streaks

  streak(id, player) { return this.flags[`streak.${id}.${player}`] ?? { n: 0, last: 0, best: 0 }; }

  met(streak, player, day) {
    const { ctx } = this;
    if (streak.cond === 'lessons') return ctx.state.players[player].grades.entries.filter(e => e.day === day).length >= (streak.min ?? 1);
    if (streak.cond === 'onTime') return this.flags[`commute.${day}.${player}`] === 0;
    if (streak.cond === 'mission') return !!this.flags[`helped.${day}.${player}`];
    return false;
  }

  // The day is over: update every kid's streaks once and return the (translated) lines for the good-night message.
  settleDay(day) {
    const { ctx, cfg } = this;
    const lines = [];
    if (this.flags[`streak.settled.${day}`]) return lines;
    ctx.state.dispatch('flags.set', { key: `streak.settled.${day}` });
    for (const p of ctx.players) {
      const who = p.character?.name ?? ctx.t('menu.slot.player', { n: p.index + 1 });
      for (const s of cfg.streaks) {
        const before = this.streak(s.id, p.index);
        const name = ctx.t(`streak.${s.id}.name`);
        if (this.met(s, p.index, day)) {
          const n = before.last === day - 1 ? before.n + 1 : 1;
          ctx.state.dispatch('flags.set', { key: `streak.${s.id}.${p.index}`, value: { n, last: day, best: Math.max(before.best, n) } });
          ctx.events.emit('streak:up', { player: p.index, id: s.id, n });
          if (n >= 2) lines.push(ctx.t('streak.up', { who, name, n }));
          if (cfg.milestones.includes(n)) {
            const xp = n * cfg.streakXpPerDay;
            ctx.state.dispatch('xp.add', { player: p.index, amount: xp });
            lines.push(ctx.t('streak.milestone', { who, n, xp }));
          }
        } else if (before.n > 0) {
          ctx.state.dispatch('flags.set', { key: `streak.${s.id}.${p.index}`, value: { n: 0, last: before.last, best: before.best } });
          ctx.events.emit('streak:reset', { player: p.index, id: s.id });
          if (before.n >= 2) lines.push(ctx.t('streak.reset', { who, name }));
        }
      }
    }
    return lines;
  }

  validate(i18n) {
    const problems = [];
    const ids = this.cfg.achievements.map(a => a.id);
    if (new Set(ids).size !== ids.length) problems.push('achievement ids must be unique');
    for (const a of this.cfg.achievements) {
      if (!a.event || !(a.n >= 1)) problems.push(`${a.id}: an event and a count of at least 1`);
      for (const part of ['name', 'desc']) if (!i18n[`ach.${a.id}.${part}`]) problems.push(`${a.id}: missing ${part}`);
    }
    for (const s of this.cfg.streaks) for (const part of ['name', 'desc']) if (!i18n[`streak.${s.id}.${part}`]) problems.push(`streak ${s.id}: missing ${part}`);
    return problems;
  }
}
