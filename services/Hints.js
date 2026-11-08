// Contextual explanations (story 11.5, AD-27). Listens to game events from data/hints.json and, the first time a hint's
// event fires for a player, asks the UI to open it. A hint is marked seen (saved as a flag, per player) only once the
// player has acknowledged it, so one that never got shown simply comes back at the next occurrence. Nothing here is
// Phaser: `open(def, audience, done)` is supplied by the UI scene and `done()` is called when the reader confirmed.
//
// Quiet by design: never while another screen or a lesson is open, never within `cooldownSeconds` of the previous
// hint, and a hint blocked by either simply waits for its next trigger instead of queueing up behind the player.
export const flagKey = (id, player) => `hint.${id}.${player}`;

export function matches(match, payload) {
  if (!match) return true;
  for (const [field, want] of Object.entries(match)) {
    const got = field === '$' ? payload : payload?.[field];
    if (Array.isArray(want) ? !want.includes(got) : got !== want) return false;
  }
  return true;
}

export class Hints {
  constructor(ctx, cfg, open, now = () => Date.now()) {
    this.ctx = ctx;
    this.cfg = cfg;
    this.open = open;
    this.now = now;
    this.defs = cfg.hints;
    this.byId = new Map(cfg.hints.map(h => [h.id, h]));
    this.nextAt = 0;
    this.showing = null;
    this.off = () => !!window.SCHULWEG_GAME?.hintsOff; // test hook: scripted runs must not be frozen by a tip
    this.handlers = new Map();
    for (const event of new Set(this.defs.map(h => h.event))) {
      const fn = payload => this.fire(event, payload);
      this.handlers.set(event, fn);
      ctx.events.on(event, fn);
    }
  }

  seen(id, player) { return !!this.ctx.state.shared.flags[flagKey(id, player)]; }

  // Players this hint is for, given the event payload.
  audience(def, payload) {
    const all = this.ctx.players.map(p => p.index);
    if (def.who === 'event' && Number.isInteger(payload?.player) && all.includes(payload.player)) return [payload.player];
    return all;
  }

  blocked() {
    const { ctx } = this;
    return this.off() || this.showing || (ctx.screens?.size ?? 0) > 0 || ctx.minigames?.active || this.now() < this.nextAt;
  }

  fire(event, payload) {
    for (const def of this.defs) {
      if (def.event !== event || !matches(def.match, payload)) continue;
      const audience = this.audience(def, payload).filter(p => !this.seen(def.id, p));
      if (!audience.length || this.blocked()) continue;
      this.show(def, audience);
      return; // one hint per event
    }
  }

  show(def, audience) {
    this.showing = def.id;
    this.open(def, audience, () => this.acknowledge(def, audience));
  }

  acknowledge(def, audience) {
    for (const player of audience) this.ctx.state.dispatch('flags.set', { key: flagKey(def.id, player) });
    this.showing = null;
    this.nextAt = this.now() + this.cfg.cooldownSeconds * 1000;
  }

  // The reader left without confirming (scene shutdown): nothing is marked seen.
  abandon() { this.showing = null; }

  destroy() {
    for (const [event, fn] of this.handlers) this.ctx.events.off(event, fn);
    this.handlers.clear();
  }
}
