// Pure map logic (AD-28), no Phaser: validates maps against data/object-types.json, resolves door targets
// and entry points, and flood-fills walkable ground. Used by services/World.js at runtime and by
// scripts/check-map.mjs / scripts/check-world.mjs in node.
//
// A "world" here is { maps: { [id]: { data, debug } } }; `env` carries { catalog, surfaces, tiles, i18n? }
// (i18n = optional Set of known keys; without it label keys are not looked up).

const MAP_KEYS = ['tileSize', 'metersPerTile', 'indoor', 'legend', 'rows', 'objects'];

export const objectKinds = (catalog) => Object.keys(catalog.types);

// Tile cells covered by an object (point, rect or the cells along a rail path).
export function cellsOf(o, shape) {
  const out = [];
  if (shape === 'path') {
    for (const [px, py] of o.points ?? []) out.push([Math.floor(px), Math.floor(py)]);
  } else if (shape === 'rect') {
    for (let j = 0; j < o.h; j++) for (let i = 0; i < o.w; i++) out.push([o.x + i, o.y + j]);
  } else out.push([o.x, o.y]);
  return out;
}

function checkField(name, spec, v, where, env, errors) {
  const bad = (what) => errors.push(`${where}: field '${name}' ${what}`);
  switch (spec.type) {
    case 'string': if (typeof v !== 'string' || !v) bad('must be a non-empty string'); break;
    case 'bool': if (typeof v !== 'boolean') bad('must be true or false'); break;
    case 'int': if (!Number.isInteger(v)) bad('must be an integer'); break;
    case 'number': if (typeof v !== 'number' || !Number.isFinite(v)) bad('must be a number'); break;
    case 'enum': if (!spec.values.includes(v)) bad(`must be one of ${spec.values.join(', ')}`); break;
    case 'color': if (typeof v !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(v)) bad('must be a #rrggbb colour'); break;
    case 'i18n': if (typeof v !== 'string' || !v) bad('must be an i18n key'); else if (env.i18n && !env.i18n.has(v)) bad(`i18n key '${v}' is missing`); break;
    case 'mapId': if (typeof v !== 'string' || !v) bad('must be a map id'); break;
    case 'ids': if (!Array.isArray(v) || v.some(s => typeof s !== 'string')) bad('must be an array of ids'); break;
    case 'points': if (!Array.isArray(v) || v.length < 2 || v.some(p => !Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite))) bad('must be at least two [x, y] points'); break;
    default: bad(`has unknown catalog type ${spec.type}`);
  }
  if (typeof v === 'number' && spec.min !== undefined && v < spec.min) bad(`must be at least ${spec.min}`);
}

// Fields and shape of one object, without looking at the map grid. Returns error strings.
export function validateObject(o, catalog, env, mapId = '?') {
  const errors = [];
  const where = `${mapId}: ${o?.type ?? '?'} ${o?.id ?? '?'}`;
  const def = catalog.types[o?.type];
  if (!def) return [`${where}: unknown object type '${o?.type}'`];
  const fields = { ...catalog.common, ...def.fields };
  const known = new Set(['type', 'x', 'y', 'w', 'h', ...Object.keys(fields)]);
  if (def.shape === 'path') { known.delete('x'); known.delete('y'); known.delete('w'); known.delete('h'); } else if (def.shape === 'point') { known.delete('w'); known.delete('h'); }
  for (const k of Object.keys(o)) if (!known.has(k)) errors.push(`${where}: unknown field '${k}'`);
  for (const [name, spec] of Object.entries(fields)) {
    if (o[name] === undefined) { if (spec.required) errors.push(`${where}: missing required field '${name}'`); continue; }
    checkField(name, spec, o[name], where, env, errors);
  }
  const geo = def.shape === 'rect' ? ['x', 'y', 'w', 'h'] : def.shape === 'point' ? ['x', 'y'] : [];
  for (const k of geo) {
    if (o[k] === undefined) errors.push(`${where}: missing required field '${k}'`);
    else if (!Number.isInteger(o[k])) errors.push(`${where}: field '${k}' must be an integer`);
    else if ((k === 'w' || k === 'h') && o[k] < 1) errors.push(`${where}: field '${k}' must be at least 1`);
  }
  return errors;
}

// Grid helpers shared by the checks: a map is walkable where its surface is not solid.
export function gridOf(map, surfaces) {
  const H = map.rows.length;
  const W = map.rows[0].length;
  const walkable = (x, y) => x >= 0 && y >= 0 && x < W && y < H && !surfaces[map.legend[map.rows[y][x]]]?.solid;
  return { W, H, walkable, surface: (x, y) => map.legend[map.rows[y]?.[x]] };
}

// 4-neighbour flood fill over walkable cells; returns a Uint8Array (1 = reachable) of W*H.
export function reachable(map, surfaces, sx, sy) {
  const { W, H, walkable } = gridOf(map, surfaces);
  const seen = new Uint8Array(W * H);
  if (!walkable(sx, sy)) return seen;
  const queue = [sy * W + sx];
  seen[queue[0]] = 1;
  for (let q = 0; q < queue.length; q++) {
    const x = queue[q] % W;
    const y = (queue[q] / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (!walkable(nx, ny) || seen[ny * W + nx]) continue;
      seen[ny * W + nx] = 1;
      queue.push(ny * W + nx);
    }
  }
  return seen;
}

// Where a player appears: an `entry` object, or a `spawn` object with that id.
export function findEntry(map, entryId) {
  return map.objects.find(o => (o.type === 'entry' || o.type === 'spawn') && o.id === entryId) ?? null;
}

// Entry point of a map in tile coordinates, or null: the named entry, or the map's first entry / spawn when no id is given.
export function resolveEntry(map, entryId) {
  const o = entryId ? findEntry(map, entryId) : map.objects.find(p => p.type === 'spawn') ?? map.objects.find(p => p.type === 'entry');
  return o ? { id: o.id, x: o.x, y: o.y, facing: o.facing ?? 'down' } : null;
}

// What a door leads to: { map, entry } or { error }.
export function resolveDoor(world, mapId, doorId) {
  const door = world.maps[mapId]?.data.objects.find(o => o.type === 'door' && o.id === doorId);
  if (!door) return { error: `no door ${doorId} in ${mapId}` };
  const target = world.maps[door.to];
  if (!target) return { error: `door ${doorId} in ${mapId} leads to unknown map '${door.to}'` };
  const entry = findEntry(target.data, door.entry);
  if (!entry) return { error: `door ${doorId} in ${mapId}: map '${door.to}' has no entry '${door.entry}'` };
  return { map: door.to, entry: { id: entry.id, x: entry.x, y: entry.y, facing: entry.facing ?? 'down' } };
}

// One map: grid shape, legend, every object against the catalog, ids, walls, reachability.
export function validateMap(id, map, env) {
  const errors = [];
  const { catalog, surfaces, tiles } = env;
  for (const k of Object.keys(map)) if (!MAP_KEYS.includes(k)) errors.push(`${id}: unknown map key '${k}'`);
  if (!Number.isInteger(map.tileSize) || map.tileSize < 1) errors.push(`${id}: tileSize must be a positive integer`);
  if (map.indoor !== undefined && typeof map.indoor !== 'boolean') errors.push(`${id}: indoor must be true or false`);
  if (!Array.isArray(map.rows) || !map.rows.length || !map.rows.every(r => typeof r === 'string')) return [...errors, `${id}: rows must be a list of strings`];
  if (!map.legend || !Array.isArray(map.objects)) return [...errors, `${id}: legend and objects are required`];
  const W = map.rows[0].length;
  for (const [y, r] of map.rows.entries()) if (r.length !== W) errors.push(`${id}: row ${y} width ${r.length}, expected ${W}`);
  for (const ch of new Set(map.rows.join(''))) if (!map.legend[ch]) errors.push(`${id}: char '${ch}' missing in legend`);
  for (const [ch, sid] of Object.entries(map.legend)) {
    if (!surfaces[sid]) errors.push(`${id}: legend '${ch}' -> unknown surface ${sid}`);
    if (!tiles[sid]) errors.push(`${id}: legend '${ch}' -> no tile art for ${sid}`);
  }
  if (errors.length) return errors;

  const { H, walkable, surface } = gridOf(map, surfaces);
  const ids = new Set();
  for (const o of map.objects) {
    if (ids.has(o.id)) errors.push(`${id}: duplicate object id '${o.id}'`);
    ids.add(o.id);
    const objErrors = validateObject(o, catalog, env, id);
    errors.push(...objErrors);
    if (objErrors.length) continue;
    const def = catalog.types[o.type];
    for (const [x, y] of cellsOf(o, def.shape)) {
      if (x < 0 || y < 0 || x >= W || y >= H) { errors.push(`${id}: ${o.type} ${o.id} is out of bounds at ${x},${y}`); continue; }
      if (def.inWall === true || walkable(x, y)) continue;
      if (def.inWall === 'perch' && o.perch) {
        if (surface(x, y) !== 'fence') errors.push(`${id}: perched ${o.type} ${o.id} must sit on a fence`);
      } else errors.push(`${id}: ${o.type} ${o.id} lies in a wall at ${x},${y}`);
    }
  }
  const start = resolveEntry(map, null);
  if (!start) return [...errors, `${id}: the map has no spawn or entry`];
  const seen = reachable(map, surfaces, start.x, start.y);
  if (!seen[start.y * W + start.x]) errors.push(`${id}: the first entry ${start.id} stands on blocked ground`);
  for (const o of map.objects) {
    const def = catalog.types[o.type];
    if (!def?.reach || o.debug) continue;
    if (!cellsOf(o, def.shape).some(([x, y]) => seen[y * W + x])) errors.push(`${id}: ${o.type} ${o.id} cannot be reached from ${start.id}`);
  }
  return errors;
}

// Every map plus the links between them: door targets exist with a matching entry, gameplay doors never lead into debug maps.
export function validateWorld(world, env) {
  const errors = [];
  for (const [id, m] of Object.entries(world.maps)) {
    errors.push(...validateMap(id, m.data, env));
    for (const o of m.data.objects) {
      if (o.type !== 'door') continue;
      const r = resolveDoor(world, id, o.id);
      if (r.error) errors.push(r.error);
      else if (world.maps[r.map].debug && !m.debug && !o.debug) errors.push(`${id}: door ${o.id} leads from gameplay into debug map '${r.map}' (mark it debug)`);
    }
  }
  return errors;
}
