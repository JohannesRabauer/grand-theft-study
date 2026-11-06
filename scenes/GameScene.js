import { Pools } from '../entities/pools.js';
import { Surfaces } from '../physics/surfaces.js';
import { addStaticWall } from '../physics/bodies.js';
import { WallStreamer } from '../physics/WallStreamer.js';
import { Input } from '../ui/input.js';
import { Bikes } from '../entities/Bike.js';
import { Player } from '../entities/Player.js';
import { Zones } from '../entities/Zones.js';
import { Wind } from '../physics/Wind.js';
import { Weather } from '../physics/Weather.js';
import { ParticleHub } from '../particles/ParticleHub.js';
import { Props } from '../entities/Prop.js';
import { Flags } from '../entities/Flag.js';
import { ChaseDirector } from '../ai/ChaseDirector.js';
import { Caught } from '../entities/Caught.js';
import { ToolBelt } from '../tools/ToolBelt.js';
import { AmmoPickups } from '../entities/AmmoPickups.js';

const STEP_MS = 1000 / 60; // Matter's fixed timestep (AD-14); MovementController assumes it too
const STEP_SLACK = 0.95; // a frame that arrives a hair early (vsync jitter) still gets its step
const MAX_BACKLOG = 3 * STEP_MS;

export class GameScene extends Phaser.Scene {
  constructor() { super('Game'); }

  create() {
    const cache = this.cache.json;
    const map = cache.get('town');
    const ts = map.tileSize;

    // AD-2: one ctx, created once, handed to every system.
    const { events, i18n, t, quality } = this.registry.get('app');
    const ctx = {
      events,
      i18n,
      t,
      quality,
      pools: new Pools(),
      map,
      surfaces: new Surfaces(map, cache.get('surfaces')),
      input: new Input(this, events, cache.get('input'))
    };
    this.ctx = ctx;

    this.renderGrid(map);
    const walls = this.buildWalls(map);

    // map objects are in tile coordinates
    const spawn = map.objects.find(o => o.type === 'spawn' && o.id === 'player');
    this.player = new Player(this, ctx, (spawn.x + 0.5) * ts, (spawn.y + 0.5) * ts, cache.get('vehicles'), 'foot');
    ctx.player = this.player;
    this.bikes = new Bikes(this, ctx);
    ctx.frozen = false; // set during the caught frame: the world stands still, UIScene keeps running
    this.zones = new Zones(this, ctx);
    ctx.zones = this.zones;
    const wcfg = cache.get('weather');
    ctx.wind = new Wind(wcfg.wind);
    ctx.weather = new Weather(this, ctx, wcfg.weather);
    ctx.particles = new ParticleHub(this, ctx, cache.get('particles'));
    this.props = new Props(this, ctx, cache.get('props'));
    this.tools = new ToolBelt(this, ctx, cache.get('tool'));
    this.ammo = new AmmoPickups(this, ctx, cache.get('tool'));
    this.flags = new Flags(this, ctx, wcfg.flag);
    this.chase = new ChaseDirector(this, ctx, cache.get('chase'), cache.get('vehicles'));
    this.caught = new Caught(this, ctx, cache.get('chase').caught, this.bikes);
    this.zoomCfg = cache.get('camera');
    this.streamer = new WallStreamer(this, ctx, walls, cache.get('quality').wallRadius);

    const worldW = map.rows[0].length * ts;
    const worldH = map.rows.length * ts;
    this.cameras.main.setBounds(0, 0, worldW, worldH);
    this.cameras.main.startFollow(this.player.sprite, true, 0.15, 0.15);

    // UIScene asks for pause / quit through events; the world is only changed here.
    this.paused = false;
    this.physAcc = 0;
    events.on('game:pause', () => this.setPaused(true));
    events.on('game:resume', () => this.setPaused(false));
    events.on('game:quit', () => this.scene.start('Menu'));
    this.scene.launch('UI', { ctx });
    this.events.once('shutdown', () => {
      this.scene.stop('UI');
      events.removeAllListeners(); // the shared emitter outlives this run; menu re-subscribes in create
    });
  }

  // Zoom follows real speed continuously (1.0 standing .. 0.6 at top speed), smoothed.
  // Only the main camera zooms; UIScene has its own camera.
  updateZoom(dt) {
    const z = this.zoomCfg;
    const t = Math.min(1, this.player.move.velSpeed / z.speedForMin);
    const target = z.max + (z.min - z.max) * t;
    const cam = this.cameras.main;
    cam.setZoom(cam.zoom + (target - cam.zoom) * (1 - Math.exp(-z.smooth * dt)));
  }

  // Static ground: all tiles drawn once into a single RenderTexture.
  renderGrid(map) {
    const ts = map.tileSize;
    const rt = this.add.renderTexture(0, 0, map.rows[0].length * ts, map.rows.length * ts).setOrigin(0).setDepth(-1);
    rt.beginDraw();
    map.rows.forEach((row, ty) => {
      for (let tx = 0; tx < row.length; tx++) rt.batchDraw(`tile-${map.legend[row[tx]]}`, tx * ts, ty * ts);
    });
    rt.endDraw();
  }

  // Wall bodies merged into horizontal runs per row to keep the body count low.
  buildWalls(map) {
    const ts = map.tileSize;
    const walls = [];
    map.rows.forEach((row, ty) => {
      let start = -1;
      for (let tx = 0; tx <= row.length; tx++) {
        const wall = tx < row.length && this.ctx.surfaces.solid(map.legend[row[tx]]);
        if (wall && start < 0) start = tx;
        if (!wall && start >= 0) {
          const body = addStaticWall(this, ((start + tx) / 2) * ts, (ty + 0.5) * ts, (tx - start) * ts, ts);
          walls.push({ body, x0: start * ts, x1: tx * ts, y0: ty * ts, y1: (ty + 1) * ts });
          start = -1;
        }
      }
    });
    return walls;
  }

  setPaused(on) {
    this.paused = on;
    this.syncWorld();
  }

  freeze(on) {
    this.ctx.frozen = on;
    this.syncWorld();
  }

  syncWorld() {
    if (this.paused || this.ctx.frozen) this.matter.world.pause(); else this.matter.world.resume();
  }

  // Fixed-step Matter without the library runner (its frame-delta smoothing sorted and sliced a
  // 100-entry history every frame). Slow frames catch up with at most 3 steps; 120 Hz screens step every other frame.
  stepPhysics(delta) {
    const world = this.matter.world;
    if (!world.enabled) { this.physAcc = 0; return; }
    this.physAcc = Math.min(this.physAcc + delta, MAX_BACKLOG);
    while (this.physAcc >= STEP_MS * STEP_SLACK) {
      world.step(STEP_MS);
      this.physAcc = Math.max(0, this.physAcc - STEP_MS);
    }
  }

  update(time, delta) {
    const dt = Math.min(delta, 50) / 1000;
    this.ctx.input.update();
    if (this.ctx.input.intent.pause) this.ctx.events.emit('ui:pause-toggle');
    if (this.paused) return;
    this.stepPhysics(delta);
    if (this.ctx.input.intent.weather) this.ctx.weather.toggle();
    this.ctx.wind.update(dt);
    this.ctx.weather.update(dt);
    this.caught.update(dt);
    if (this.ctx.frozen) {
      this.flags.update(dt);
      this.ctx.particles.update(dt);
      return;
    }
    this.player.update(dt);
    this.tools.update(dt);
    this.ammo.update(dt);
    this.bikes.update(dt);
    this.zones.update();
    this.chase.update(dt);
    this.updateZoom(dt);
    this.props.update(dt);
    this.flags.update(dt);
    this.ctx.particles.update(dt);
    this.streamer.update();
  }
}
