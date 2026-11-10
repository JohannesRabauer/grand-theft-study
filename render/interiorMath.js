// Interior maths (story 16.10, AD-31, CAP-35): which wall tile shows what, the walked paths that polish the floor, the windows
// and lamps of a room, the interior ambient light and the window light by weather. No Phaser: scripts/check-interiors.mjs runs it
// in node. Everything here is a pure function of the map, data/interiors.json and the clock; nothing is random.
import { lampLit } from './lightMath.js';

export const INTERIOR_MAPS = ['home', 'school', 'dojo'];
export const isInterior = mapId => INTERIOR_MAPS.includes(mapId);

const clamp01 = v => Math.min(1, Math.max(0, v));
const hash2 = (a, b) => {
  let h = Math.imul(a + 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
};
export { hash2 };

// What the wall face above a floor tile shows. `southId` is the surface id of the floor in front of the wall ('concrete' is the
// hall of home and school).
export function faceVariant(mapId, tx, southId) {
  const hall = southId === 'concrete';
  if (mapId === 'home') return hall ? (tx % 6 === 1 ? 'picture' : tx % 9 === 5 ? 'clock' : 'plain') : (tx % 5 === 2 ? 'window' : tx % 7 === 4 ? 'picture' : 'plain');
  if (mapId === 'school') {
    if (hall) return tx % 6 < 3 ? 'locker' : tx % 6 === 4 ? 'notice' : tx % 6 === 5 ? 'window' : 'plain';
    if (tx >= 13 && tx <= 18) return tx === 13 ? 'board-l' : tx === 18 ? 'board-r' : 'board-m';
    return tx % 3 === 1 ? 'window' : tx === 3 || tx === 28 ? 'clock' : 'plain';
  }
  if (mapId === 'dojo') return tx % 4 === 1 ? 'shoji' : tx % 8 === 5 ? 'scroll' : 'plain';
  return 'plain';
}

const idAt = (map, x, y) => (x < 0 || y < 0 || y >= map.rows.length || x >= map.rows[0].length ? null : map.legend[map.rows[y][x]]);

// Windows of a room: one per wall tile that shows a window, plus the ones the room data adds where another module paints the wall (`explicitWindows`: only those, the dojo wall is painted by entities/Dojo.js).
// { tx, ty (the floor row in front), w (tiles), kind, x, y (centre of the shaft's top edge in base pixels), jitter }
export function windowList(map, mapId, room) {
  const out = [];
  const cols = map.rows[0].length;
  const ts = map.tileSize;
  const row = map.rows;
  if (!room?.explicitWindows) for (let ty = 1; ty < row.length; ty++) for (let tx = 1; tx < cols - 1; tx++) {
    const id = idAt(map, tx, ty);
    if (id === 'wall' || idAt(map, tx, ty - 1) !== 'wall') continue;
    const kind = faceVariant(mapId, tx, id);
    if (kind !== 'window' && kind !== 'shoji') continue;
    out.push({ tx, ty, w: 1, kind, x: (tx + 0.5) * ts, y: ty * ts + ts / 2, jitter: hash2(tx, ty) });
  }
  for (const w of room?.windows ?? []) out.push({ tx: w.x, ty: 1, w: w.w, kind: w.kind, x: (w.x + w.w / 2) * ts, y: ts + ts / 2, jitter: hash2(w.x, 7), extra: true });
  return out;
}

// The items of a room (furniture and clutter from the data, plus the school desks).
export function itemsOf(room) {
  if (!room) return [];
  const items = room.items.map(i => ({ ...i }));
  if (room.desks) {
    for (const y of room.desks.rows) for (const x of room.desks.cols) items.push({ t: 'desk', v: Math.floor(hash2(x, y) * 3), x, y });
  }
  return items;
}

// Tiles walked often get a polished or scuffed floor: straight tile lines from the entry (and the doors) to each interaction spot.
// Returns a Map "tx,ty" -> level (1 or 2).
export function wearTiles(map, room) {
  const wear = new Map();
  const objs = map.objects ?? [];
  const centre = o => [Math.floor(o.x + (o.w ?? 1) / 2), Math.floor(o.y + (o.h ?? 1) / 2)];
  const mark = ([x0, y0], [x1, y1]) => {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) {
      const x = Math.round(x0 + ((x1 - x0) * i) / n);
      const y = Math.round(y0 + ((y1 - y0) * i) / n);
      const key = `${x},${y}`;
      const id = idAt(map, x, y);
      if (!id || id === 'wall') continue;
      wear.set(key, Math.min(2, (wear.get(key) ?? 0) + 1));
    }
  };
  for (const rule of room?.wear ?? []) {
    const from = objs.find(o => o.id === rule.from);
    if (!from) continue;
    const start = [from.x, from.y];
    for (const id of rule.to) {
      const o = objs.find(q => q.id === id);
      if (!o) continue;
      const end = centre(o);
      mark(start, [end[0], start[1]]); // along the room first, then up to the spot: paths run in the grid, not diagonally
      mark([end[0], start[1]], end);
    }
  }
  return wear;
}

const parse = t => { const [h, m] = t.split(':'); return +h * 60 + +m; };

// The lamp schedule from the data (times as minutes).
export function lampSchedule(cfg) {
  const l = cfg.lamp;
  return { on: parse(l.on), onSpread: l.onSpread, off: parse(l.off), offSpread: l.offSpread };
}

// 0..1: how much a ceiling lamp wants to be on. Lamps follow the evening schedule, and come on when it is dark or gloomy outside.
export function lampTarget(cfg, sched, minute, dark, weather, jitter) {
  const l = cfg.lamp;
  if (lampLit(minute, sched, jitter)) return 1;
  if (dark > l.dark) return 1;
  return weather === 'rain' || weather === 'snow' ? (dark > l.dark * 0.4 ? 1 : 0) : 0;
}

// 0..1 daylight at a window: follows the outdoor darkness, dimmed by the weather.
export function daylight(cfg, dark, weather) {
  const d = cfg.daylight;
  return clamp01(1 - dark / d.fade) * (d.weather[weather] ?? 1);
}

const rgb = hex => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
const smooth = t => t * t * (3 - 2 * t);

// Interior mood 0..1 (0 by day, 1 deep night) from the outdoor darkness.
export const interiorNight = (cfg, dark) => smooth(clamp01((dark - cfg.ambient.from) / (cfg.ambient.to - cfg.ambient.from)));

// The multiply colour of the light map indoors: the day colour, blending to the night colour as it gets dark.
export function interiorAmbient(cfg, dark, out = { r: 1, g: 1, b: 1 }) {
  const a = rgb(cfg.ambient.day);
  const b = rgb(cfg.ambient.night);
  const t = interiorNight(cfg, dark);
  out.r = a[0] + (b[0] - a[0]) * t;
  out.g = a[1] + (b[1] - a[1]) * t;
  out.b = a[2] + (b[2] - a[2]) * t;
  return out;
}

// Which of the three shaft shapes (leaning left, straight, leaning right) the sun makes at this minute: the shaft crosses the floor
// from morning to evening.
export function shaftSkew(cfg, minute) {
  const s = cfg.shaft;
  const t = clamp01((minute - s.minute0) / (s.minute1 - s.minute0));
  return t < 1 / 3 ? 0 : t < 2 / 3 ? 1 : 2;
}
