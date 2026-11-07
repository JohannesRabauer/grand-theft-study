// Pure logic of the Erdkunde minigame (AD-20), no Phaser: the two modes, how a Sachkunde geo item is tied to the map
// (data/learning/grade3/geo-map.json) and turned into a "Wo liegt ...?" tap question or a Hauptstadt-Match, which items
// fall back to plain choice rendering, and the layout of each mode in a player's area. The map geometry is geoCore.js,
// ErdkundeGame.js and ui/GermanyMap.js bind it to the scene; scripts/check-erdkunde.mjs drives it in node.

export { makePlan, modeAt, comboSparkles, winnerOf } from './matheCore.js';

export const MODES = ['wo', 'capital'];

const textOf = (t, lang = 'de') => (typeof t === 'string' ? t : t[lang] ?? t.de);

// What the map can pick for a target of each kind.
const WHAT = { state: 'states', city: 'states', river: 'rivers', sea: 'seas' };

// A geo or karte item of the Erdkunde pool.
export const inPool = (q, tags) => (q.tags ?? []).some(t => tags.includes(t));

// How `targetId` turns choice item `q` into a map question, or null when it does not fit. mode 'wo': the right answer is
// the target's name (a state, river or sea): the player taps it. mode 'capital': the right answer is the target state's
// capital: the state is highlighted. Returns { mode, target, what } with what = 'states' | 'rivers' | 'seas'.
export function classify(geo, q, targetId) {
  const target = geo.byId[targetId];
  if (!target || q.type !== 'choice') return null;
  const right = q.answers.find(a => a.correct);
  if (!right) return null;
  const answer = textOf(right.text);
  if (answer === target.name) return { mode: 'wo', target: targetId, what: WHAT[target.kind] };
  if (target.capital && answer === target.capital.name) return { mode: 'capital', target: targetId, what: 'states' };
  return null;
}

// The map question of every mapped item: Map itemId -> classify() result. `problems` lists the table entries that
// do not resolve (unknown item, unknown target, answer that is neither name nor capital) for the check script.
export function resolveTargets(geo, targets, items) {
  const byItem = new Map();
  const problems = [];
  const byId = new Map(items.map(q => [q.id, q]));
  for (const [id, targetId] of Object.entries(targets)) {
    const q = byId.get(id);
    if (!q) { problems.push(`${id}: unknown item`); continue; }
    if (!geo.byId[targetId]) { problems.push(`${id}: unknown target ${targetId}`); continue; }
    const info = classify(geo, q, targetId);
    if (info) byItem.set(id, info); else problems.push(`${id}: the right answer is neither the name nor the capital of ${targetId}`);
  }
  return { byItem, problems };
}

// An unmapped item the panel can show as plain choice buttons.
export const plainable = q => q.type === 'choice' && q.answers.length >= 2 && q.answers.length <= 4;

// ---- layout of the modes inside a player's area ----

const QUESTION_H = 34;

// Where the parts go inside a player's area (rect from layoutRects: 468 wide for one player, about 234 for two).
//   wo       question line on top; map left and the feedback note on its right (one player), or the map above a
//            note strip (two players)
//   capital  the chalkboard panel left, the map on the right with the highlighted state
export function layoutFor(rect, mode) {
  const wide = rect.w > 300;
  if (mode === 'wo') {
    const question = { x: rect.x + 6, y: rect.y + 4, w: rect.w - 12 };
    if (wide) {
      return { question, map: { x: rect.x + 2, y: rect.y + QUESTION_H, w: 200, h: rect.h - QUESTION_H - 2 }, note: { x: rect.x + 212, y: rect.y + QUESTION_H + 6, w: rect.w - 220 } };
    }
    const noteH = 50;
    const map = { x: rect.x + 2, y: rect.y + QUESTION_H, w: rect.w - 4, h: rect.h - QUESTION_H - noteH - 2 };
    return { question, map, note: { x: rect.x + 6, y: map.y + map.h + 4, w: rect.w - 12 } };
  }
  const mapW = wide ? 150 : 76;
  return {
    panel: { x: rect.x, y: rect.y, w: rect.w - mapW - 6, h: rect.h },
    map: { x: rect.x + rect.w - mapW - 2, y: rect.y + 2, w: mapW, h: wide ? rect.h - 4 : 110 }
  };
}
