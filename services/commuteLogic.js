// Commute rules (story 8.2), Phaser-free so node checks drive them. See data/commute.json.
import { parseTime } from './dayTime.js';

// Minutes late (0 when on time) and early for an arrival at `minute`.
export function arrival(deadline, minute) {
  const bell = parseTime(deadline);
  return { late: Math.max(0, minute - bell), early: Math.max(0, bell - minute) };
}

export const stopKey = id => `tram.stop.${id}`;

// A stop is known from the start (home and school) or once the map quiz there was answered right.
export const knownStop = (tram, flags, id) => (tram.knownAtStart ?? []).includes(id) || !!flags[stopKey(id)];

// Where fast travel can go from a known stop: every other known stop that has a place on the map; the line partner comes first.
export function fastTargets(tram, flags, stopIds, from) {
  const partner = otherStop(tram, from);
  const list = stopIds.filter(id => id !== from && knownStop(tram, flags, id));
  return list.sort((a, b) => (b === partner) - (a === partner));
}

export function otherStop(tram, id) {
  for (const [a, b] of tram.lines) {
    if (a === id) return b;
    if (b === id) return a;
  }
  return null;
}

// What each rider pays. `riders` is how many board; money is what the shared wallet holds. Riders buy a ticket while the
// wallet can pay for it, the rest ride without one.
export function fares(tram, money, riders) {
  const out = [];
  let left = money;
  for (let i = 0; i < riders; i++) {
    const ticket = left >= tram.priceCents;
    if (ticket) left -= tram.priceCents;
    out.push(ticket);
  }
  return out;
}

// Inspector on board: only when somebody rides without a ticket, and then by chance.
export const inspected = (tram, tickets, roll) => tickets.some(t => !t) && roll < tram.inspectorChance;

// The ride moves the clock on, but never past the end of the current phase (only DayClock.advance crosses that).
export const rideTarget = (minute, phaseEnd, rideMinutes) => Math.min(minute + rideMinutes, phaseEnd - 1);

// Problems in data/commute.json against the maps: waypoints on walkable ground inside the map, tram lines that join two
// existing stops, a deadline at the end of the commute phase and pickups that can be reached.
export function validateCommute(cfg, map, dayPhases, solid) {
  const problems = [];
  const at = (x, y) => map.legend[map.rows[Math.floor(y)]?.[Math.floor(x)]];
  const walk = (x, y) => { const id = at(x, y); return !!id && !solid(id); };
  const commute = dayPhases.find(p => p.id === 'commute');
  if (!commute || parseTime(cfg.deadline) !== parseTime(commute.end)) problems.push('the deadline must be the end of the commute phase');
  for (const t of cfg.warnings) if (parseTime(t) < parseTime(commute.start) || parseTime(t) >= parseTime(cfg.deadline)) problems.push(`warning ${t} is outside the commute`);
  if (cfg.routes.length < 3 || new Set(cfg.routes.map(r => r.id)).size !== cfg.routes.length) problems.push('three distinct routes are required');
  for (const r of cfg.routes) {
    if (!r.risks?.length) problems.push(`route ${r.id}: name its risks`);
    for (const [x, y] of r.waypoints) if (!walk(x, y)) problems.push(`route ${r.id}: waypoint ${x},${y} is not walkable`);
  }
  const stops = new Map(map.objects.filter(o => o.type === 'tram-stop').map(o => [o.id, o]));
  for (const [a, b] of cfg.tram.lines) if (!stops.has(a) || !stops.has(b)) problems.push(`tram line ${a} - ${b} needs two existing tram stops`);
  for (const s of stops.values()) if (!walk(s.x, s.y)) problems.push(`tram stop ${s.id} is not on walkable ground`);
  for (const p of cfg.pickups) if (!walk(p.x, p.y)) problems.push(`pickup ${p.id} is not on walkable ground`);
  return problems;
}
