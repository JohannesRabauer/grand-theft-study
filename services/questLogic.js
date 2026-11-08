// Quest rules (story 9.1), Phaser-free so the state actions, the runner and node checks share them. See data/missions.json.
import { matches } from './Hints.js';

export const missionById = (cfg, id) => cfg.missions.find(m => m.id === id) ?? null;

export const isActive = (quests, id) => quests.active.some(q => q.id === id);
export const isDone = (quests, id) => quests.done.includes(id);

// A mission can be started now: unknown, running or finished (unless it repeats, and then only once per day) ones cannot.
export function canStart(cfg, quests, id, phase, day, flags = {}) {
  const m = missionById(cfg, id);
  if (!m || isActive(quests, id)) return false;
  if (phase && m.phases && !m.phases.includes(phase)) return false; // a null phase skips the check (the state action does not know the time of day rules)
  if (isDone(quests, id)) return !!m.repeat && flags[`mission.${id}.day`] !== day;
  return true;
}

// The next mission a phone call can offer: the first startable one that wants booths.
export const nextCall = (cfg, quests, phase, day, flags) => cfg.missions.find(m => m.booth && canStart(cfg, quests, m.id, phase, day, flags)) ?? null;

export const currentStep = (cfg, entry) => missionById(cfg, entry.id)?.steps[entry.step] ?? null;

// Does `event` (name and payload) complete this step?
export const stepFinishedBy = (step, name, payload) => !!step?.event && step.event === name && matches(step.match, payload);

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
    for (const k of ['title', 'intro', 'done']) if (!i18n[`mission.${m.id}.${k}`]) problems.push(`${m.id}: missing text mission.${m.id}.${k}`);
    for (const s of m.steps ?? []) {
      if (!s.reach && !s.event) problems.push(`${m.id}.${s.id}: a step ends by reaching a place or an event`);
      if (!i18n[s.text]) problems.push(`${m.id}.${s.id}: missing text ${s.text}`);
      const spots = [s.objective, s.reach].filter(Boolean);
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
