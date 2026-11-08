// Quest rules (story 9.1), Phaser-free so the state actions, the runner and node checks share them. See data/missions.json.
import { matches } from './Hints.js';

export const missionById = (cfg, id) => cfg.missions.find(m => m.id === id) ?? null;

export const isActive = (quests, id) => quests.active.some(q => q.id === id);
export const isDone = (quests, id) => quests.done.includes(id);

// A mission can be started now: unknown, running or finished (unless it repeats, and then only once per day) ones cannot.
export function canStart(cfg, quests, id, phase, day, flags = {}) {
  const m = missionById(cfg, id);
  if (!m || isActive(quests, id)) return false;
  if (m.requires?.some(r => !isDone(quests, r))) return false; // a chain: earlier missions first
  if (phase && m.phases && !m.phases.includes(phase)) return false; // a null phase skips the check (the state action does not know the time of day rules)
  if (isDone(quests, id)) return !!m.repeat && flags[`mission.${id}.day`] !== day;
  return true;
}

// The next mission a phone call can offer: the first startable one that wants booths.
export const nextCall = (cfg, quests, phase, day, flags) => cfg.missions.find(m => m.booth && canStart(cfg, quests, m.id, phase, day, flags)) ?? null;

export const currentStep = (cfg, entry) => missionById(cfg, entry.id)?.steps[entry.step] ?? null;

// Does `event` (name and payload) complete this step?
export const stepFinishedBy = (step, name, payload) => !!step?.event && step.event === name && matches(step.match, payload);

// A `count` step ({ event, where, n }): does this event count? `where` checks the payload's prop kind, the shot's source and that the
// prop stands within `near` ({ x, y, radius } in tiles) - for the shooting range - and any other payload fields by equality.
export function countsFor(count, name, payload, ts = 16) {
  if (!count || count.event !== name) return false;
  const w = count.where ?? {};
  if (w.kind && payload?.prop?.kind !== w.kind && payload?.kind !== w.kind) return false;
  if (w.source && payload?.source !== w.source) return false;
  if (w.near) {
    const pos = payload?.prop?.body?.position;
    if (!pos || Math.hypot(pos.x - (w.near.x + 0.5) * ts, pos.y - (w.near.y + 0.5) * ts) > w.near.radius * ts) return false;
  }
  return matches(w.match, payload);
}

// Next checkpoint of a race given where the kid is: the index reached (the same one while still on the way).
export function raceProgress(race, idx, px, py, vehicle, ts = 16) {
  const p = race.points[idx];
  if (!p || (race.vehicles && !race.vehicles.includes(vehicle))) return idx;
  return Math.hypot(px - (p[0] + 0.5) * ts, py - (p[1] + 0.5) * ts) <= race.radius ? idx + 1 : idx;
}

export const reached = (step, map, px, py, ts, radius = step.reach?.radius) => !!step?.reach && step.reach.map === map
  && Math.hypot(px - (step.reach.x + 0.5) * ts, py - (step.reach.y + 0.5) * ts) <= radius;

export function validateMissions(cfg, maps, i18n) {
  const problems = [];
  const ids = cfg.missions.map(m => m.id);
  if (new Set(ids).size !== ids.length) problems.push('mission ids must be unique');
  for (const m of cfg.missions) {
    if (!m.steps?.length) problems.push(`${m.id}: needs steps`);
    if (!m.booth && !m.trigger) problems.push(`${m.id}: needs a phone booth or a trigger to start`);
    if (!Number.isInteger(m.reward?.cents) || m.reward.cents < 0 || !Number.isInteger(m.reward?.xp) || m.reward.xp < 0) problems.push(`${m.id}: reward is whole cents and xp`);
    if (m.failOn && !(m.lives > 0)) problems.push(`${m.id}: failOn needs lives`);
    for (const k of ['title', 'intro', 'done', ...(m.failOn ? ['hit', 'fail'] : [])]) if (!i18n[`mission.${m.id}.${k}`]) problems.push(`${m.id}: missing text mission.${m.id}.${k}`);
    for (const s of m.steps ?? []) {
      if (!s.reach && !s.event && !s.count && !s.race) problems.push(`${m.id}.${s.id}: a step ends by reaching a place, an event, a count or a race`);
      if (s.count && !(Number.isInteger(s.count.n) && s.count.n > 1)) problems.push(`${m.id}.${s.id}: a count needs a whole number above one`);
      if (s.race) {
        if (!(s.race.points?.length >= 3) || !(s.race.seconds > 5) || !(s.race.radius > 8)) problems.push(`${m.id}.${s.id}: a race needs 3 or more checkpoints, seconds and a radius`);
        if (!i18n[`mission.${m.id}.fail`]) problems.push(`${m.id}: a race needs mission.${m.id}.fail`);
        for (const [x, y] of s.race.points ?? []) { const mp = maps[s.objective?.map ?? 'town']; const gid = mp?.legend[mp.rows[y]?.[x]]; if (!gid || ['wall', 'water', 'tree', 'fence', 'hedge', 'dumpster', 'booth'].includes(gid)) problems.push(`${m.id}.${s.id}: checkpoint ${x},${y} is not walkable ground`); }
      }
      if (!i18n[s.text]) problems.push(`${m.id}.${s.id}: missing text ${s.text}`);
      const spots = [s.objective?.dynamic || s.objective?.x === undefined ? null : s.objective, s.reach].filter(Boolean);
      for (const spot of spots) {
        const map = maps[spot.map];
        if (!map) { problems.push(`${m.id}.${s.id}: unknown map ${spot.map}`); continue; }
        const id = map.legend[map.rows[spot.y]?.[spot.x]];
        if (!id || ['wall', 'water', 'tree', 'fence', 'hedge', 'dumpster', 'booth'].includes(id)) problems.push(`${m.id}.${s.id}: ${spot.x},${spot.y} is not walkable ground`);
      }
    }
  }
  return problems;
}
