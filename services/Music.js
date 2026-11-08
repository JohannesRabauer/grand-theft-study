// The music (stories 13.2 and 13.3, ctx.music): a step sequencer on the audio service's AudioContext (data/music.json). One theme per day
// phase, coloured by the season of that phase, switched at the phase boundary (`phase:started`). While a chase runs, layers stack with the
// Aerger level (1 to 5) and the tempo rises a little per level; when the chase ends the layers drop again. It waits for the first gesture like
// every sound (audio:unlocked), respects the sound switch and stays quiet while a minigame is open (those have their own music). Notes are
// scheduled a short time ahead from a timer. Emits `music:theme` { id, phase, season, bpm } and `music:layers` { level, layers }.
import { layerNote, layersAt, midiToHz, stepNotes, stepSeconds, themeFor } from './musicLogic.js';

export class Music {
  constructor(ctx, cfg, audio) {
    this.ctx = ctx;
    this.cfg = cfg;
    this.audio = audio;
    this.theme = null;
    this.step = 0;
    this.nextTime = 0;
    this.level = 0;
    this.timer = null;
    this.out = null;
    this.notes = { bass: null, melody: null };
    this.layer = { kind: '', gain: 0, wave: '', midi: null };
    this.scheduled = 0;
    ctx.music = this;
    ctx.events.on('phase:started', () => this.onPhase());
    ctx.events.on('chase:level', e => this.onLevel(e.level));
    ctx.events.on('audio:unlocked', () => this.start());
    this.onPhase();
    this.onLevel(ctx.chase?.level ?? 0, true);
    if (audio.unlocked) this.start();
  }

  get playing() { return !!this.timer; }

  // The theme of the current phase in its season (changes only at phase boundaries).
  onPhase() {
    const day = this.ctx.day;
    this.setTheme(day?.phase, day?.season);
  }

  setTheme(phase, season) {
    const theme = themeFor(this.cfg, phase, season);
    if (!theme || theme.id === this.theme?.id) return false;
    this.theme = theme;
    this.step = 0;
    this.ctx.events.emit('music:theme', { id: theme.id, phase: theme.phase, season: theme.season, bpm: theme.bpm });
    return true;
  }

  onLevel(level, quiet = false) {
    if (level === this.level && !quiet) return;
    this.level = level;
    if (!quiet) this.ctx.events.emit('music:layers', { level, layers: layersAt(this.cfg, level) });
  }

  start() {
    const ac = this.audio.shared.ac;
    if (this.timer || !ac) return false;
    this.out = ac.createGain();
    this.out.gain.value = this.cfg.musicGain;
    this.out.connect(ac.destination);
    this.timer = setInterval(() => this.tick(), this.cfg.tickMs);
    return true;
  }

  // Schedules the steps that fall into the next `lookahead` seconds (also called by tests with a fake clock).
  tick() {
    const ac = this.audio.shared.ac;
    if (!ac || !this.theme || this.audio.muted || this.ctx.screens?.top()?.id === 'minigame') { this.nextTime = 0; return 0; }
    const lv = this.ctx.chase?.level ?? 0;
    if (lv !== this.level) this.onLevel(lv); // the chase level is read here too, so a missed event never leaves stale layers
    const now = ac.currentTime;
    if (this.nextTime < now) this.nextTime = now + 0.05;
    let n = 0;
    while (this.nextTime < now + this.cfg.lookahead) {
      this.playStep(this.nextTime);
      this.nextTime += stepSeconds(this.cfg, this.theme, this.level);
      this.step++;
      n++;
    }
    return n;
  }

  playStep(t) {
    const { theme, cfg, notes } = this;
    const dur = stepSeconds(cfg, theme, this.level);
    stepNotes(theme, this.step, notes);
    if (notes.bass !== null) this.tone(t, notes.bass, dur * 1.8, 'triangle', 0.9);
    if (notes.melody !== null) this.tone(t, notes.melody, dur * 1.5, theme.wave, 0.6);
    if (this.level > 0) {
      for (const l of cfg.chase.layers) {
        if (this.level < l.minLevel || !layerNote(theme, l, this.step, this.layer)) continue;
        if (this.layer.kind === 'noise') this.hat(t, this.layer.gain);
        else this.tone(t, this.layer.midi, dur * 0.9, this.layer.wave, this.layer.gain);
      }
    }
    this.scheduled++;
  }

  tone(t, midi, dur, wave, gain) {
    const ac = this.audio.shared.ac;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(this.out);
    const o = ac.createOscillator();
    o.type = wave;
    o.frequency.setValueAtTime(midiToHz(midi), t);
    o.connect(g);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  hat(t, gain) {
    const ac = this.audio.shared.ac;
    const g = ac.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    g.connect(this.out);
    const s = ac.createBufferSource();
    s.buffer = this.audio.shared.noise;
    const f = ac.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.setValueAtTime(6000, t);
    s.connect(f);
    f.connect(g);
    s.start(t);
    s.stop(t + 0.05);
  }

  destroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.out?.disconnect?.();
    this.out = null;
  }
}
