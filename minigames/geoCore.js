// Pure geometry and data of the Germany map (story 4.4), no Phaser: resolves data/maps-geo/germany.json (shared border
// points, states, city-states, capitals, rivers, seas), projects it into any screen rectangle, and answers "what is at
// this point" (point-in-polygon, nearest) and "where does a cursor step go". ui/GermanyMap.js draws a layout;
// ErdkundeGame and the later tram map quiz (9.4) use the same core. scripts/check-erdkunde.mjs validates the data.

// ---- polygon geometry on flat [x0, y0, x1, y1, ...] arrays ----

export function pointInPolygon(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) {
    const yi = pts[i + 1];
    const yj = pts[j + 1];
    if ((yi > y) !== (yj > y) && x < ((pts[j] - pts[i]) * (y - yi)) / (yj - yi) + pts[i]) inside = !inside;
  }
  return inside;
}

export function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// Distance to a polyline (closed: also the edge from the last point back to the first).
export function distToPath(x, y, pts, closed = false) {
  let best = Infinity;
  const n = pts.length;
  for (let i = 0; i + 3 < n; i += 2) best = Math.min(best, distToSegment(x, y, pts[i], pts[i + 1], pts[i + 2], pts[i + 3]));
  if (closed && n >= 4) best = Math.min(best, distToSegment(x, y, pts[n - 2], pts[n - 1], pts[0], pts[1]));
  return best;
}

export function polygonArea(pts) {
  let a = 0;
  for (let i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) a += pts[j] * pts[i + 1] - pts[i] * pts[j + 1];
  return Math.abs(a) / 2;
}

const side = (ax, ay, bx, by, cx, cy) => Math.sign((bx - ax) * (cy - ay) - (by - ay) * (cx - ax));

// Proper crossing of the segments a-b and c-d (touching ends do not count).
export function segmentsCross(ax, ay, bx, by, cx, cy, dx, dy) {
  return side(ax, ay, bx, by, cx, cy) * side(ax, ay, bx, by, dx, dy) < 0 && side(cx, cy, dx, dy, ax, ay) * side(cx, cy, dx, dy, bx, by) < 0;
}

// A ring whose edges never cross each other.
export function isSimple(pts) {
  const n = pts.length / 2;
  for (let i = 0; i < n; i++) {
    const i2 = (i + 1) % n;
    for (let j = i + 1; j < n; j++) {
      const j2 = (j + 1) % n;
      if (j === i2 || j2 === i) continue;
      if (segmentsCross(pts[2 * i], pts[2 * i + 1], pts[2 * i2], pts[2 * i2 + 1], pts[2 * j], pts[2 * j + 1], pts[2 * j2], pts[2 * j2 + 1])) return false;
    }
  }
  return true;
}

// The anchor nearest to (x, y): { id, dist } or null.
export function nearest(x, y, anchors) {
  let best = null;
  for (const a of anchors) {
    const dist = Math.hypot(a.x - x, a.y - y);
    if (!best || dist < best.dist) best = { id: a.id, dist };
  }
  return best;
}

// Where a cursor step (dx or dy = +-1) from `fromId` goes: the nearest anchor in that direction (within about 60 degrees
// of it), or `fromId` when nothing lies that way. An unknown start gives the first anchor.
export function stepTarget(anchors, fromId, dx, dy) {
  const from = anchors.find(a => a.id === fromId);
  if (!from) return anchors[0]?.id ?? null;
  if (dx) dy = 0;
  let best = fromId;
  let bestScore = Infinity;
  for (const a of anchors) {
    if (a === from) continue;
    const vx = a.x - from.x;
    const vy = a.y - from.y;
    const along = vx * dx + vy * dy;
    const across = Math.abs(vx * dy - vy * dx);
    if (along <= 0 || across > along * 1.8) continue;
    const score = along + across;
    if (score < bestScore) { bestScore = score; best = a.id; }
  }
  return best;
}

// ---- the map data ----

// Resolves the JSON: named border points become [lon, lat] rings. `areas` = the 13 states, then the city-states.
// Every entity has id, name, kind ('state' | 'city' | 'river' | 'sea'); areas also short, tone, label, capital { name, at }.
export function resolveGeo(data) {
  const point = ref => {
    const p = typeof ref === 'string' ? data.points[ref] : ref;
    if (!p) throw new Error(`geo: unknown point "${ref}"`);
    return p;
  };
  const area = (a, kind) => ({ ...a, kind, ring: a.ring.map(point) });
  const areas = [...data.states.map(s => area(s, 'state')), ...data.cityStates.map(s => area(s, 'city'))];
  const rivers = data.rivers.map(r => ({ ...r, kind: 'river' }));
  const seas = data.seas.map(s => ({ ...s, kind: 'sea' }));
  const byId = {};
  for (const e of [...areas, ...rivers, ...seas]) {
    if (byId[e.id]) throw new Error(`geo: duplicate id "${e.id}"`);
    byId[e.id] = e;
  }
  return { bounds: data.bounds, palette: data.palette, water: data.water, areas, rivers, seas, byId };
}

const key = p => `${p[0]},${p[1]}`;

// The country outline: the edges that only one state has, chained into one ring of [lon, lat] points. Throws when the
// states do not form a single closed outline (a gap or a doubled border in the data).
export function outlineOf(geo) {
  const edges = new Map();
  for (const a of geo.areas) {
    if (a.kind !== 'state') continue;
    for (let i = 0; i < a.ring.length; i++) {
      const p = a.ring[i];
      const q = a.ring[(i + 1) % a.ring.length];
      const k = [key(p), key(q)].sort().join('|');
      const e = edges.get(k) ?? { p, q, n: 0 };
      e.n++;
      edges.set(k, e);
    }
  }
  const next = new Map();
  let count = 0;
  for (const e of edges.values()) {
    if (e.n !== 1) continue;
    for (const [from, to] of [[e.p, e.q], [e.q, e.p]]) {
      const list = next.get(key(from)) ?? [];
      list.push(to);
      next.set(key(from), list);
    }
    count++;
  }
  if (!count) throw new Error('geo: no outline edges');
  const start = [...edges.values()].find(e => e.n === 1).p;
  const ring = [start];
  let prev = null;
  let cur = start;
  for (let guard = 0; guard <= count; guard++) {
    const options = next.get(key(cur));
    if (options.length !== 2) throw new Error(`geo: outline is pinched at ${key(cur)}`);
    const to = options.find(o => !prev || key(o) !== key(prev)) ?? options[0];
    if (key(to) === key(start)) {
      if (ring.length !== count) throw new Error(`geo: the states make more than one outline (${ring.length} of ${count} edges)`);
      return ring;
    }
    ring.push(to);
    prev = cur;
    cur = to;
  }
  throw new Error('geo: outline does not close');
}

// ---- projection into a screen rectangle ----

// Latitude scale: one degree of longitude is cos(51 deg) as wide as one of latitude at Germany's centre.
const LON_SCALE = Math.cos((51.2 * Math.PI) / 180);

// Fits the map bounds into rect { x, y, w, h } (centred, `pad` px margin) and projects everything once. Returns
// { rect, scale, project, areas, rivers, seas, outline, anchors } where every entity has flat screen points `pts` and an
// anchor (ax, ay): areas = label point, rivers = their middle vertex, seas = label. `at` maps id -> entity.
export function makeLayout(geo, rect, { pad = 2 } = {}) {
  const { lonMin, lonMax, latMin, latMax } = geo.bounds;
  const spanU = (lonMax - lonMin) * LON_SCALE;
  const spanV = latMax - latMin;
  const scale = Math.min((rect.w - 2 * pad) / spanU, (rect.h - 2 * pad) / spanV);
  const ox = rect.x + (rect.w - spanU * scale) / 2;
  const oy = rect.y + (rect.h - spanV * scale) / 2;
  const px = lon => ox + (lon - lonMin) * LON_SCALE * scale;
  const py = lat => oy + (latMax - lat) * scale;
  const flat = ring => ring.flatMap(p => [px(p[0]), py(p[1])]);
  const at = {};
  const mk = (e, pts, a) => (at[e.id] = { id: e.id, kind: e.kind, name: e.name, tone: e.tone, pts, ax: a[0], ay: a[1] });
  const areas = geo.areas.map(a => {
    const out = mk(a, flat(a.ring), [px(a.label[0]), py(a.label[1])]);
    out.capital = { name: a.capital.name, x: px(a.capital.at[0]), y: py(a.capital.at[1]) };
    return out;
  });
  const rivers = geo.rivers.map(r => {
    const mid = r.line[Math.floor(r.line.length / 2)];
    return mk(r, flat(r.line), [px(mid[0]), py(mid[1])]);
  });
  const seas = geo.seas.map(s => mk(s, flat(s.ring), [px(s.label[0]), py(s.label[1])]));
  return {
    rect,
    scale,
    px,
    py,
    areas,
    rivers,
    seas,
    outline: flat(outlineOf(geo)),
    at,
    anchors: kind => (kind === 'rivers' ? rivers : kind === 'seas' ? seas : areas).map(e => ({ id: e.id, x: e.ax, y: e.ay }))
  };
}

// What is at (x, y). what: 'states' (state or city-state; a tap within `tol` px of a state's edge still counts, the small
// city-states win over the state around them), 'rivers' (the nearest river within `tol`) or 'seas'. Returns the id or null.
export function pickAt(layout, x, y, what = 'states', tol = 3) {
  if (what === 'rivers') {
    let best = null;
    let bestDist = tol;
    for (const r of layout.rivers) {
      const d = distToPath(x, y, r.pts);
      if (d <= bestDist) { best = r.id; bestDist = d; }
    }
    return best;
  }
  if (what === 'seas') return layout.seas.find(s => pointInPolygon(x, y, s.pts))?.id ?? null;
  const cities = layout.areas.filter(a => a.kind === 'city');
  const states = layout.areas.filter(a => a.kind === 'state');
  return cities.find(a => pointInPolygon(x, y, a.pts))?.id
    ?? cities.find(a => distToPath(x, y, a.pts, true) <= tol)?.id
    ?? states.find(a => pointInPolygon(x, y, a.pts))?.id
    ?? states.find(a => distToPath(x, y, a.pts, true) <= tol)?.id
    ?? null;
}
