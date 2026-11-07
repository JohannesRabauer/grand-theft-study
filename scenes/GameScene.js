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
import { tileKey } from './HiResArt.js';

const STEP_MS = 1000 / 60; // Matter's fixed timestep (AD-14); MovementController assumes it too
const STEP_SLACK = 0.95; // a frame that arrives a hair early (vsync jitter) still gets its step
const MAX_BACKLOG = 3 * STEP_MS;
const SNAP_RANGE = 0.03; // zoom distance from an integer over which the camera blends from sub-pixel to pixel-snapped

export class GameScene extends Phaser.Scene {
  constructor() { super('Game'); }

  create() {
    const cache = this.cache.json;
    const map = cache.get('town');
    const ts = map.tileSize;

    // AD-2: one ctx, created once, handed to every system.
    const { events, i18n, t, quality, res } = this.registry.get('app');
    const ctx = {
      events,
      i18n,
      t,
      quality,
      res, // render scale: world units stay the same, textures are drawn `res.scale` times finer (AD-14)
      pools: new Pools(),
      map,
      surfaces: new Surfaces(map, cache.get('surfaces')),
      input: new Input(this, events, cache.get('input'))
    };
    this.ctx = ctx;

    this.renderGrid(map, res);
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

    // Own camera follow (see followCamera). The base zoom is the render scale, so the view still
    // covers the same world area as at 480x270; the speed zoom (camera.json) multiplies it.
    this.worldW = map.rows[0].length * ts;
    this.worldH = map.rows.length * ts;
    const cam = this.cameras.main;
    cam.setZoom(res.scale * this.zoomCfg.max);
    // Phaser floors the scroll of a roundPixels camera to whole world pixels in preRender (2 screen pixels
    // at zoom 2). followCamera snaps to screen pixels itself, so that floor is skipped here; sprites are
    // rounded to pixels only at an exactly integer zoom.
    const preRender = cam.preRender;
    cam.preRender = function () {
      this.roundPixels = false;
      preRender.call(this);
      this.roundPixels = true;
      this.renderRoundPixels = Number.isInteger(this.zoomX) && Number.isInteger(this.zoomY);
    };
    this.zoomGoal = cam.zoom;
    this.zoomVel = 0;
    this.camX = this.camOutX = this.player.x;
    this.camY = this.camOutY = this.player.y;
    this.followCamera(1);

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

  // Zoom follows real speed continuously (1.0 standing .. 0.6 at top speed) times the render scale.
  // The speed is low-passed with a small dead band (hysteresis, so noise in the speed never moves the
  // target), the zoom itself is a critically damped spring with a maximum rate, so it neither pops nor
  // overshoots, and it lands exactly on its target (an exact integer at the base zoom, where the
  // renderer rounds sprites to pixels). Only the main camera zooms; UIScene has its own camera.
  updateZoom(dt) {
    const z = this.zoomCfg;
    const scale = this.ctx.res.scale;
    const t = Math.min(1, this.player.move.velSpeed / z.speedForMin);
    const raw = (z.max + (z.min - z.max) * t) * scale;
    if (raw >= z.max * scale || raw <= z.min * scale || Math.abs(raw - this.zoomGoal) > z.deadband * scale) this.zoomGoal = raw;
    const cam = this.cameras.main;
    const err = this.zoomGoal - cam.zoom;
    if (Math.abs(err) < 1e-4 * scale && Math.abs(this.zoomVel) < 1e-3 * scale) {
      this.zoomVel = 0;
      if (err) cam.setZoom(this.zoomGoal);
      return;
    }
    const w = z.smooth;
    const max = z.maxRate * scale;
    const n = Math.ceil(dt / 0.01); // substeps keep the spring stable on slow frames
    const h = dt / n;
    let zoom = cam.zoom;
    for (let i = 0; i < n; i++) {
      this.zoomVel += (w * w * (this.zoomGoal - zoom) - 2 * w * this.zoomVel) * h;
      this.zoomVel = Phaser.Math.Clamp(this.zoomVel, -max, max);
      zoom += this.zoomVel * h;
    }
    cam.setZoom(zoom);
  }

  // Eased follow of the player, in place of Phaser's startFollow: that one floors the scroll to whole
  // *world* pixels, which at a base zoom of 2 would move the view in 2-screen-pixel jumps. The view
  // centre is snapped to whole *screen* pixels only while the zoom is (almost) an integer, where
  // sprites are rounded too and pixel art has to stay crisp; between integers it is left sub-pixel so
  // nothing jumps against the filtered textures, and the two blend over a small zoom range.
  // Something else moving the camera (respawn, test teleports) is picked up instead of eased towards.
  followCamera(dt) {
    const cam = this.cameras.main;
    const hw = cam.width / 2;
    const hh = cam.height / 2;
    if (Math.abs(cam.scrollX + hw - this.camOutX) > 0.01 || Math.abs(cam.scrollY + hh - this.camOutY) > 0.01) {
      this.camX = cam.scrollX + hw;
      this.camY = cam.scrollY + hh;
    }
    const k = 1 - Math.pow(1 - this.zoomCfg.follow, dt * 60);
    this.camX += (this.player.x - this.camX) * k;
    this.camY += (this.player.y - this.camY) * k;
    const z = cam.zoom;
    const vw = cam.width / z / 2; // half of the visible world, so the view stays inside the map
    const vh = cam.height / z / 2;
    const cx = this.worldW > vw * 2 ? Phaser.Math.Clamp(this.camX, vw, this.worldW - vw) : this.worldW / 2;
    const cy = this.worldH > vh * 2 ? Phaser.Math.Clamp(this.camY, vh, this.worldH - vh) : this.worldH / 2;
    const snap = Phaser.Math.Clamp(1 - Math.abs(z - Math.round(z)) / SNAP_RANGE, 0, 1);
    this.camOutX = cx + (Math.round(cx * z) / z - cx) * snap;
    this.camOutY = cy + (Math.round(cy * z) / z - cy) * snap;
    cam.setScroll(this.camOutX - hw, this.camOutY - hh);
  }

  // Static ground: all tiles drawn once into a single RenderTexture, `res.scale` times as fine as
  // the world (3072x2048 texture at 2x) and displayed at 1/scale, so one texture pixel is one screen pixel.
  renderGrid(map, res) {
    const ts = map.tileSize * res.scale;
    const rt = this.add.renderTexture(0, 0, map.rows[0].length * ts, map.rows.length * ts).setOrigin(0).setScale(res.inv).setDepth(-1);
    rt.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
    rt.beginDraw();
    map.rows.forEach((row, ty) => {
      for (let tx = 0; tx < row.length; tx++) rt.batchDraw(res.scale > 1 ? tileKey(map, tx, ty) : `tile-${map.legend[row[tx]]}`, tx * ts, ty * ts);
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
    this.followCamera(dt);
    this.props.update(dt);
    this.flags.update(dt);
    this.ctx.particles.update(dt);
    this.streamer.update();
  }
}
