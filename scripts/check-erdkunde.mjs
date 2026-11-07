// Checks the Germany map data (data/maps-geo/germany.json), the geometry core (minigames/geoCore.js), the Erdkunde
// minigame logic (minigames/erdkundeCore.js) and the item mapping (data/learning/grade3/geo-map.json): polygon validity,
// every state has a polygon and capital, the states tile the country, pick() at the state centres and capitals,
// geographic plausibility, rivers and seas, all geo items resolve and are judged right through the engine, the layouts
// and the registry entry.
// Run: node scripts/check-erdkunde.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  distToPath, isSimple, makeLayout, nearest, outlineOf, pickAt, pointInPolygon, polygonArea, resolveGeo, segmentsCross, stepTarget
} from '../minigames/geoCore.js';
import { MODES, classify, inPool, layoutFor, makePlan, modeAt, plainable, resolveTargets } from '../minigames/erdkundeCore.js';
import { layoutRects } from '../minigames/minigameCore.js';
import { EngineCore, mulberry32 } from '../learning/engineCore.js';

const json = p => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const raw = json('data/maps-geo/germany.json');
const geo = resolveGeo(raw);
const data = json('data/minigames.json');
const def = data.minigames.find(m => m.id === 'erdkunde');
const o = def.options;
const de = json('i18n/de.json');
const en = json('i18n/en.json');
const sachkunde = json('data/learning/grade3/sachkunde.json');
const geoMap = json('data/learning/grade3/geo-map.json');
const seeded = seed => () => (seed = (seed * 16807) % 2147483647) / 2147483647;

// ---- registry entry ----
assert.equal(def.subject, 'erdkunde');
assert.ok(def.durationSeconds >= 60 && def.durationSeconds <= 75, '60-75 s');
assert.deepEqual(def.topics, ['sachkunde']);
assert.equal(def.maxPlayers, 2);
assert.ok(!def.debug);
assert.deepEqual(MODES, ['wo', 'capital']);
assert.deepEqual(o.tags, ['geo', 'karte']);
assert.ok(o.fallbackShare >= 0 && o.fallbackShare < 0.5);
for (const k of ['title', 'mode.wo', 'mode.capital', 'help.wo', 'help.capital', 'combo', 'winner', 'tie']) {
  assert.ok(de[`minigame.erdkunde.${k}`] && en[`minigame.erdkunde.${k}`], `minigame.erdkunde.${k} in both languages`);
}
assert.ok(de['minigame.erdkunde.winner'].includes('{name}') && en['minigame.erdkunde.winner'].includes('{name}'));
{
  const plan = makePlan(o.mix, seeded(5), def.durationSeconds * 1000, MODES);
  assert.ok(MODES.includes(plan.first) && plan.first !== plan.second && modeAt(plan, 0) === plan.first && modeAt(plan, plan.switchMs) === plan.second);
}
assert.match(readFileSync(new URL('../scenes/BootScene.js', import.meta.url), 'utf8'), /geo-germany.*maps-geo\/germany\.json[\s\S]*geo-map.*grade3\/geo-map\.json/, 'BootScene loads the map data');

// ---- the 16 states: polygon, capital, names ----
const OFFICIAL = {
  sh: ['Schleswig-Holstein', 'Kiel'], hh: ['Hamburg', 'Hamburg'], ni: ['Niedersachsen', 'Hannover'], hb: ['Bremen', 'Bremen'],
  nw: ['Nordrhein-Westfalen', 'Düsseldorf'], he: ['Hessen', 'Wiesbaden'], rp: ['Rheinland-Pfalz', 'Mainz'], bw: ['Baden-Württemberg', 'Stuttgart'],
  by: ['Bayern', 'München'], sl: ['Saarland', 'Saarbrücken'], be: ['Berlin', 'Berlin'], bb: ['Brandenburg', 'Potsdam'],
  mv: ['Mecklenburg-Vorpommern', 'Schwerin'], sn: ['Sachsen', 'Dresden'], st: ['Sachsen-Anhalt', 'Magdeburg'], th: ['Thüringen', 'Erfurt']
};
{
  assert.equal(geo.areas.length, 16, 'sixteen Bundesländer');
  assert.deepEqual(geo.areas.map(a => a.id).sort(), Object.keys(OFFICIAL).sort());
  assert.deepEqual(geo.areas.filter(a => a.kind === 'city').map(a => a.id).sort(), ['be', 'hb', 'hh'], 'Berlin, Hamburg and Bremen are the city-state blobs');
  for (const a of geo.areas) {
    assert.deepEqual([a.name, a.capital.name], OFFICIAL[a.id], `${a.id}: German name and capital`);
    assert.ok(a.ring.length >= 3, `${a.id}: a polygon`);
    const flat = a.ring.flat();
    assert.ok(isSimple(flat), `${a.id}: the polygon does not cross itself`);
    assert.ok(polygonArea(flat) > 0, `${a.id}: positive area`);
    assert.ok(pointInPolygon(a.capital.at[0], a.capital.at[1], flat), `${a.id}: the capital lies inside its state`);
    assert.ok(pointInPolygon(a.label[0], a.label[1], flat), `${a.id}: the label point lies inside its state`);
    assert.ok(Number.isInteger(a.tone) && a.tone >= 0 && a.tone < geo.palette.length, `${a.id}: a palette tone`);
    for (const [lon, lat] of a.ring) assert.ok(lon >= geo.bounds.lonMin && lon <= geo.bounds.lonMax && lat >= geo.bounds.latMin && lat <= geo.bounds.latMax, `${a.id}: inside the map bounds`);
  }
  // every shared point is used, and neighbours of different tone
  const used = new Set(raw.states.flatMap(s => s.ring.filter(r => typeof r === 'string')));
  assert.deepEqual(Object.keys(raw.points).filter(p => !used.has(p)), [], 'no unused border points');
  for (const a of raw.states) for (const b of raw.states) {
    if (a.id >= b.id) continue;
    const shared = a.ring.some(p => typeof p === 'string' && b.ring.includes(p));
    if (shared) assert.notEqual(a.tone, b.tone, `${a.id} and ${b.id} are neighbours with different pastel tones`);
  }
  assert.throws(() => resolveGeo({ ...raw, states: [{ ...raw.states[0], ring: ['nowhere'] }] }), /unknown point/);
}

// ---- geometry primitives ----
{
  const sq = [0, 0, 10, 0, 10, 10, 0, 10];
  assert.ok(pointInPolygon(5, 5, sq) && !pointInPolygon(11, 5, sq) && !pointInPolygon(-1, -1, sq));
  const u = [0, 0, 10, 0, 10, 10, 6, 10, 6, 4, 4, 4, 4, 10, 0, 10]; // a U shape
  assert.ok(pointInPolygon(2, 8, u) && pointInPolygon(8, 8, u) && !pointInPolygon(5, 8, u) && pointInPolygon(5, 2, u), 'concave polygons');
  assert.equal(polygonArea(sq), 100);
  assert.ok(isSimple(sq) && !isSimple([0, 0, 10, 10, 10, 0, 0, 10]), 'a bow-tie crosses itself');
  assert.ok(segmentsCross(0, 0, 10, 10, 0, 10, 10, 0) && !segmentsCross(0, 0, 10, 0, 0, 1, 10, 1) && !segmentsCross(0, 0, 5, 5, 5, 5, 9, 1), 'touching ends do not cross');
  assert.equal(distToPath(5, 3, [0, 0, 10, 0]), 3);
  assert.equal(distToPath(13, 4, [0, 0, 10, 0]), 5, 'distance to the end point');
  assert.equal(distToPath(5, -2, sq, true), 2);
  assert.equal(distToPath(0, 5, [0, 0, 10, 0, 10, 10, 0, 10], true), 0, 'the closing edge counts');
  assert.deepEqual(nearest(4, 4, [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 5, y: 5 }]).id, 'b');
  assert.equal(nearest(0, 0, []), null);
  const grid = [{ id: 'c', x: 0, y: 0 }, { id: 'r', x: 10, y: 1 }, { id: 'l', x: -10, y: 0 }, { id: 'u', x: 0, y: -10 }, { id: 'd', x: 1, y: 10 }, { id: 'far', x: 100, y: 60 }];
  assert.deepEqual(['r', 'l', 'u', 'd'].map(id => stepTarget(grid, 'c', ...{ r: [1, 0], l: [-1, 0], u: [0, -1], d: [0, 1] }[id])), ['r', 'l', 'u', 'd'], 'a step goes to the neighbour in that direction');
  assert.equal(stepTarget(grid, 'l', -1, 0), 'l', 'nothing beyond: stay');
  assert.equal(stepTarget(grid, 'c', 1, 0), 'r');
  assert.equal(stepTarget(grid, 'r', 1, 0), 'far', 'a far target is still reachable');
  assert.equal(stepTarget(grid, 'nowhere', 1, 0), 'c', 'an unknown start gives the first anchor');
  assert.equal(stepTarget([], 'x', 1, 0), null);
}

// ---- the country outline and the tiling of the states ----
const RECT = { x: 10, y: 20, w: 300, h: 400 };
const L = makeLayout(geo, RECT);
{
  const ring = outlineOf(geo);
  assert.ok(ring.length >= 40 && isSimple(ring.flat()), 'a single simple outline of the country');
  assert.ok(ring.length < geo.areas.filter(a => a.kind === 'state').reduce((n, a) => n + a.ring.length, 0), 'the outline is the union, not the sum');
  assert.throws(() => outlineOf({ areas: [{ kind: 'state', ring: [[0, 0], [1, 0], [1, 1]] }, { kind: 'state', ring: [[5, 5], [6, 5], [6, 6]] }] }), /more than one outline/);
  assert.ok(polygonArea(L.outline) > polygonArea(L.at.by.pts), 'the outline is bigger than Bayern');
  // the states cover the outline exactly: no gaps, no overlaps (city-states are blobs on top)
  let inside = 0;
  for (let x = RECT.x; x < RECT.x + RECT.w; x += 1.5) {
    for (let y = RECT.y; y < RECT.y + RECT.h; y += 1.5) {
      const inO = pointInPolygon(x, y, L.outline);
      const n = L.areas.filter(a => a.kind === 'state' && pointInPolygon(x, y, a.pts)).length;
      if (inO) inside++;
      assert.equal(n, inO ? 1 : 0, `exactly one state at (${x}, ${y}) inside the outline, none outside`);
    }
  }
  assert.ok(inside > 20000, 'the sample covers the country');
  for (const c of L.areas.filter(a => a.kind === 'city')) {
    assert.ok(polygonArea(c.pts) < polygonArea(L.at.sl.pts) / 3, `${c.id}: a small blob`);
    assert.ok(c.pts.every((v, i) => (i % 2 ? pointInPolygon(c.pts[i - 1], v, L.outline) : true)), `${c.id}: inside the country`);
  }
}

// ---- projection and pick ----
{
  assert.ok(L.scale > 0);
  for (const e of [...L.areas, ...L.rivers, ...L.seas]) {
    for (let i = 0; i < e.pts.length; i += 2) {
      assert.ok(e.pts[i] >= RECT.x - 30 && e.pts[i] <= RECT.x + RECT.w + 30 && e.pts[i + 1] >= RECT.y - 1 && e.pts[i + 1] <= RECT.y + RECT.h + 1, `${e.id}: projected near its rectangle`);
    }
  }
  const wide = makeLayout(geo, { x: 0, y: 0, w: 1000, h: 400 });
  assert.ok(Math.abs(wide.scale - L.scale) < 1, 'the height decides in a wide rectangle');
  const bb = pts => ({ x0: Math.min(...pts.filter((_, i) => i % 2 === 0)), x1: Math.max(...pts.filter((_, i) => i % 2 === 0)), y0: Math.min(...pts.filter((_, i) => i % 2)), y1: Math.max(...pts.filter((_, i) => i % 2)) });
  const ob = bb(L.outline);
  assert.ok(ob.y1 - ob.y0 > 0.9 * (RECT.h - 4) || ob.x1 - ob.x0 > 0.9 * (RECT.w - 4), 'the map fills its rectangle');
  assert.ok(ob.y1 - ob.y0 > ob.x1 - ob.x0, 'Germany is taller than wide');
  for (const a of L.areas) {
    assert.equal(pickAt(L, a.ax, a.ay), a.id, `pick at the centre of ${a.id}`);
    assert.equal(pickAt(L, a.capital.x, a.capital.y), a.id, `pick at the capital of ${a.id}`);
    assert.equal(pickAt(L, a.ax, a.ay, 'states', 0), a.id, `pick without tolerance at ${a.id}`);
  }
  assert.equal(pickAt(L, RECT.x + 2, RECT.y + 2), null, 'water is no state');
  assert.equal(pickAt(L, L.at.by.ax, L.at.by.ay, 'rivers'), null, 'a state centre is no river');
  // the small city-states win over the state around them, and a tap close to the edge still counts
  assert.equal(pickAt(L, L.at.be.ax, L.at.be.ay), 'be');
  assert.equal(pickAt(L, L.at.hh.ax, L.at.hh.ay), 'hh');
  assert.equal(pickAt(L, L.at.hb.ax, L.at.hb.ay), 'hb');
  assert.equal(pickAt(L, L.at.bb.ax, L.at.bb.ay), 'bb', 'Brandenburg is still Brandenburg next to Berlin');
  const edge = L.at.sl.pts;
  assert.equal(pickAt(L, edge[0] - 2, edge[1], 'states', 3) !== null, true, 'a tap 2 px outside the coast still picks the nearest state');
  const away = pickAt(L, RECT.x + 3, RECT.y + RECT.h - 3, 'states', 3);
  assert.equal(away, null, 'far from every state is null');
  // anchors of the target kinds
  assert.equal(L.anchors('states').length, 16);
  assert.deepEqual(L.anchors('rivers').map(a => a.id).sort(), ['donau', 'elbe', 'main', 'oder', 'rhein', 'weser']);
  assert.deepEqual(L.anchors('seas').map(a => a.id).sort(), ['nordsee', 'ostsee']);
}

// ---- geography: states lie where a child should expect them ----
{
  const c = id => geo.byId[id].label;
  const north = (a, b) => assert.ok(c(a)[1] > c(b)[1], `${a} lies north of ${b}`);
  const west = (a, b) => assert.ok(c(a)[0] < c(b)[0], `${a} lies west of ${b}`);
  north('sh', 'ni'); north('ni', 'he'); north('he', 'bw'); north('mv', 'bb'); north('bb', 'sn'); north('ni', 'nw'); north('th', 'by'); north('by', 'bw');
  west('nw', 'he'); west('sl', 'rp'); west('rp', 'he'); west('ni', 'st'); west('st', 'bb'); west('th', 'sn'); west('bw', 'by'); west('hb', 'hh'); west('hh', 'be');
  assert.ok(c('by')[1] < c('he')[1] && c('sl')[0] === Math.min(...geo.areas.map(a => c(a.id)[0])), 'Bayern south of Hessen, the Saarland furthest west');
  const area = id => polygonArea(L.at[id].pts);
  assert.equal(geo.areas.filter(a => a.kind === 'state').map(a => a.id).sort((a, b) => area(b) - area(a))[0], 'by', 'Bayern is the biggest state');
  assert.ok(area('ni') > area('nw') && area('nw') > area('sl') * 5 && area('sl') < area('rp'), 'Niedersachsen > NRW > Saarland, Rheinland-Pfalz > Saarland');
  const latOf = id => geo.byId[id].capital.at[1];
  assert.ok(latOf('sh') > latOf('hb') && latOf('hb') > latOf('be') && latOf('be') > latOf('sn') && latOf('sn') > latOf('by'), 'capitals from north to south');
  // the real neighbours share a border (a shared border point), the others do not
  const shares = (a, b) => raw.states.find(s => s.id === a).ring.some(p => typeof p === 'string' && raw.states.find(s => s.id === b).ring.includes(p));
  for (const [a, b] of [['by', 'bw'], ['by', 'sn'], ['by', 'th'], ['by', 'he'], ['nw', 'ni'], ['nw', 'he'], ['nw', 'rp'], ['sl', 'rp'], ['mv', 'sh'], ['mv', 'bb'], ['bb', 'sn'], ['st', 'th'], ['ni', 'sh']]) assert.ok(shares(a, b), `${a} borders ${b}`);
  for (const [a, b] of [['sh', 'by'], ['sl', 'bb'], ['nw', 'sn'], ['mv', 'bw'], ['sl', 'bw']]) assert.ok(!shares(a, b), `${a} does not border ${b}`);
  assert.ok(shares('sl', 'rp') && !shares('sl', 'bw'), 'the Saarland only touches Rheinland-Pfalz (and France, Luxembourg)');
}

// ---- rivers and seas ----
{
  assert.deepEqual(geo.rivers.map(r => r.id).sort(), ['donau', 'elbe', 'main', 'oder', 'rhein', 'weser']);
  assert.deepEqual(geo.rivers.map(r => r.name).sort(), ['Donau', 'Elbe', 'Main', 'Oder', 'Rhein', 'Weser']);
  for (const r of geo.rivers) {
    assert.ok(r.line.length >= 5, `${r.id}: a polyline`);
    for (const [lon, lat] of r.line) assert.ok(lon >= geo.bounds.lonMin && lon <= geo.bounds.lonMax && lat >= geo.bounds.latMin && lat <= geo.bounds.latMax, `${r.id}: inside the bounds`);
    const mid = L.at[r.id];
    assert.equal(pickAt(L, mid.ax, mid.ay, 'rivers'), r.id, `pick on the river ${r.id}`);
    assert.equal(pickAt(L, mid.ax + 40, mid.ay, 'rivers', 2) === r.id, false, `${r.id}: far from the river is no pick`);
  }
  // the real courses: Rhein south-north to the west, Elbe from the Czech border to the North Sea, Donau west-east in the south
  const course = id => ({ s: geo.byId[id].line[0], e: geo.byId[id].line.at(-1) });
  assert.ok(course('rhein').e[1] > course('rhein').s[1] + 3 && course('rhein').s[0] > 8, 'the Rhein flows north from the Bodensee');
  assert.ok(course('elbe').e[0] < course('elbe').s[0] - 4 && course('elbe').e[1] > 53.5, 'the Elbe flows to the North Sea near Cuxhaven');
  assert.ok(course('weser').e[1] > 53.4 && course('weser').s[1] < 51.6, 'the Weser flows north to Bremerhaven');
  assert.ok(course('donau').e[0] > course('donau').s[0] + 4 && course('donau').e[1] < 49, 'the Donau flows east through the south');
  assert.ok(course('oder').s[0] > 14.2 && course('oder').e[1] > 53, 'the Oder is the eastern border river');
  assert.ok(pointInPolygon(...geo.byId.hh.capital.at, geo.byId.hh.ring.flat()) && distToPath(...geo.byId.hh.capital.at, geo.byId.elbe.line.flat()) < 0.15, 'Hamburg lies on the Elbe');
  assert.ok(distToPath(...geo.byId.by.capital.at, geo.byId.donau.line.flat()) > 0.4, 'München is not on the Donau');
  assert.ok(distToPath(8.8, 53.08, geo.byId.weser.line.flat()) < 0.1, 'Bremen lies on the Weser');
  assert.ok(distToPath(6.97, 50.94, geo.byId.rhein.line.flat()) < 0.1, 'Köln lies on the Rhein');
  assert.ok(distToPath(9.93, 49.80, geo.byId.main.line.flat()) < 0.1, 'Würzburg lies on the Main');
  // seas: off the coast, north of the country, never over a state
  for (const s of geo.seas) {
    const flat = s.ring.flat();
    assert.ok(isSimple(flat) && pointInPolygon(...s.label, flat), `${s.id}: a simple polygon with its label inside`);
    assert.equal(pickAt(L, L.at[s.id].ax, L.at[s.id].ay, 'seas'), s.id, `pick the ${s.name}`);
    assert.equal(pickAt(L, L.at[s.id].ax, L.at[s.id].ay), null, `${s.id}: no state in the sea`);
    for (const a of L.areas) for (let i = 0; i < s.ring.length; i++) assert.ok(!pointInPolygon(L.at[s.id].pts[2 * i], L.at[s.id].pts[2 * i + 1], a.pts), `${s.id} vertex ${i} outside ${a.id}`);
    for (const a of geo.areas.filter(x => x.kind === 'state')) {
      for (let i = 0; i < s.ring.length; i++) {
        const j = (i + 1) % s.ring.length;
        for (let k = 0; k < a.ring.length; k++) {
          const m = (k + 1) % a.ring.length;
          assert.ok(!segmentsCross(...s.ring[i], ...s.ring[j], ...a.ring[k], ...a.ring[m]), `${s.id} does not cut across ${a.id}`);
        }
      }
    }
  }
  assert.ok(geo.byId.nordsee.label[0] < geo.byId.ostsee.label[0] && geo.byId.nordsee.label[1] > 53.5, 'Nordsee in the north-west, Ostsee in the north-east');
  assert.equal(Object.keys(geo.byId).length, 16 + 6 + 2, 'ids are unique across states, rivers and seas');
}

// ---- Sachkunde items on the map ----
const items = sachkunde.items;
const byId = new Map(items.map(q => [q.id, q]));
const { byItem, problems } = resolveTargets(geo, geoMap.targets, items);
{
  assert.deepEqual(problems, [], 'every map table entry resolves');
  assert.equal(byItem.size, Object.keys(geoMap.targets).length);
  assert.ok(byItem.size >= 20, `mapped items (${byItem.size})`);
  const core = new EngineCore({ pools: { sachkunde: sachkunde }, cfg: json('data/learning.json'), reactions: json('data/learning/reactions.json'), store: { get() {}, record() {} }, rng: mulberry32(3) });
  const modes = { wo: 0, capital: 0 };
  const kinds = new Set();
  const targets = new Set();
  for (const [id, info] of byItem) {
    const q = byId.get(id);
    assert.ok(q.tags.includes('geo'), `${id}: a geo item`);
    assert.equal(q.type, 'choice');
    modes[info.mode]++;
    targets.add(info.target);
    const t = geo.byId[info.target];
    kinds.add(t.kind);
    if (info.mode === 'wo') {
      assert.equal(info.what, { state: 'states', city: 'states', river: 'rivers', sea: 'seas' }[t.kind]);
      assert.ok(core.isCorrect(q, t.name), `${id}: tapping ${t.name} is right for the engine`);
      for (const other of geo.areas.filter(a => a.id !== info.target)) assert.ok(!core.isCorrect(q, other.name), `${id}: tapping ${other.name} is wrong`);
    } else {
      assert.equal(info.what, 'states');
      assert.ok(core.isCorrect(q, t.capital.name), `${id}: the capital ${t.capital.name} is right`);
      assert.ok(q.answers.length >= 2 && q.answers.length <= 4, `${id}: answer buttons`);
    }
  }
  assert.ok(modes.wo >= 8 && modes.capital >= 12, `both modes have items (${JSON.stringify(modes)})`);
  assert.ok(kinds.has('state') && kinds.has('river') && kinds.has('city'), 'states, rivers and city-states are asked');
  const stateTargets = geo.areas.filter(a => targets.has(a.id)).length;
  assert.ok(stateTargets >= 15, `${stateTargets} of 16 states are asked about`);
  // classify rules
  const capitalQ = byId.get('sk-013');
  assert.equal(classify(geo, capitalQ, 'by').mode, 'capital');
  assert.equal(classify(geo, capitalQ, 'nw'), null, 'wrong target: the capital does not fit');
  assert.equal(classify(geo, capitalQ, 'nowhere'), null);
  assert.equal(classify(geo, byId.get('sk-014'), 'by').mode, 'wo');
  assert.equal(classify(geo, byId.get('sk-015'), 'rhein').what, 'rivers');
  assert.equal(classify(geo, byId.get('sk-020'), 'be'), null, 'typed items are not map items');
  assert.ok(resolveTargets(geo, { 'sk-013': 'nw', nope: 'by', 'sk-014': 'xx' }, items).problems.length === 3, 'bad table entries are reported');
  // the fallback: unmapped geo/karte choice items
  const pool = items.filter(q => inPool(q, o.tags));
  const plain = pool.filter(q => !byItem.has(q.id) && plainable(q));
  assert.ok(plain.length >= 40, `unmapped items still play as plain choice (${plain.length})`);
  assert.ok(plain.some(q => q.tags.includes('karte')) && plain.some(q => q.tags.includes('geo')));
  assert.ok(!plainable({ type: 'typed', answers: [] }) && !plainable({ type: 'choice', answers: [1, 2, 3, 4, 5] }));
  // all three question sources serve the engine
  const seen = { wo: new Set(), capital: new Set(), plain: new Set() };
  for (let i = 0; i < 300; i++) {
    seen.wo.add(core.next('sachkunde', { filter: q => byItem.get(q.id)?.mode === 'wo' }).id);
    seen.capital.add(core.next('sachkunde', { filter: q => byItem.get(q.id)?.mode === 'capital' }).id);
    seen.plain.add(core.next('sachkunde', { filter: q => inPool(q, o.tags) && !byItem.has(q.id) && plainable(q) }).id);
  }
  assert.ok(seen.wo.size >= 5 && seen.capital.size >= 6 && seen.plain.size >= 12, `the engine serves variety for every source (${seen.wo.size}, ${seen.capital.size}, ${seen.plain.size})`);
}

// ---- layouts of the modes ----
{
  for (const players of [1, 2]) {
    const rects = layoutRects(players, 480, 270, { top: 26, margin: 6, gap: 8 });
    for (const r of rects) {
      const inside = b => b.x >= r.x - 0.01 && b.x + b.w <= r.x + r.w + 0.01 && b.y >= r.y - 0.01 && b.y + (b.h ?? 0) <= r.y + r.h + 0.01;
      const wo = layoutFor(r, 'wo');
      assert.ok(inside(wo.map) && inside({ ...wo.question, h: 28 }) && inside({ ...wo.note, h: players === 1 ? 100 : 46 }), `${players} player(s): the wo parts fit the area`);
      assert.ok(wo.map.w >= 100 && wo.map.h >= 130, `${players}: a map big enough to tap (${wo.map.w}x${wo.map.h})`);
      const ml = makeLayout(geo, wo.map);
      assert.ok(ml.at.sl.pts.length && polygonArea(ml.at.sl.pts) > 20, `${players}: even the Saarland is tappable (${Math.round(polygonArea(ml.at.sl.pts))} px2)`);
      assert.ok(polygonArea(ml.at.hb.pts) > 5, `${players}: Bremen has a few pixels`);
      if (players === 1) assert.ok(wo.note.x >= wo.map.x + wo.map.w, 'one player: the note sits right of the map');
      else assert.ok(wo.note.y >= wo.map.y + wo.map.h, 'two players: the note sits below the map');
      const cap = layoutFor(r, 'capital');
      assert.ok(inside(cap.map) && inside(cap.panel), `${players}: the capital parts fit the area`);
      assert.ok(cap.panel.x + cap.panel.w <= cap.map.x, `${players}: the panel and the map do not overlap`);
      assert.ok(cap.panel.w >= 140, `${players}: the answer panel is wide enough (${cap.panel.w})`);
    }
  }
}

console.log('check-erdkunde: ok');
