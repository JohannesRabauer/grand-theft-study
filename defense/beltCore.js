// Belt progression without Phaser (story 6.4, AD-24): the belt table of data/karate.json, the daily training limit, the points
// of a session and the belt exam. The state side is state.players[i].karate = { belt, points, sessions, lastExamDay, trainDay,
// trainedToday } (state/actions.js karate.addPoints / karate.promote); defense/Karate.js (ctx.karate) binds this to the game.
import { beltStats } from './defenseCore.js';

const clamp01 = v => Math.min(1, Math.max(0, v));

export const beltIds = cfg => cfg.belts.map(b => b.id);

// The belt after `id`, or null at the top.
export const nextBelt = (cfg, id) => cfg.belts[cfg.belts.findIndex(b => b.id === id) + 1] ?? null;

// A belt's Kiai with the kid's kiaiPower perk (Helena's stronger shout): the radius scales, the Ärger taken off is rounded
// and never below the belt's own. Fills `out` ({ radius, aerger }).
export function boostedKiai(stats, power, out) {
  out.radius = stats.kiaiRadius * power;
  out.aerger = Math.max(stats.aergerReduction, Math.round(stats.aergerReduction * power));
  return out;
}

export const sessionsToday = (karate, day) => (karate.trainDay === day ? karate.trainedToday : 0);

export const sessionsLeft = (cfg, karate, day) => Math.max(0, cfg.training.maxSessionsPerDay - sessionsToday(karate, day));

// Training points of one finished session: finishing counts, the rest scales with the weighted accuracy over all kata (0-1)
// and a little extra for a calm (high Fokus) session.
export function sessionPoints(training, { score, fokus }) {
  return Math.round(training.pointsBase + training.pointsMax * clamp01(score) + training.fokusPoints * clamp01(fokus));
}

// What a finished session does to a kid: { points, promote (belt id or null), reason }. The exam is the last kata: it only
// promotes when the total points reach the next belt's trainingPoints, its accuracy reaches the belt's examThreshold and the
// kid has not been promoted today yet. reason: 'promoted', 'top', 'exam-done', 'need-points' or 'exam-failed'.
export function evaluateSession(cfg, karate, day, { score, exam, fokus }) {
  const points = sessionPoints(cfg.training, { score, fokus });
  const next = nextBelt(cfg, karate.belt);
  let reason = 'promoted';
  if (!next) reason = 'top';
  else if (karate.lastExamDay === day) reason = 'exam-done';
  else if (karate.points + points < next.trainingPoints) reason = 'need-points';
  else if (exam < next.examThreshold) reason = 'exam-failed';
  return { points, promote: reason === 'promoted' ? next.id : null, reason };
}

// Share (0-1) of the way to the next belt's trainingPoints, for the progress line; 1 at the top belt.
export function beltProgress(cfg, karate) {
  const next = nextBelt(cfg, karate.belt);
  if (!next) return 1;
  const from = beltStats(cfg, karate.belt).trainingPoints;
  return clamp01((karate.points - from) / (next.trainingPoints - from));
}
