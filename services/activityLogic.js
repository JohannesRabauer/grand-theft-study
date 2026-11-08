// Question activities (story 9.2), Phaser-free. See data/activities.json.
export const dayKey = (id, day, player) => `activity.${id}.${day}.${player}`;

export const timesToday = (flags, id, day, player) => flags[dayKey(id, day, player)] ?? 0;

// Per-sign activities (`perSign`) are played once per spot and kid, ever; the others `perDay` times a game day.
export const spotKey = (id, spot, player) => `${id}.${spot}.${player}`;

export const canPlay = (cfg, flags, id, day, player, spot) => cfg[id].perSign ? !flags[spotKey(id, spot, player)] : timesToday(flags, id, day, player) < cfg[id].perDay;

// The stages of an activity; the bakery has one list per language the kid orders in.
export function stagesOf(cfg, id, variant = 'de') {
  const a = cfg[id];
  return (a.variants ? a.variants[variant] : a.stages).map(s => ({ ...s }));
}

export const questionsIn = stages => stages.reduce((n, s) => n + s.n, 0);

// What a finished run pays: cents (to the family wallet, rounded to 5) and xp (to the kid).
export function reward(cfg, id, variant, correct, total) {
  const a = cfg[id];
  const mult = variant === 'en' && a.englishMultiplier ? a.englishMultiplier : 1;
  const raw = (correct * a.perCorrectCents + (correct === total && total > 0 ? a.allCorrectCents : 0)) * mult;
  return { cents: Math.round(raw / 5) * 5, xp: correct * a.xpPerCorrect };
}

// A choice item that fits a stage: the type the screen can show and the sub-tag of the stage.
export const fits = stage => item => item.type === 'choice' && (!stage.tag || item.tags?.includes(stage.tag));

// Problems in the data against the real question pools: every stage has enough choice questions of its tag, rewards are sane.
export function validateActivities(cfg, pools) {
  const problems = [];
  for (const id of ['pfand', 'bakery', 'scan', 'route', 'tramquiz']) {
    const a = cfg[id];
    if (!a) { problems.push(`missing activity ${id}`); continue; }
    if (!(a.perDay >= 1) || !(a.perCorrectCents >= 0) || !(a.xpPerCorrect > 0)) problems.push(`${id}: perDay, perCorrectCents and xpPerCorrect must be positive`);
    for (const variant of a.variants ? Object.keys(a.variants) : [null]) {
      for (const s of stagesOf(cfg, id, variant ?? 'de')) {
        const items = pools[s.topic]?.items.filter(fits(s)) ?? [];
        if (items.length < s.n * 2) problems.push(`${id}${variant ? `/${variant}` : ''}: only ${items.length} ${s.topic} questions tagged ${s.tag}, ${s.n * 2} wanted`);
      }
    }
  }
  return problems;
}
