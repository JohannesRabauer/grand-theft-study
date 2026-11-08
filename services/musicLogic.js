// Music rules (stories 13.2 and 13.3), WebAudio-free so node checks drive them. See data/music.json.

export const midiToHz = m => 440 * 2 ** ((m - 69) / 12);

// A scale degree to a MIDI note: 0 is the root, 7 the root an octave up, negative degrees go below it.
export function degreeToMidi(root, scale, degree) {
  const n = scale.length;
  const oct = Math.floor(degree / n);
  return root + oct * 12 + scale[((degree % n) + n) % n];
}

// The theme of a phase in a season: tempo, root, scale, melody wave and the two patterns. null for an unknown phase.
export function themeFor(cfg, phase, season) {
  const p = cfg.phases[phase];
  if (!p) return null;
  const known = cfg.seasons[season] ? season : 'autumn';
  const s = cfg.seasons[known];
  return { id: `${phase}.${known}`, phase, season: known, bpm: p.bpm * s.tempoMul, root: s.root, scale: cfg.scales[s.scale], wave: s.wave, bass: p.bass, melody: p.melody };
}

// Seconds per step (an eighth note) at a tempo; the chase makes it faster by `tempoPerLevel` per level.
export const stepSeconds = (cfg, theme, level = 0) => 30 / (theme.bpm * (1 + (level > 0 ? cfg.chase.tempoPerLevel * level : 0)));

// The notes of one step: bass and melody MIDI notes (or null) of the theme. Fills and returns `out`.
export function stepNotes(theme, step, out) {
  const i = step % theme.bass.length;
  const b = theme.bass[i];
  const m = theme.melody[i % theme.melody.length];
  out.bass = b === null || b === undefined ? null : degreeToMidi(theme.root, theme.scale, b - 7); // the bass sits an octave below the root
  out.melody = m === null || m === undefined ? null : degreeToMidi(theme.root, theme.scale, m);
  return out;
}

// How many chase layers play at an Aerger level (0 for none): one more from each level, never more than there are.
export const layersAt = (cfg, level) => cfg.chase.layers.filter(l => level >= l.minLevel).length;

// What a chase layer plays on a step, or null: { kind, midi?, wave?, gain }. `out` is reused.
export function layerNote(theme, layer, step, out) {
  if (step % layer.every !== 0) return null;
  out.kind = layer.kind;
  out.gain = layer.gain;
  out.wave = layer.wave;
  out.midi = null;
  if (layer.kind === 'tone') {
    const degree = layer.degrees ? layer.degrees[(step / layer.every) % layer.degrees.length | 0] : layer.degree;
    out.midi = degreeToMidi(theme.root, theme.scale, degree) + (layer.octave ?? 0) * 12;
  }
  return out;
}

export function validateMusic(cfg, phases, seasons) {
  const problems = [];
  for (const ph of phases) if (!cfg.phases[ph]) problems.push(`no theme for phase ${ph}`);
  for (const s of seasons) if (!cfg.seasons[s]) problems.push(`no colour for season ${s}`);
  for (const [id, p] of Object.entries(cfg.phases)) {
    if (!(p.bpm >= 50 && p.bpm <= 160)) problems.push(`${id}: bpm out of range`);
    if (p.bass.length !== cfg.steps || p.melody.length !== cfg.steps) problems.push(`${id}: patterns must have ${cfg.steps} steps`);
    if (!p.melody.some(x => x !== null)) problems.push(`${id}: the melody is silent`);
  }
  for (const [id, s] of Object.entries(cfg.seasons)) if (!cfg.scales[s.scale] || !(s.tempoMul > 0.7 && s.tempoMul < 1.3)) problems.push(`${id}: scale or tempoMul`);
  const lv = cfg.chase.layers.map(l => l.minLevel);
  if (lv.join() !== '1,2,3,4,5') problems.push('chase layers must start at levels 1 to 5, one each');
  if (!(cfg.musicGain > 0 && cfg.musicGain < 0.4)) problems.push('musicGain must stay quiet (0 to 0.4)');
  return problems;
}
