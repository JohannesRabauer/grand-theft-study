// Audio rules (story 13.1), Phaser- and WebAudio-free so node checks drive them. See data/audio.json.

// A pool of sound voices with a hard cap: a voice is busy until its end time. `take` refuses when every voice is busy, unless the new sound
// is more important than the least important one playing, which it then cuts off (priority 0 = background, higher = more important).
export class VoicePool {
  constructor(cap) {
    this.cap = cap;
    this.ends = [];
    this.prio = [];
    this.dropped = 0;
  }

  prune(now) {
    for (let i = this.ends.length - 1; i >= 0; i--) if (this.ends[i] <= now) { this.ends.splice(i, 1); this.prio.splice(i, 1); }
  }

  active(now) { this.prune(now); return this.ends.length; }

  take(now, dur, priority = 0) {
    this.prune(now);
    if (this.ends.length >= this.cap) {
      let low = 0;
      for (let i = 1; i < this.prio.length; i++) if (this.prio[i] < this.prio[low]) low = i;
      if (!(priority > this.prio[low])) { this.dropped++; return false; }
      this.ends.splice(low, 1);
      this.prio.splice(low, 1);
    }
    this.ends.push(now + dur);
    this.prio.push(priority);
    return true;
  }
}

// Which sound belongs to a game event or an `sfx:play` name; null when there is none.
export const soundFor = (cfg, name) => (cfg.sfx[name] ? name : cfg.events[name] ?? null);

export function validateAudio(cfg, sourceEvents) {
  const problems = [];
  if (!(cfg.voiceCap >= 4 && cfg.voiceCap <= 16)) problems.push('voiceCap must be between 4 and 16');
  if (!(cfg.masterGain > 0 && cfg.masterGain <= 1)) problems.push('masterGain must be in (0, 1]');
  for (const [id, s] of Object.entries(cfg.sfx)) {
    if (!(s.dur > 0 && s.dur <= 2.5)) problems.push(`${id}: dur must be 0 to 2.5 seconds`);
    if (!(s.gain > 0 && s.gain <= 1)) problems.push(`${id}: gain must be in (0, 1]`);
    if (!s.noise && !['sine', 'square', 'triangle', 'sawtooth'].includes(s.wave)) problems.push(`${id}: needs a wave or noise`);
    if (!s.noise && !(s.f0 > 20 && s.f1 > 20)) problems.push(`${id}: needs f0 and f1 (Hz)`);
  }
  for (const [ev, id] of Object.entries(cfg.events)) {
    if (!cfg.sfx[id]) problems.push(`event ${ev} plays unknown sound ${id}`);
    if (sourceEvents && !sourceEvents.includes(ev)) problems.push(`event ${ev} is never emitted by the game`);
  }
  return problems;
}
