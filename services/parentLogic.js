// Parent settings rules (story 11.4), Phaser-free. See data/parent.json.

// A gate question: "a x b + c" with four different answers (the right one among them) in a random order.
export function makeQuestion(cfg, rng = Math.random) {
  const pick = ([lo, hi]) => lo + Math.floor(rng() * (hi - lo + 1));
  const a = pick(cfg.a);
  const b = pick(cfg.b);
  const c = pick(cfg.c);
  const answer = a * b + c;
  const wrong = new Set();
  const near = [10, -10, 1, -1, 2, -2, 5, -5, 20, -20, 9, -9, 11, -11];
  while (wrong.size < 3) {
    const candidate = answer + near[Math.floor(rng() * near.length)] + (rng() < 0.3 ? 100 * (rng() < 0.5 ? 1 : -1) : 0);
    if (candidate > 0 && candidate !== answer) wrong.add(candidate);
  }
  const options = [answer, ...wrong];
  for (let i = options.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [options[i], options[j]] = [options[j], options[i]]; }
  return { a, b, c, answer, options, correct: options.indexOf(answer) };
}

// The gate: a wrong answer shuts it for a while and a fresh question follows, several wrong answers in a row for longer.
export class Gate {
  constructor(cfg, rng = Math.random) {
    this.cfg = cfg;
    this.rng = rng;
    this.wrong = 0;
    this.openUntil = 0; // not locked before this time (seconds)
    this.question = makeQuestion(cfg, rng);
  }

  locked(now) { return now < this.openUntil; }

  secondsLeft(now) { return Math.max(0, Math.ceil(this.openUntil - now)); }

  // Returns 'open' (the right answer), 'wrong' (a lockout starts) or 'locked' (the gate is shut, nothing is checked).
  answer(index, now) {
    if (this.locked(now)) return 'locked';
    if (index === this.question.correct) { this.wrong = 0; return 'open'; }
    this.wrong++;
    const long = this.wrong % this.cfg.strikes === 0;
    this.openUntil = now + (long ? this.cfg.longLockoutSeconds : this.cfg.lockoutSeconds);
    this.question = makeQuestion(this.cfg, this.rng);
    return 'wrong';
  }
}

// The play-time reminder: how many full intervals of `minutes` have passed that were not yet announced; 0 when the reminder is off.
export function dueReminders(playedSeconds, minutes, announced) {
  if (!minutes) return 0;
  return Math.max(0, Math.floor(playedSeconds / (minutes * 60)) - announced);
}

export const difficultyValue = (cfg, id) => cfg.difficulties.find(d => d.id === id)?.value ?? 1;
export const difficultyId = (cfg, value) => cfg.difficulties.find(d => Math.abs(d.value - value) < 1e-9)?.id ?? 'normal';

export function validateParent(cfg, learningRange) {
  const problems = [];
  if (!(cfg.gate.a[0] >= 12 && cfg.gate.b[0] >= 3 && cfg.gate.c[0] >= 11)) problems.push('the gate question must be beyond a class 3 mental sum');
  if (cfg.gate.lockoutSeconds < 10 || cfg.gate.longLockoutSeconds <= cfg.gate.lockoutSeconds || cfg.gate.strikes < 2) problems.push('lockouts must be long enough to stop guessing');
  if (!cfg.difficulties.some(d => d.value === 1)) problems.push('a normal difficulty (1) is needed');
  for (const d of cfg.difficulties) if (d.value < learningRange[0] || d.value > learningRange[1]) problems.push(`difficulty ${d.id} is outside the learning range`);
  if (cfg.reminders[0] !== 0 || cfg.reminders.some((m, i) => i && m <= cfg.reminders[i - 1])) problems.push('reminders start with off and grow');
  return problems;
}
