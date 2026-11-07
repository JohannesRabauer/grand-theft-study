// Pure logic of the Kunst minigame "Pixel-Muster merken" (story 4.6), no Phaser: seeded pattern generation (symmetric
// noise, stripes, checker, the hand-authored icons of data/pixel-patterns.json), the level profile (grid size, colours,
// how long the pattern is shown, longer for struggling kids and for the musicArtBonus perk), scoring with partial credit
// per cell, the adaptive level, the paint cursor model and the canvas layout. KunstGame.js and ui/PixelEasel.js bind it
// to a scene; scripts/check-kunst.mjs drives it in node.
//
// A pattern is { kind, size, cells[size*size] (palette indexes, row by row), colors[] (the indexes it uses, ascending), icon? }.
// A painted grid is the same array with -1 for "not painted yet", which never counts as right.

import { shuffle } from './matheCore.js';

export { mulberry32 } from '../learning/engineCore.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export const KINDS = ['icon', 'mirrorH', 'mirrorQ', 'stripes', 'checker'];
export const UNPAINTED = -1;

export const profileFor = (levels, level) => levels[clamp(Math.round(level), 1, levels.length) - 1];

// The memorize time of a level in ms; the musicArtBonus perk (0.3 = 30 %) adds that share.
export const memorizeMs = (profile, bonus = 0) => Math.round(profile.showMs * (1 + Math.max(0, bonus)));

// The next pattern's level: a perfect copy goes one up, a poor one (below `downBelow`) one down, within 1..max.
export function adaptLevel(level, accuracy, rule, max) {
  if (accuracy >= 1) return Math.min(max, level + 1);
  if (accuracy < rule.downBelow) return Math.max(1, level - 1);
  return level;
}

export const bandOf = (accuracy, bands) => bands.find(b => accuracy >= b.min) ?? bands[bands.length - 1];

// Right cells of a painted grid (partial credit): { right, total, accuracy 0-1, perfect, wrong[] (cell indexes) }.
export function scoreGrid(target, painted) {
  const wrong = [];
  for (let i = 0; i < target.length; i++) if (painted[i] !== target[i]) wrong.push(i);
  const right = target.length - wrong.length;
  return { right, total: target.length, accuracy: target.length ? right / target.length : 0, perfect: wrong.length === 0, wrong };
}

// ---- generation ----

const pickColors = (rng, paletteCount, n) => shuffle(Array.from({ length: paletteCount }, (_, i) => i), rng).slice(0, n);
const usedOf = cells => [...new Set(cells)].sort((a, b) => a - b);

function mirrored(rng, size, colors, quarter) {
  const cells = new Array(size * size);
  const half = Math.ceil(size / 2);
  for (let y = 0; y < (quarter ? half : size); y++) {
    for (let x = 0; x < half; x++) {
      const c = colors[Math.floor(rng() * colors.length)];
      for (const [mx, my] of [[x, y], [size - 1 - x, y], [x, size - 1 - y], [size - 1 - x, size - 1 - y]]) {
        if (!quarter && my !== y) continue;
        cells[my * size + mx] = c;
      }
    }
  }
  return cells;
}

function stripes(rng, size, colors) {
  const dir = Math.floor(rng() * 3);
  const band = size >= 6 && rng() < 0.5 ? 2 : 1;
  const cells = [];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) cells.push(colors[Math.floor((dir === 0 ? y : dir === 1 ? x : x + y) / band) % colors.length]);
  return cells;
}

function checker(rng, size, colors) {
  const block = size >= 6 && rng() < 0.5 ? 2 : 1;
  const cells = [];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) cells.push(colors[(Math.floor(x / block) + Math.floor(y / block)) % 2]);
  return cells;
}

function fromIcon(rng, icon, paletteIds, recolor) {
  const idx = icon.colors.map(id => paletteIds.indexOf(id));
  const slots = recolor > 0 && rng() < recolor ? pickColors(rng, paletteIds.length, idx.length) : idx;
  const cells = [];
  for (const row of icon.rows) for (const ch of row) cells.push(slots[Number(ch)]);
  return cells;
}

// kinds: { kind: weight }. An icon kind without a fitting icon falls back to mirrored noise. Same rng state in, same
// pattern out. Noise is redrawn a few times until it shows enough colours to be worth remembering.
export function generatePattern({ rng, profile, kinds, icons, paletteIds, recolor = 0 }) {
  const { size } = profile;
  const fitting = icons.filter(i => i.size === size && i.colors.length <= profile.colors);
  const names = Object.keys(kinds).filter(k => k !== 'icon' || fitting.length);
  const total = names.reduce((a, k) => a + kinds[k], 0);
  let roll = rng() * total;
  const kind = names.find(k => (roll -= kinds[k]) < 0) ?? names[0];
  const colors = pickColors(rng, paletteIds.length, profile.colors);
  const enough = Math.min(profile.colors, 3);
  let cells;
  let icon;
  for (let tries = 0; tries < 8; tries++) {
    if (kind === 'icon') { icon = fitting[Math.floor(rng() * fitting.length)]; cells = fromIcon(rng, icon, paletteIds, recolor); break; }
    cells = kind === 'mirrorH' ? mirrored(rng, size, colors, false) : kind === 'mirrorQ' ? mirrored(rng, size, colors, true)
      : kind === 'stripes' ? stripes(rng, size, colors) : checker(rng, size, colors);
    if (usedOf(cells).length >= (kind === 'mirrorH' || kind === 'mirrorQ' ? enough : 2)) break;
  }
  return { kind, size, cells, colors: usedOf(cells), icon: icon?.id };
}

// What the player can pick: the pattern's colours plus `decoys` others, ascending by palette index.
export function paletteFor(pattern, decoys, paletteCount, rng) {
  const spare = shuffle(Array.from({ length: paletteCount }, (_, i) => i).filter(i => !pattern.colors.includes(i)), rng);
  return [...pattern.colors, ...spare.slice(0, decoys)].sort((a, b) => a - b);
}

// Mirror symmetry of a pattern (left-right, top-bottom).
export function symmetryOf(pattern) {
  const { cells, size } = pattern;
  let h = true;
  let v = true;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (cells[y * size + x] !== cells[y * size + size - 1 - x]) h = false;
      if (cells[y * size + x] !== cells[(size - 1 - y) * size + x]) v = false;
    }
  }
  return { h, v };
}

// ---- painting ----

// The paint cursor of one player. The cursor is on the grid (focus 'grid') or on the palette row below it (focus
// 'palette': the colours, then the Fertig button). `palette` lists the palette indexes on offer; `color` is the chosen
// position in it and cells hold the palette index itself. nav = ChoiceCursor's { dx, dy, confirm, pick }; `held` = confirm is
// still down, so moving paints a stroke. nav() returns what happened: '' | 'move' | 'paint' | 'select' | 'submit'.
export class PaintModel {
  constructor(size, palette) {
    this.size = size;
    this.palette = palette;
    this.colorCount = palette.length;
    this.cells = new Array(size * size).fill(UNPAINTED);
    this.cx = 0;
    this.cy = 0;
    this.focus = 'grid';
    this.item = 0;
    this.color = 0;
  }

  get painted() { return this.cells.filter(c => c !== UNPAINTED).length; }

  selectColor(i) {
    if (i < 0 || i >= this.colorCount) return false;
    this.color = i;
    return true;
  }

  // Paints a cell with the chosen colour (or the palette position `color`); false when it already had it.
  paintAt(x, y, color = this.color) {
    const i = y * this.size + x;
    const value = this.palette[color];
    if (x < 0 || y < 0 || x >= this.size || y >= this.size || this.cells[i] === value) return false;
    this.cells[i] = value;
    return true;
  }

  nav({ dx, dy, confirm, pick }, held = false) {
    let result = '';
    if (pick >= 1 && this.selectColor(pick - 1)) result = 'select';
    if (this.focus === 'grid') {
      if (dy > 0 && this.cy === this.size - 1) { this.focus = 'palette'; this.item = this.color; return 'move'; }
      const x = clamp(this.cx + dx, 0, this.size - 1);
      const y = clamp(this.cy + dy, 0, this.size - 1);
      const moved = x !== this.cx || y !== this.cy;
      this.cx = x;
      this.cy = y;
      if (moved) result = 'move';
      if ((confirm || (held && moved)) && this.paintAt(x, y)) result = 'paint';
      return result;
    }
    this.item = clamp(this.item + dx, 0, this.colorCount);
    if (dy < 0) { this.focus = 'grid'; return 'move'; }
    if (dx) result = 'move';
    if (!confirm) return result;
    if (this.item === this.colorCount) return 'submit';
    this.color = this.item;
    this.focus = 'grid';
    return 'select';
  }
}

// ---- layout ----

// The canvas of a rect in layout space: one grid (cell size and origin) or, with `split`, two grids side by side (the
// pattern and the copy on the result view).
export function canvasLayout(rect, size, { split = false, maxCell = 34, reserve = 104 } = {}) {
  const avail = rect.h - reserve;
  if (!split) {
    const cell = Math.max(4, Math.min(maxCell, Math.floor(avail / size), Math.floor((rect.w - 30) / size)));
    return { cell, ox: [rect.x + (rect.w - cell * size) / 2], oy: rect.y + 36 };
  }
  const cell = Math.max(4, Math.min(maxCell, Math.floor(avail / size), Math.floor((rect.w / 2 - 14) / size)));
  const gap = 12;
  const mid = rect.x + rect.w / 2;
  return { cell, ox: [mid - gap / 2 - cell * size, mid + gap / 2], oy: rect.y + 36 };
}

// Centres of the palette row (colours then the Fertig button, which is `wide`) inside a rect.
export function paletteLayout(rect, count, { item = 20, gap = 4, wide = 36 } = {}) {
  const widths = Array.from({ length: count + 1 }, (_, i) => (i === count ? wide : item));
  const total = widths.reduce((a, b) => a + b, 0) + gap * count;
  let x = rect.x + (rect.w - total) / 2;
  return widths.map(w => { const cx = x + w / 2; x += w + gap; return { cx, w }; });
}

export const cellAt = (layout, size, x, y, index = 0) => {
  const cx = Math.floor((x - layout.ox[index]) / layout.cell);
  const cy = Math.floor((y - layout.oy) / layout.cell);
  return cx >= 0 && cy >= 0 && cx < size && cy < size ? { x: cx, y: cy } : null;
};
