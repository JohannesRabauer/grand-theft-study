// The audio service (story 13.1, ctx.audio): procedural sound effects with the Web Audio API (data/audio.json). Mute-until-tap: the
// AudioContext is created lazily on the first pointer or key press (`unlock`), nothing plays before and nothing plays while the family has
// switched sound off (flag audioMuted). A voice cap keeps the mix clean (services/audioLogic.js VoicePool). Game events and the existing
// `sfx:play` hook ({ name }) are mapped to sounds by the data. Emits `audio:unlocked` and `audio:played` { name }. One AudioContext is shared
// by every run of the game (window.SCHULWEG_AUDIO); the gesture listeners are removed once it is unlocked.
import { VoicePool, soundFor } from './audioLogic.js';

export class Audio {
  constructor(ctx, cfg, env = {}) {
    this.ctx = ctx;
    this.cfg = cfg;
    this.win = env.window ?? window;
    this.AC = env.AudioContext ?? this.win.AudioContext ?? this.win.webkitAudioContext ?? null;
    this.shared = (this.win.SCHULWEG_AUDIO ??= { ac: null, master: null, noise: null });
    this.pool = new VoicePool(cfg.voiceCap);
    this.seed = 0x2545f491;
    this.played = 0;
    this.refused = 0;
    ctx.audio = this;
    this.gesture = () => this.unlock();
    if (this.shared.ac) this.shared.ac.resume?.();
    else for (const e of cfg.unlockOn) this.win.addEventListener(e, this.gesture, { passive: true });
    for (const ev of Object.keys(cfg.events)) ctx.events.on(ev, () => this.play(cfg.events[ev]));
    ctx.events.on('sfx:play', e => this.play(soundFor(cfg, e?.name)));
  }

  get unlocked() { return !!this.shared.ac; }

  get muted() { return !!this.ctx.state.shared.flags.audioMuted; }

  // The first gesture: create (or wake) the AudioContext. Returns whether sound is available.
  unlock() {
    if (!this.shared.ac) {
      if (!this.AC) return false;
      try {
        const ac = new this.AC();
        const master = ac.createGain();
        master.gain.value = this.cfg.masterGain;
        master.connect(ac.destination);
        this.shared.ac = ac;
        this.shared.master = master;
        const buf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
        const d = buf.getChannelData(0);
        let s = 12345;
        for (let i = 0; i < d.length; i++) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; d[i] = (s / 4294967296) * 2 - 1; } // not Math.random: the seeded runs stay repeatable
        this.shared.noise = buf;
      } catch { return false; }
      for (const e of this.cfg.unlockOn) this.win.removeEventListener(e, this.gesture);
    }
    this.shared.ac.resume?.();
    this.ctx.events.emit('audio:unlocked', {});
    return true;
  }

  rand() { this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0; return this.seed / 4294967296; }

  // Plays a sound by name; false when it is not played (unknown, muted, before the first gesture, voice cap).
  play(name) {
    if (!name || !this.unlocked) { if (name) this.refused++; return false; }
    const spec = this.cfg.sfx[name];
    if (!spec || this.muted) return false;
    const ac = this.shared.ac;
    const now = ac.currentTime;
    if (!this.pool.take(now, spec.dur, spec.priority)) return false;
    const pitch = 1 + (this.rand() - 0.5) * 0.06;
    const end = now + spec.dur;
    const gain = ac.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(spec.gain, now + Math.min(0.01, spec.dur / 4));
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    gain.connect(this.shared.master);
    let src;
    if (spec.noise) {
      src = ac.createBufferSource();
      src.buffer = this.shared.noise;
      const filter = ac.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(spec.f0 * pitch, now);
      filter.frequency.exponentialRampToValueAtTime(spec.f1 * pitch, end);
      src.connect(filter);
      filter.connect(gain);
    } else {
      src = ac.createOscillator();
      src.type = spec.wave;
      src.frequency.setValueAtTime(spec.f0 * pitch, now);
      src.frequency.exponentialRampToValueAtTime(spec.f1 * pitch, end);
      src.connect(gain);
    }
    src.start(now);
    src.stop(end + 0.02);
    this.played++;
    this.ctx.events.emit('audio:played', { name });
    return true;
  }

  destroy() {
    for (const e of this.cfg.unlockOn) this.win.removeEventListener(e, this.gesture);
  }
}
