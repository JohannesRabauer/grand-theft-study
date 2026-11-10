// Pure time math for the day clock (AD-17): no Phaser, no state. Times in data are "HH:MM" strings,
// everywhere else they are game minutes since midnight.
export const parseTime = (s) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m || +m[1] > 23 || +m[2] > 59) throw new Error(`day: bad time "${s}"`);
  return +m[1] * 60 + +m[2];
};

export const formatTime = (minute) => {
  const m = ((Math.floor(minute) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

// Turns data/day.json into minutes and validates it: phases are contiguous from `start` to `end`.
export function compileDay(raw) {
  const phases = raw.phases.map(p => ({
    id: p.id,
    start: parseTime(p.start),
    end: parseTime(p.end),
    season: p.season,
    weather: (p.weather ?? []).map(w => ({ state: w.state, chance: w.chance, from: parseTime(w.from), to: parseTime(w.to) }))
  }));
  const start = parseTime(raw.start);
  const end = parseTime(raw.end);
  if (!phases.length || phases[0].start !== start || phases.at(-1).end !== end) throw new Error('day: phases must span start..end');
  phases.forEach((p, i) => {
    if (p.end <= p.start) throw new Error(`day: phase ${p.id} is empty`);
    if (i && p.start !== phases[i - 1].end) throw new Error(`day: phase ${p.id} does not follow ${phases[i - 1].id}`);
  });
  const tint = raw.tint.map(k => ({ minute: parseTime(k.time), rgb: parseInt(k.color.slice(1), 16), alpha: k.alpha }));
  const sun = raw.sun.map(k => ({ minute: parseTime(k.time), length: k.length, angle: k.angle }));
  const fp = raw.freeplay;
  return {
    secondsPerMinute: raw.secondsPerGameMinute,
    runWhileFrozen: !!raw.runWhileFrozen,
    start,
    end,
    phases,
    tint,
    sun,
    freeplay: { phase: fp.phase, minute: parseTime(fp.time), running: !!fp.running }
  };
}

export const phaseIndexAt = (cfg, minute) => {
  const i = cfg.phases.findIndex(p => minute >= p.start && minute < p.end);
  return i < 0 ? 0 : i;
};

// A clock that is valid for this config (loaded saves, old shapes): minute inside the day, phase derived from it.
export function sanitizeClock(cfg, clock) {
  const day = Number.isInteger(clock?.day) && clock.day >= 1 ? clock.day : 1;
  const inDay = Number.isFinite(clock?.minute) && clock.minute >= cfg.start && clock.minute < cfg.end;
  const minute = inDay ? Math.floor(clock.minute) : cfg.start;
  return { day, minute, phase: cfg.phases[phaseIndexAt(cfg, minute)].id };
}

const hash01 = (a, b, c) => {
  let h = Math.imul(a + 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35) ^ Math.imul(c + 0x165667b1, 0x27d4eb2f);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
};

// Weather hints are chances per window, rolled once per day and window, so a day replays the same.
export function scheduledWeather(cfg, day, minute) {
  const pi = phaseIndexAt(cfg, minute);
  const hints = cfg.phases[pi].weather;
  for (let i = 0; i < hints.length; i++) {
    const w = hints[i];
    if (minute >= w.from && minute < w.to && hash01(day, pi, i) < w.chance) return w.state;
  }
  return 'clear';
}

// The sun for cast shadows (story 16.4): `length` (share of the tallest shadow, long at dawn and dusk, short at noon) and
// `angle` in degrees below the +x axis, always in the bottom-right quadrant (the sun stands top left), blended between keyframes.
export function sunAt(cfg, minute) {
  const k = cfg.sun;
  if (minute <= k[0].minute) return { length: k[0].length, angle: k[0].angle };
  for (let i = 1; i < k.length; i++) {
    if (minute > k[i].minute) continue;
    const a = k[i - 1];
    const b = k[i];
    const t = (minute - a.minute) / (b.minute - a.minute);
    return { length: a.length + (b.length - a.length) * t, angle: a.angle + (b.angle - a.angle) * t };
  }
  const last = k.at(-1);
  return { length: last.length, angle: last.angle };
}

// Ambient light: { rgb, alpha } blended between the tint keyframes (dawn warm, day neutral, evening orange, bedtime dark).
export function tintAt(cfg, minute) {
  const k = cfg.tint;
  if (minute <= k[0].minute) return { rgb: k[0].rgb, alpha: k[0].alpha };
  for (let i = 1; i < k.length; i++) {
    if (minute > k[i].minute) continue;
    const a = k[i - 1];
    const b = k[i];
    const t = (minute - a.minute) / (b.minute - a.minute);
    let rgb = 0;
    for (const shift of [16, 8, 0]) {
      const ca = (a.rgb >> shift) & 255;
      const cb = (b.rgb >> shift) & 255;
      rgb |= Math.round(ca + (cb - ca) * t) << shift;
    }
    return { rgb, alpha: a.alpha + (b.alpha - a.alpha) * t };
  }
  const last = k.at(-1);
  return { rgb: last.rgb, alpha: last.alpha };
}
