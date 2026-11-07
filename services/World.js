import { addStaticWall } from '../physics/bodies.js';
import { tileKey } from '../scenes/HiResArt.js';
import { resolveEntry } from './worldLogic.js';

const FADE_MS = 160; // quick fade-in from black after a switch
const HEADING = { up: -Math.PI / 2, down: Math.PI / 2, left: Math.PI, right: 0 };

// ctx.world (AD-28): owns the current map's ground texture and wall bodies, and is the only way to change maps.
// `load(mapId, entryId)` tears down everything map-specific and builds the next map; players and pools persist.
//
// Map-specific systems (Zones, Doors, Props, AmmoPickups, Bikes, Flags, ParticleHub, Weather, ChaseDirector,
// WallStreamer, CrowdDirector) register themselves in their constructor and implement
// `unloadMap()` (release everything the map created) and `loadMap()` (build from ctx.map). They are
// unloaded in reverse and loaded in registration order, so a system may rely on those registered before it.
//
// Emits `world:leave` { map } before the switch and `world:enter` { map, entry } after it. Doors only
// emit `world:enter-request` { map, entry }; the switch itself happens at the start of the next frame (update).
// Maps flagged `debug` in data/maps/index.json (and doors marked `debug`) exist only with ?debug or ?bench.
export class World {
  constructor(scene, ctx, index, maps) {
    this.scene = scene;
    this.ctx = ctx;
    this.index = index;
    this.maps = maps;
    this.debugContent = !!window.SCHULWEG_TESTMAPS;
    this.id = null;
    this.ground = null;
    this.walls = []; // [{ body, x0, y0, x1, y1 }], handed to the WallStreamer
    this.systems = [];
    this.pending = null;
    ctx.world = this;
    ctx.events.on('world:enter-request', ev => { this.pending = ev; });
  }

  register(system) { this.systems.push(system); }

  // Maps a player can reach in this session.
  playable() {
    return this.index.maps.filter(m => !m.debug || this.debugContent).map(m => m.id);
  }

  // Pixel position of the current map's player spawn (or its first entry): where a caught player goes home.
  spawnPoint() {
    const map = this.ctx.map;
    const e = resolveEntry(map, 'player') ?? resolveEntry(map, null);
    return { x: (e.x + 0.5) * map.tileSize, y: (e.y + 0.5) * map.tileSize };
  }

  // Builds the first map before any system exists.
  start(mapId) {
    this.build(mapId);
  }

  // A pending door request is applied between frames, never in the middle of a system's update.
  update() {
    if (!this.pending) return;
    const { map, entry } = this.pending;
    this.pending = null;
    this.load(map, entry);
  }

  load(mapId, entryId) {
    const { ctx, scene } = this;
    const map = this.maps[mapId];
    const entry = map && (this.playable().includes(mapId)) ? resolveEntry(map, entryId) : null;
    if (!entry) {
      console.warn(`world.load: cannot enter '${mapId}' at '${entryId}'`);
      return false;
    }
    ctx.events.emit('world:leave', { map: this.id });
    for (let i = this.systems.length - 1; i >= 0; i--) this.systems[i].unloadMap();
    this.build(mapId);
    const ts = map.tileSize;
    for (const p of ctx.players) p.teleport((entry.x + 0.5) * ts, (entry.y + 0.5) * ts, HEADING[entry.facing]);
    scene.snapCamera();
    for (const s of this.systems) s.loadMap();
    scene.cameras.main.fadeIn(FADE_MS, 0, 0, 0);
    ctx.events.emit('world:enter', { map: mapId, entry: entry.id });
    return true;
  }

  // Replaces ctx.map, the surface grid, the ground texture and the wall bodies (the streamer owns removing the old ones).
  build(mapId) {
    const { ctx, scene } = this;
    const map = this.maps[mapId];
    this.ground?.destroy();
    this.id = mapId;
    ctx.map = map;
    ctx.surfaces.setMap(map);
    this.ground = this.renderGround(map);
    this.walls = this.buildWalls(map);
    scene.worldW = map.rows[0].length * map.tileSize;
    scene.worldH = map.rows.length * map.tileSize;
  }

  // Static ground: all tiles drawn once into a single RenderTexture, `res.scale` times as fine as
  // the world (3072x2048 texture at 2x) and displayed at 1/scale, so one texture pixel is one screen pixel.
  renderGround(map) {
    const { res } = this.ctx;
    const ts = map.tileSize * res.scale;
    const rt = this.scene.add.renderTexture(0, 0, map.rows[0].length * ts, map.rows.length * ts).setOrigin(0).setScale(res.inv).setDepth(-1);
    rt.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
    rt.beginDraw();
    map.rows.forEach((row, ty) => {
      for (let tx = 0; tx < row.length; tx++) rt.batchDraw(res.scale > 1 ? tileKey(map, tx, ty) : `tile-${map.legend[row[tx]]}`, tx * ts, ty * ts);
    });
    rt.endDraw();
    return rt;
  }

  // Wall bodies merged into horizontal runs per row to keep the body count low.
  buildWalls(map) {
    const ts = map.tileSize;
    const { surfaces } = this.ctx;
    const walls = [];
    map.rows.forEach((row, ty) => {
      let start = -1;
      for (let tx = 0; tx <= row.length; tx++) {
        const wall = tx < row.length && surfaces.solid(map.legend[row[tx]]);
        if (wall && start < 0) start = tx;
        if (!wall && start >= 0) {
          const body = addStaticWall(this.scene, ((start + tx) / 2) * ts, (ty + 0.5) * ts, (tx - start) * ts, ts);
          walls.push({ body, x0: start * ts, x1: tx * ts, y0: ty * ts, y1: (ty + 1) * ts });
          start = -1;
        }
      }
    });
    return walls;
  }
}
