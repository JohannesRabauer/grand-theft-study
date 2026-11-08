import { addStaticWall } from '../physics/bodies.js';
import { tileKey } from '../scenes/HiResArt.js';
import { groundKeys } from '../scenes/EnvArt.js';
import { paintGround, mapSeed } from '../scenes/GroundArt.js';
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

  // A base-pixel RGBA buffer as a temporary nearest-filtered image, scaled to the tier's texture size.
  groundSheet(key, data, paint, scale) {
    const canvas = document.createElement('canvas');
    canvas.width = paint.width;
    canvas.height = paint.height;
    canvas.getContext('2d').putImageData(new ImageData(data, paint.width, paint.height), 0, 0);
    if (this.scene.textures.exists(key)) this.scene.textures.remove(key);
    this.scene.textures.addCanvas(key, canvas).setFilter(Phaser.Textures.FilterMode.NEAREST);
    return this.scene.make.image({ key, add: false }).setOrigin(0).setScale(scale);
  }

  // Static ground stays within the device's texture limit, including the larger town.
  renderGround(map) {
    const { res } = this.ctx;
    const ts = map.tileSize * res.scale;
    const gl = this.scene.sys.game.renderer.gl;
    const limit = Math.min(4096, gl ? gl.getParameter(gl.MAX_TEXTURE_SIZE) : 4096);
    const span = Math.floor(limit / ts);
    const cols = map.rows[0].length;
    const seed = mapSeed(map, this.id);
    const ground = this.scene.add.container(0, 0).setDepth(-1);
    for (let y = 0; y < map.rows.length; y += span) {
      for (let x = 0; x < cols; x += span) {
        const w = Math.min(span, cols - x);
        const h = Math.min(span, map.rows.length - y);
        const rt = this.scene.add.renderTexture(x * map.tileSize, y * map.tileSize, w * ts, h * ts).setOrigin(0).setScale(res.inv);
        rt.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
        ground.add(rt);
        const paint = paintGround(map, seed, x, y, w, h);
        const sheets = paint ? [paint.under, paint.over].map((data, i) => this.groundSheet(`ground-sheet-${i}`, data, paint, res.scale)) : [];
        rt.beginDraw();
        const rest = [];
        for (let ty = 0; ty < h; ty++) for (let tx = 0; tx < w; tx++) {
          const key = res.scale > 1 ? tileKey(map, x + tx, y + ty) : `tile-${map.legend[map.rows[y + ty][x + tx]]}`;
          // AD-30: blended edges, shores, curbs and oriented fences come from the neighbours, drawn once here
          const keys = groundKeys(map, x + tx, y + ty, key, this.id);
          rt.batchDraw(keys[0], tx * ts, ty * ts);
          for (let i = 1; i < keys.length; i++) rest.push(keys[i], tx * ts, ty * ts);
        }
        // Three passes: base tiles, then the organic overlay (tone patches, decals), then edges and dressing, then worn dirt
        if (sheets[0]) rt.batchDraw(sheets[0], 0, 0);
        for (let i = 0; i < rest.length; i += 3) rt.batchDraw(rest[i], rest[i + 1], rest[i + 2]);
        if (sheets[1]) rt.batchDraw(sheets[1], 0, 0);
        rt.endDraw();
        for (const s of sheets) { s.destroy(); this.scene.textures.remove(s.texture.key); }
      }
    }
    return ground;
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
