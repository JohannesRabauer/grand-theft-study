// The Lernbuch numbers (story 10.5), pure: what one topic's saved learning stats say about a kid. See data/lernbuch.json.
// stats: { n, correct, wrong, acc, recent, level, bestStreak, items } as saved by the learning engine (learning/engineCore.js).
export function progressOf(stats, poolSize, cfg) {
  const correct = stats?.correct ?? 0;
  const wrong = stats?.wrong ?? 0;
  const answered = correct + wrong;
  const accuracy = answered ? correct / answered : 0;
  const items = Object.values(stats?.items ?? {});
  const learned = items.filter(i => i.b === 0 && i.c > 0).length;
  const recent = stats?.recent?.length ? stats.recent.reduce((a, b) => a + b, 0) / stats.recent.length : null;
  const medal = cfg.medals.find(m => answered >= m.answered && accuracy >= m.accuracy)?.id ?? null;
  return {
    answered, correct, wrong, accuracy, recent, learned,
    seen: items.filter(i => i.s > 0).length,
    pool: poolSize,
    level: stats?.level ?? 1,
    medal,
    badges: {
      streak: (stats?.bestStreak ?? 0) >= cfg.badges.streakMin,
      learner: learned >= cfg.badges.learnedMin
    }
  };
}

export const barColor = (accuracy, cfg) => cfg.barColors.find(c => accuracy >= c.min)?.color ?? cfg.barColors.at(-1).color;

// Everything the book shows for one kid: a row per topic and the totals.
export function bookOf(topics, statsOf, poolOf, cfg) {
  const rows = topics.map(topic => ({ topic, ...progressOf(statsOf(topic), poolOf(topic), cfg) }));
  const answered = rows.reduce((a, r) => a + r.answered, 0);
  const correct = rows.reduce((a, r) => a + r.correct, 0);
  return { rows, answered, accuracy: answered ? correct / answered : 0, medals: rows.filter(r => r.medal).length };
}
