// Talking down a bully (story 7.5), Phaser-free. See data/chase.json `talk`. At Aerger levels 1 and 2 a bully who touches a kid does not catch
// them at once: first the kid's Charme may talk him down, else a question from the learning engine can make him back off. A wrong answer is
// gentle: no catch this time either, the bully only keeps coming after a short grace. From level 3 on a touch is a catch as before.
export const charmChance = (talk, charme) => Math.max(0, Math.min(talk.charm.max, talk.charm.base + talk.charm.perPoint * (charme ?? talk.charm.pivot)));

export const talksAt = (talk, level) => level >= 1 && level <= talk.maxLevel;

export function validateTalk(talk, charmeRange) {
  const problems = [];
  if (!(talk.maxLevel >= 1 && talk.maxLevel <= 2)) problems.push('talk.maxLevel is 1 or 2: the gentle rule is for the low levels');
  const c = talk.charm;
  if (!(c.base >= 0 && c.perPoint > 0 && c.max < 1 && c.max > 0.5)) problems.push('charm numbers: base >= 0, perPoint > 0, 0.5 < max < 1 (a check never always works)');
  if (!(charmChance(talk, charmeRange[0]) > 0)) problems.push('even the lowest Charme has a chance');
  if (!(charmChance(talk, charmeRange[1]) < 1)) problems.push('and the highest never a sure thing');
  if (!(talk.graceSeconds > 0)) problems.push('graceSeconds must be positive');
  return problems;
}
