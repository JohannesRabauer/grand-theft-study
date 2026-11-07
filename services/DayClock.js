// The day clock (AD-17, ctx.day): the only owner of game time and the phase machine
// morning -> commute -> school -> afternoon -> evening, then the next day. Free of Phaser.
// Time lives in ctx.state.shared.clock ({ day, minute, phase }) and changes only through the
// `clock.set` action. Events: clock:tick ({ day, minute, phase }, once per game minute and after every
// phase change), phase:ended and phase:started ({ phase, reason, day }). The state already holds the
// next phase when phase:ended fires, so the autosave on it stores where the game continues.
// Without a save slot the clock runs in freeplay (data/day.json `freeplay`): no phase ends by time.
import { compileDay, formatTime, phaseIndexAt, sanitizeClock, scheduledWeather, tintAt } from './dayTime.js';

export class DayClock {
  constructor(ctx, raw) {
    this.ctx = ctx;
    this.cfg = compileDay(raw);
    this.mode = 'story';
    this.acc = 0; // real seconds into the current game minute (not saved)
  }

  // Call once the world exists: picks the mode and restores the clock from the state.
  start() {
    const { cfg } = this;
    this.mode = this.ctx.saves?.activeSlot ? 'story' : 'freeplay';
    let clock = sanitizeClock(cfg, this.ctx.state.shared.clock);
    if (this.mode === 'freeplay') clock = { day: 1, minute: cfg.freeplay.minute, phase: cfg.freeplay.phase };
    this.ctx.state.dispatch('clock.set', clock);
    this.acc = 0;
    this.ctx.events.emit('phase:started', { phase: this.phase, reason: this.mode === 'freeplay' ? 'freeplay' : 'load', day: this.day });
    this.ctx.events.emit('clock:tick', this.snapshot());
  }

  get #clock() { return this.ctx.state.shared.clock; }
  get day() { return this.#clock.day; }
  get minute() { return this.#clock.minute; }
  get phase() { return this.#clock.phase; }
  get phaseIndex() { return phaseIndexAt(this.cfg, this.minute); }
  get season() { return this.cfg.phases[this.phaseIndex].season; }
  get time() { return formatTime(this.minute); }
  get weather() { return scheduledWeather(this.cfg, this.day, this.minute); }
  get tint() { return tintAt(this.cfg, this.minute); }
  get running() { return this.mode === 'story' || this.cfg.freeplay.running; }

  snapshot() { return { day: this.day, minute: this.minute, phase: this.phase }; }

  // Real time in seconds; overlays and the caught frame freeze it with ctx.frozen unless the data says otherwise.
  update(dt) {
    if (!this.running || (this.ctx.frozen && !this.cfg.runWhileFrozen)) return;
    this.acc += dt;
    while (this.acc >= this.cfg.secondsPerMinute) {
      this.acc -= this.cfg.secondsPerMinute;
      this.#step();
    }
  }

  #step() {
    const end = this.cfg.phases[this.phaseIndex].end;
    if (this.minute + 1 >= end) {
      if (this.mode === 'story') this.advance('time');
      else this.acc = 0; // freeplay holds at the end of its phase
      return;
    }
    this.ctx.state.dispatch('clock.set', { day: this.day, minute: this.minute + 1, phase: this.phase });
    this.ctx.events.emit('clock:tick', this.snapshot());
  }

  // A completed lesson or an explicit wait can skip time within this phase; only advance() crosses a phase boundary.
  skipTo(minute, reason) {
    const phase = this.cfg.phases[this.phaseIndex];
    if (!reason || !Number.isInteger(minute) || minute < this.minute || minute >= phase.end) {
      throw new Error('day: skipTo needs a forward time inside the current phase and a reason');
    }
    this.ctx.state.dispatch('clock.set', { day: this.day, minute, phase: this.phase });
    this.acc = 0;
    this.ctx.events.emit('clock:tick', this.snapshot());
  }

  // The only way a phase changes: jumps to the start of the next one (evening leads to the next
  // morning). `reason` says why: 'time' for the clock running out, otherwise what the caller names.
  advance(reason) {
    const { cfg, ctx } = this;
    if (!reason) throw new Error('day: advance needs a reason');
    const ended = { phase: this.phase, reason, day: this.day };
    const next = cfg.phases[this.phaseIndex + 1];
    const clock = next
      ? { day: this.day, minute: next.start, phase: next.id }
      : { day: this.day + 1, minute: cfg.start, phase: cfg.phases[0].id };
    ctx.state.dispatch('clock.set', clock);
    this.acc = 0;
    ctx.events.emit('phase:ended', ended);
    ctx.events.emit('phase:started', { phase: clock.phase, reason, day: clock.day });
    ctx.events.emit('clock:tick', this.snapshot());
  }
}
