// Difficulty by age (story 11.7), Phaser-free. See data/learning.json `ageMap`. A kid's challenge factor comes from an age: the age of the
// character they play as a default, or an age the family picked for that kid (flag difficultyAge.<player>), independent of the character.
// The factor multiplies the parent difficulty in the learning engine (pd), which scales the target level and the time allowed; the kid's
// learning stats, the character's looks, attributes and perks are never touched by it.
export const ageFlag = player => `difficultyAge.${player}`;

// The challenge factor of an age: the first step whose `upTo` holds it (the last step catches everything older).
export function ageFactor(ageMap, age) {
  if (!(age > 0)) return 1;
  const step = ageMap.steps.find(s => age <= s.upTo) ?? ageMap.steps.at(-1);
  return step.factor;
}

// The age that counts for a kid: the family's pick (a number from `choices`), else the character's age; null when neither is known.
export function difficultyAge(ageMap, flags, player, characterAge) {
  const pick = flags[ageFlag(player)];
  if (ageMap.choices.includes(pick)) return pick;
  return characterAge ?? null;
}

export const playerFactor = (ageMap, flags, player, characterAge) => ageFactor(ageMap, difficultyAge(ageMap, flags, player, characterAge));

export function validateAgeMap(ageMap, learningRange) {
  const problems = [];
  const s = ageMap.steps;
  if (!s?.length) return ['ageMap has no steps'];
  for (let i = 1; i < s.length; i++) if (!(s[i].upTo > s[i - 1].upTo)) problems.push('steps must be ordered by upTo');
  for (const st of s) {
    if (!(st.factor >= 0.8 && st.factor <= 1.2)) problems.push(`factor ${st.factor} is out of the gentle range 0.8 to 1.2`);
    if (st.factor * learningRange[1] < 1 || st.factor * learningRange[0] > 1.5) problems.push('with the parent range the factor must stay usable');
  }
  for (let i = 1; i < s.length; i++) if (s[i].factor < s[i - 1].factor) problems.push('older never means easier');
  if (!ageMap.choices.length || ageMap.choices.some(c => !(c >= 6 && c <= 14))) problems.push('choices are ages between 6 and 14');
  return problems;
}
