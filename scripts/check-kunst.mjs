// Checks the Kunst minigame logic (minigames/kunstCore.js, data/pixel-patterns.json): the hand-authored icons, seeded pattern
// generation for every kind and level (determinism, validity, symmetry, colour counts, grid sizes), the palette, scoring with
// partial credit, the adaptive level and the memorize time (shorter at higher levels, longer for struggling kids, longer with
// the musicArtBonus perk), the paint cursor model (grid, palette row, strokes, submit), the canvas layout and the registry.
// Run: node scripts/check-kunst.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  KINDS, PaintModel, UNPAINTED, adaptLevel, bandOf, canvasLayout, cellAt, generatePattern, memorizeMs, mulberry32, paletteFor, paletteLayout,
  profileFor, scoreGrid, symmetryOf
} from '../minigames/kunstCore.js';
import { winnerOf } from '../minigames/matheCore.js';

const json = p => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const data = json('data/pixel-patterns.json');
const def = json('data/minigames.json').minigames.find(m => m.id === 'kunst');
const characters = json('data/characters.json');
const de = json('i18n/de.json');
const en = json('i18n/en.json');
const o = def.options;
const paletteIds = data.palette.map(c => c.id);
const gen = (seed, level, kinds = o.kinds, recolor = o.recolor) => generatePattern({ rng: mulberry32(seed), profile: profileFor(o.levels, level), kinds, icons: data.icons, paletteIds, recolor });

// ---- registry and texts ----
assert.equal(def.subject, 'kunst');
assert.ok(def.durationSeconds >= 30 && def.durationSeconds <= 90);
assert.equal(def.maxPlayers, 2);
assert.equal(def.learning, false);
assert.deepEqual(def.topics, []);
assert.equal(o.levels.length, 5, 'one profile per difficulty');
assert.deepEqual(Object.keys(o.kinds).sort(), [...KINDS].sort());
for (const k of ['title', 'help', 'memorize', 'paint', 'skip', 'paintHint', 'done', 'target', 'yours', 'perfect', 'score', 'winner', 'tie', ...o.bands.map(b => `result.${b.key}`)]) {
  assert.ok(de[`minigame.kunst.${k}`] && en[`minigame.kunst.${k}`], `minigame.kunst.${k} in both languages`);
}
assert.ok(de['minigame.kunst.result.great'].includes('{n}') && de['minigame.kunst.result.great'].includes('{total}') && en['minigame.kunst.result.ok'].includes('{total}'));
assert.ok(o.bands[0].min === 1 && o.bands.at(-1).min === 0 && o.bands.every((b, i) => i === 0 || b.min < o.bands[i - 1].min));

// ---- levels: bigger grids, more colours, less time ----
{
  const sizes = o.levels.map(l => l.size);
  assert.deepEqual([sizes[0], sizes.at(-1)], [4, 7], '4x4 up to 7x7');
  assert.ok(o.levels.every((l, i) => i === 0 || (l.size >= o.levels[i - 1].size && l.colors >= o.levels[i - 1].colors && l.showMs < o.levels[i - 1].showMs)), 'harder levels: bigger, more colours, less memorize time');
  assert.ok(o.levels[0].colors === 2 && o.levels.at(-1).colors === 5, '2-5 colours');
  assert.ok(o.levels.every(l => l.colors + l.decoys <= 6 && l.colors <= paletteIds.length), 'at most 6 swatches');
  assert.equal(profileFor(o.levels, 1), o.levels[0]);
  assert.equal(profileFor(o.levels, 99), o.levels.at(-1), 'clamped');
  assert.equal(profileFor(o.levels, 0), o.levels[0]);
  const jonas = characters.characters.find(c => c.id === 'jonas').perks.musicArtBonus;
  assert.ok(jonas > 0);
  const p = o.levels[2];
  assert.equal(memorizeMs(p, 0), p.showMs);
  assert.equal(memorizeMs(p, jonas), Math.round(p.showMs * (1 + jonas)), 'Jonas gets longer to memorize');
  assert.ok(memorizeMs(p, jonas) > memorizeMs(p, 0));
  assert.equal(memorizeMs(p, -1), p.showMs, 'a negative bonus is ignored');
  assert.ok(memorizeMs(o.levels[0], 0) > memorizeMs(o.levels.at(-1), 0), 'a struggling kid (low level) gets longer than a strong one');
  assert.ok(o.levels.every(l => l.showMs >= 3000 && l.showMs <= 9000), 'show times are sensible');
}

// ---- the hand-authored icons ----
{
  assert.equal(new Set(paletteIds).size, paletteIds.length);
  assert.ok(data.palette.every(c => /^#[0-9a-f]{6}$/.test(c.hex)));
  assert.equal(new Set(data.icons.map(i => i.id)).size, data.icons.length);
  for (const icon of data.icons) {
    assert.equal(icon.rows.length, icon.size, `${icon.id}: rows`);
    for (const row of icon.rows) assert.match(row, new RegExp(`^[0-${icon.colors.length - 1}]{${icon.size}}$`), `${icon.id}: row ${row}`);
    assert.ok(icon.colors.every(c => paletteIds.includes(c)) && new Set(icon.colors).size === icon.colors.length, `${icon.id}: known distinct colours`);
    assert.ok(icon.colors.length >= 2 && icon.colors.length <= 5);
    const used = new Set(icon.rows.join(''));
    assert.equal(used.size, icon.colors.length, `${icon.id}: every colour is used`);
  }
  // every level has an icon that fits it, and the iconic ones exist
  for (const [i, l] of o.levels.entries()) assert.ok(data.icons.some(ic => ic.size === l.size && ic.colors.length <= l.colors), `level ${i + 1} has an icon`);
  for (const name of ['heart', 'star', 'house', 'smiley']) assert.ok(data.icons.some(ic => ic.id.startsWith(name)), name);
  for (const name of ['heart7', 'star7', 'house7', 'smiley7']) assert.ok(data.icons.find(ic => ic.id === name));
}

// ---- generation: deterministic, valid, right size and colours ----
{
  assert.deepEqual(gen(5, 3), gen(5, 3), 'same seed, same pattern');
  assert.notDeepEqual(gen(5, 3).cells, gen(6, 3).cells, 'another seed, another pattern');
  const kinds = new Set();
  for (let level = 1; level <= 5; level++) {
    const profile = profileFor(o.levels, level);
    for (let seed = 1; seed <= 150; seed++) {
      const p = gen(seed * 31 + level, level);
      kinds.add(p.kind);
      assert.equal(p.size, profile.size);
      assert.equal(p.cells.length, p.size * p.size);
      assert.ok(p.cells.every(c => Number.isInteger(c) && c >= 0 && c < paletteIds.length), 'palette indexes');
      assert.deepEqual(p.colors, [...new Set(p.cells)].sort((a, b) => a - b), 'colors = the used indexes');
      assert.ok(p.colors.length >= 2 && p.colors.length <= profile.colors, `level ${level} ${p.kind}: ${p.colors.length} colours`);
      assert.ok(KINDS.includes(p.kind));
      if (p.kind === 'mirrorH') assert.ok(symmetryOf(p).h, 'mirrorH is left-right symmetric');
      if (p.kind === 'mirrorQ') assert.ok(symmetryOf(p).h && symmetryOf(p).v, 'mirrorQ is symmetric both ways');
      if (p.kind === 'mirrorH' || p.kind === 'mirrorQ') assert.ok(p.colors.length >= Math.min(profile.colors, 3), 'noise shows enough colours');
      if (p.kind === 'icon') {
        const icon = data.icons.find(i => i.id === p.icon);
        assert.equal(icon.size, profile.size);
        assert.ok(icon.colors.length <= profile.colors);
        assert.equal(p.colors.length, icon.colors.length);
      }
    }
  }
  assert.deepEqual([...kinds].sort(), [...KINDS].sort(), 'every kind shows up');
  // an icon keeps its shape when recoloured
  for (let seed = 0; seed < 60; seed++) {
    const p = gen(seed, 3, { icon: 1 }, 1);
    const chars = [...data.icons.find(i => i.id === p.icon).rows.join('')];
    assert.ok(p.cells.every((c, i) => p.cells.every((d, j) => (c === d) === (chars[i] === chars[j]))), `${p.icon}: recolouring keeps the picture`);
  }
  assert.ok(new Set(Array.from({ length: 30 }, (_, seed) => gen(seed, 3, { icon: 1 }, 1).colors.join())).size > 3, 'recolouring changes the colours');
  // forced kinds
  for (const kind of KINDS.filter(k => k !== 'icon')) {
    const p = gen(2, 4, { [kind]: 1 });
    assert.equal(p.kind, kind);
  }
  // an icon-only mix at a size without a fitting icon falls back to noise instead of failing
  const fallback = generatePattern({ rng: mulberry32(1), profile: { size: 5, colors: 1, showMs: 4000, decoys: 0 }, kinds: { icon: 1, mirrorH: 1 }, icons: data.icons, paletteIds });
  assert.equal(fallback.kind, 'mirrorH');
  // stripes and checkers are what they say
  const checker = gen(4, 3, { checker: 1 });
  assert.equal(checker.colors.length, 2);
  assert.ok(checker.cells[0] !== checker.cells[1] && checker.cells[0] !== checker.cells[checker.size]);
  const stripe = gen(4, 4, { stripes: 1 });
  assert.ok(stripe.colors.length >= 2);
  // the same kinds at the same level mix over many seeds
  const sums = new Set();
  for (let seed = 0; seed < 40; seed++) sums.add(gen(seed, 3).cells.join(''));
  assert.ok(sums.size > 20, 'lots of different patterns');
}

// ---- palette ----
{
  const rng = mulberry32(8);
  const p = gen(11, 4);
  const plain = paletteFor(p, 0, paletteIds.length, rng);
  assert.deepEqual(plain, p.colors, 'without decoys the palette is the pattern colours');
  const decoy = paletteFor(p, 1, paletteIds.length, mulberry32(8));
  assert.equal(decoy.length, p.colors.length + 1);
  assert.ok(p.colors.every(c => decoy.includes(c)), 'every needed colour is offered');
  assert.deepEqual(decoy, [...decoy].sort((a, b) => a - b), 'ascending');
  assert.equal(new Set(decoy).size, decoy.length);
  assert.deepEqual(paletteFor(p, 1, paletteIds.length, mulberry32(8)), decoy, 'seeded');
  assert.ok(paletteFor({ colors: [0, 1] }, 20, 4, mulberry32(1)).length <= 4, 'never more than the palette has');
}

// ---- scoring with partial credit ----
{
  const t = [0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3];
  const perfect = scoreGrid(t, [...t]);
  assert.deepEqual([perfect.right, perfect.total, perfect.accuracy, perfect.perfect, perfect.wrong], [16, 16, 1, true, []]);
  const blank = scoreGrid(t, new Array(16).fill(UNPAINTED));
  assert.deepEqual([blank.right, blank.accuracy, blank.perfect], [0, 0, false], 'an empty canvas is worth nothing');
  const half = [...t].map((c, i) => (i < 8 ? c : UNPAINTED));
  assert.equal(scoreGrid(t, half).accuracy, 0.5, 'half painted right = half the credit');
  assert.deepEqual(scoreGrid(t, half).wrong, [8, 9, 10, 11, 12, 13, 14, 15]);
  const one = [...t];
  one[5] = 3;
  const s = scoreGrid(t, one);
  assert.deepEqual([s.right, s.perfect, s.wrong], [15, false, [5]]);
  assert.equal(s.accuracy, 15 / 16);
  const randomish = scoreGrid(t, t.map(c => (c + 1) % 4));
  assert.equal(randomish.accuracy, 0, 'a shifted palette is all wrong');
  for (const v of [perfect, blank, s]) assert.ok(v.accuracy >= 0 && v.accuracy <= 1 && v.right + v.wrong.length === v.total, 'bounds');
  assert.equal(scoreGrid([], []).accuracy, 0);
  // bands
  assert.equal(bandOf(1, o.bands).key, 'perfect');
  assert.equal(bandOf(0.95, o.bands).key, 'great');
  assert.equal(bandOf(0.8, o.bands).key, 'great');
  assert.equal(bandOf(0.6, o.bands).key, 'ok');
  assert.equal(bandOf(0.1, o.bands).key, 'low');
  assert.equal(bandOf(0, o.bands).key, 'low');
}

// ---- adaptive level ----
{
  const max = o.levels.length;
  assert.equal(adaptLevel(3, 1, o.adapt, max), 4, 'perfect: harder');
  assert.equal(adaptLevel(5, 1, o.adapt, max), 5, 'capped');
  assert.equal(adaptLevel(3, 0.7, o.adapt, max), 3, 'decent: same');
  assert.equal(adaptLevel(3, 0.3, o.adapt, max), 2, 'poor: easier');
  assert.equal(adaptLevel(1, 0, o.adapt, max), 1, 'never below 1');
  assert.equal(adaptLevel(3, o.adapt.downBelow, o.adapt, max), 3);
}

// ---- the paint cursor ----
{
  const nav = (dx = 0, dy = 0, confirm = false, pick = 0) => ({ dx, dy, confirm, pick });
  const m = new PaintModel(4, [5, 6, 7]);
  assert.equal(m.cells.length, 16);
  assert.ok(m.cells.every(c => c === UNPAINTED));
  assert.deepEqual([m.cx, m.cy, m.focus, m.color], [0, 0, 'grid', 0]);
  assert.equal(m.nav(nav(-1, 0)), '', 'the cursor stays inside the grid');
  assert.equal(m.nav(nav(1, 0)), 'move');
  assert.equal(m.cx, 1);
  assert.equal(m.nav(nav(0, 0, true)), 'paint');
  assert.equal(m.cells[1], 5, 'cells hold the palette index');
  assert.equal(m.nav(nav(0, 0, true)), '', 'painting the same colour again changes nothing');
  assert.equal(m.nav(nav(0, 0, false, 2)), 'select', 'key 2 picks the second colour');
  assert.equal(m.color, 1);
  assert.equal(m.nav(nav(0, 0, true)), 'paint');
  assert.equal(m.cells[1], 6, 'repainting replaces the colour');
  assert.equal(m.nav(nav(0, 0, false, 4)), '', 'key 4 with three colours does nothing');
  assert.equal(m.color, 1);
  // hold confirm and move: a stroke
  assert.equal(m.nav(nav(1, 0), true), 'paint');
  assert.equal(m.nav(nav(1, 0), true), 'paint');
  assert.deepEqual(m.cells.slice(0, 4), [UNPAINTED, 6, 6, 6]);
  assert.equal(m.nav(nav(1, 0), true), '', 'the wall stops the stroke');
  assert.equal(m.painted, 3);
  // down from the last row enters the palette
  for (let i = 0; i < 3; i++) m.nav(nav(0, 1));
  assert.equal(m.cy, 3);
  assert.equal(m.nav(nav(0, 1)), 'move');
  assert.equal(m.focus, 'palette');
  assert.equal(m.item, 1, 'the palette cursor starts on the chosen colour');
  assert.equal(m.nav(nav(-1, 0)), 'move');
  assert.equal(m.item, 0);
  assert.equal(m.nav(nav(0, 0, true)), 'select');
  assert.deepEqual([m.color, m.focus], [0, 'grid'], 'choosing a colour returns to the canvas');
  m.nav(nav(0, 1));
  assert.equal(m.focus, 'palette');
  for (let i = 0; i < 5; i++) m.nav(nav(1, 0));
  assert.equal(m.item, 3, 'the Fertig button is the item after the colours');
  assert.equal(m.nav(nav(0, 0, true)), 'submit');
  assert.equal(m.nav(nav(0, -1)), 'move');
  assert.equal(m.focus, 'grid', 'up leaves the palette');
  // mouse and touch painting
  const t = new PaintModel(5, [3, 4]);
  assert.ok(t.paintAt(2, 3));
  assert.ok(!t.paintAt(2, 3));
  assert.ok(t.paintAt(2, 3, 1));
  assert.ok(!t.paintAt(9, 9), 'outside the grid');
  assert.ok(!t.paintAt(-1, 0));
  assert.equal(t.cells[3 * 5 + 2], 4);
  assert.ok(t.selectColor(1) && !t.selectColor(2) && !t.selectColor(-1));
}

// ---- layout ----
{
  const rects = [{ x: 6, y: 26, w: 468, h: 238 }, { x: 6, y: 26, w: 230, h: 238 }];
  for (const rect of rects) {
    for (let size = 4; size <= 7; size++) {
      const one = canvasLayout(rect, size);
      assert.ok(one.cell >= 8 && one.cell <= 34, `cell ${one.cell}`);
      assert.ok(one.ox[0] >= rect.x && one.ox[0] + one.cell * size <= rect.x + rect.w, 'canvas inside the rect');
      assert.ok(one.oy + one.cell * size + 40 <= rect.y + rect.h, 'room for the palette row below the canvas');
      const two = canvasLayout(rect, size, { split: true });
      assert.ok(two.cell >= 8 && two.ox[1] > two.ox[0] + two.cell * size, 'two grids side by side without overlap');
      assert.ok(two.ox[0] >= rect.x && two.ox[1] + two.cell * size <= rect.x + rect.w, 'both inside the rect');
      assert.equal(cellAt(one, size, one.ox[0] + 1, one.oy + 1).x, 0);
      assert.deepEqual(cellAt(one, size, one.ox[0] + one.cell * size - 1, one.oy + one.cell * size - 1), { x: size - 1, y: size - 1 });
      assert.equal(cellAt(one, size, one.ox[0] - 1, one.oy), null);
      assert.equal(cellAt(one, size, one.ox[0], one.oy + one.cell * size), null);
    }
    for (let n = 2; n <= 6; n++) {
      const items = paletteLayout(rect, n);
      assert.equal(items.length, n + 1, 'colours + Fertig');
      assert.ok(items[0].cx - items[0].w / 2 >= rect.x && items.at(-1).cx + items.at(-1).w / 2 <= rect.x + rect.w, 'palette row inside the rect');
      assert.ok(items.every((it, i) => i === 0 || it.cx - it.w / 2 >= items[i - 1].cx + items[i - 1].w / 2), 'no overlap');
    }
  }
}

// ---- a gentle winner is still cosmetic ----
assert.equal(winnerOf([{ correct: 10 }, { correct: 4 }]), 0);
assert.equal(winnerOf([{ correct: 0 }, { correct: 0 }]), -1);

console.log('check-kunst ok');
