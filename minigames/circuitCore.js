// Pure circuit solver of the Science minigame (AD-20), no Phaser. A circuit is the `circuit.cells` list of a Science item
// (data/learning/grade3/science.json): ONE series loop in list order, each cell { id, kind: battery|bulb|wire|gap|switch|bridge,
// state?: open|closed, item?, conducts? }. The loop becomes a graph (a node between neighbouring cells, a cell is the edge
// joining them); current flows when the conducting edges contain a cycle and the loop has a battery and a bulb.
// scripts/check-science.mjs drives it in node, ScienceGame.js and ui/CircuitBoard.js draw and play it.

// Does current pass through this cell?
export function conducts(cell) {
  switch (cell.kind) {
    case 'gap': return false;
    case 'switch': return cell.state === 'closed';
    case 'bridge': return !!cell.conducts;
    default: return true; // battery, bulb, wire
  }
}

export function buildGraph(cells) {
  const n = cells.length;
  return { nodes: n, edges: cells.map((c, i) => ({ id: c.id, a: i, b: (i + 1) % n, on: conducts(c) })) };
}

// A closed current loop: a cycle among the conducting edges (union-find; an edge that joins two already joined nodes closes it).
export function hasCycle(graph) {
  const root = Array.from({ length: graph.nodes }, (_, i) => i);
  const find = i => (root[i] === i ? i : (root[i] = find(root[i])));
  for (const e of graph.edges) {
    if (!e.on) continue;
    const a = find(e.a);
    const b = find(e.b);
    if (a === b) return true;
    root[a] = b;
  }
  return false;
}

const WHY = { gap: 'gap', switch: 'switch', bridge: 'insulator' };

// { lit, missing: ['battery', 'bulb'] parts the loop lacks, blockers: [{ id, kind, why }] cells that stop the current }.
export function analyze(cells) {
  const missing = ['battery', 'bulb'].filter(k => !cells.some(c => c.kind === k));
  const blockers = cells.filter(c => !conducts(c)).map(c => ({ id: c.id, kind: c.kind, why: WHY[c.kind] }));
  return { lit: missing.length === 0 && cells.length >= 2 && hasCycle(buildGraph(cells)), missing, blockers };
}

// The repaired cell, or null when the cell needs no repair (a switch is closed, a gap or an insulator becomes a wire).
export function repaired(cell) {
  if (cell.kind === 'switch' && cell.state !== 'closed') return { ...cell, state: 'closed' };
  if (cell.kind === 'gap' || (cell.kind === 'bridge' && !cell.conducts)) return { id: cell.id, kind: 'wire' };
  return null;
}

// The cells after repairing cell `id`, or null when that cell needs no repair.
export function applyFix(cells, id) {
  const i = cells.findIndex(c => c.id === id);
  const fixed = i < 0 ? null : repaired(cells[i]);
  return fixed ? cells.map((c, j) => (j === i ? fixed : c)) : null;
}

// Ids to repair so the bulb lights, or null when repairs cannot help (no battery or no bulb).
export function solveFix(cells) {
  const ids = cells.filter(c => repaired(c)).map(c => c.id);
  const after = ids.reduce((acc, id) => applyFix(acc, id), cells);
  return analyze(after).lit && ids.length ? ids : null;
}

// What to repair in a Science item to play it as a puzzle: its declared `fix`, or for a dark `lit` item the repairs the solver
// finds; null for items that are no puzzle (a lit circuit, a missing part, no circuit data).
export function puzzleFix(q) {
  const c = q.circuit;
  if (!c) return null;
  if (c.ask === 'fix') return c.fix?.length ? c.fix : null;
  return c.lit === false ? solveFix(c.cells) : null;
}

// One pick in a puzzle. -> { kind: 'fix', cells, done } when the cell was a needed repair (done = the bulb now lights),
// { kind: 'wrong', why } otherwise, with why = the part that works already ('battery', 'bulb', 'wire', 'switch-closed',
// 'bridge-ok') or 'extra' for a repairable cell the puzzle does not need.
export function pickCell(cells, fix, id) {
  const cell = cells.find(c => c.id === id);
  if (!cell) return { kind: 'wrong', why: 'wire' };
  const next = fix.includes(id) ? applyFix(cells, id) : null;
  if (next) return { kind: 'fix', cells: next, done: analyze(next).lit };
  if (repaired(cell)) return { kind: 'wrong', why: 'extra' };
  return { kind: 'wrong', why: cell.kind === 'switch' ? 'switch-closed' : cell.kind === 'bridge' ? 'bridge-ok' : cell.kind };
}

// Cells with every repair of `fix` applied (the solution shown after a wrong pick).
export const solved = (cells, fix) => fix.reduce((acc, id) => applyFix(acc, id) ?? acc, cells);

// ---- geometry of the drawn loop ----

export const CELL_HALF = 18; // half the length of a cell's symbol along the wire
const MARGIN = CELL_HALF + 4; // keeps symbols off the corners

// The loop as a clockwise rectangle from the top-left corner: corners, edge lengths and total length.
export function loopPath(x, y, w, h) {
  return { pts: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }], lens: [w, h, w, h], total: 2 * (w + h) };
}

// The point at distance s along the loop, written into `out` ({ x, y, edge }); edge 0 top, 1 right, 2 bottom, 3 left.
export function pointAt(path, s, out = { x: 0, y: 0, edge: 0 }) {
  let rest = ((s % path.total) + path.total) % path.total;
  let edge = 0;
  while (edge < 3 && rest > path.lens[edge]) rest -= path.lens[edge++];
  const a = path.pts[edge];
  const b = path.pts[(edge + 1) % 4];
  const k = rest / path.lens[edge];
  out.x = a.x + (b.x - a.x) * k;
  out.y = a.y + (b.y - a.y) * k;
  out.edge = edge;
  return out;
}

// Where the n cells sit along the loop (distances s, evenly spread, pushed off the corners) and their orientation
// ('h' on the top and bottom edge, 'v' on the sides).
export function placeCells(path, n) {
  const starts = [0, path.lens[0], path.lens[0] + path.lens[1], 2 * path.lens[0] + path.lens[1], path.total];
  return Array.from({ length: n }, (_, i) => {
    let s = ((i + 0.5) / n) * path.total;
    const edge = starts.findIndex((st, e) => e < 4 && s <= starts[e + 1]);
    s = Math.min(starts[edge + 1] - MARGIN, Math.max(starts[edge] + MARGIN, s));
    return { s, edge, dir: edge % 2 === 0 ? 'h' : 'v' };
  });
}

// The corners and end points of the stretch of the loop from distance s0 to s1 (wrapping), for drawing a wire piece.
export function stretch(path, s0, s1) {
  const end = s1 > s0 ? s1 : s1 + path.total;
  const out = [pointAt(path, s0, {})];
  let edgeEnd = 0;
  for (let k = 0; k < 8; k++) {
    edgeEnd += path.lens[k % 4];
    if (edgeEnd > s0 && edgeEnd < end) out.push({ ...path.pts[(k + 1) % 4] });
  }
  out.push(pointAt(path, end, {}));
  return out;
}
