import { gridOf } from '../services/worldLogic.js';

export const STREET_KINDS = ['bike', 'skateboard', 'rollerblades', 'scooter'];
export const streetKey = (map, id) => `${map}:${id}`;

export function streetCatalog(maps) {
  return Object.fromEntries(Object.entries(maps).flatMap(([map, data]) => data.objects
    .filter(o => o.street && STREET_KINDS.includes(o.type))
    .map(o => [streetKey(map, o.id), { id: streetKey(map, o.id), kind: o.type, map, x: (o.x + 0.5) * data.tileSize, y: (o.y + 0.5) * data.tileSize }])));
}

export function safeStreetPosition(cfg, map, x, y) {
  const data = cfg.worldMaps?.[map];
  if (!data || !Number.isFinite(x) || !Number.isFinite(y)) return false;
  const { walkable } = gridOf(data, cfg.worldSurfaces);
  return [-7, 0, 7].every(dx => [-7, 0, 7].every(dy => walkable(Math.floor((x + dx) / data.tileSize), Math.floor((y + dy) / data.tileSize))));
}

export function streetRecord(cfg, records, id) {
  const o = cfg.streetObjects?.[id];
  return records[id] ?? (o && { kind: o.kind, map: o.map, x: o.x, y: o.y, status: 'available', player: null });
}

export function validStreetRecords(records, cfg, playerCount) {
  if (!records || typeof records !== 'object' || Array.isArray(records)) return false;
  const riders = new Set();
  return Object.entries(records).every(([id, r]) => {
    const o = cfg.streetObjects?.[id];
    if (!o || !r || r.kind !== o.kind || !['available', 'dropped', 'carried'].includes(r.status)
      || !safeStreetPosition(cfg, r.map, r.x, r.y)) return false;
    if (r.status === 'carried') {
      if (!Number.isInteger(r.player) || r.player < 0 || r.player >= playerCount || riders.has(r.player)) return false;
      riders.add(r.player);
    } else if (r.player !== null) return false;
    return r.status !== 'available' || (r.map === o.map && r.x === o.x && r.y === o.y);
  });
}
