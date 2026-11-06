import { Pools } from '../entities/pools.js';
import { Surfaces } from '../physics/surfaces.js';
import { addStaticWall } from '../physics/bodies.js';
import { Input } from '../ui/input.js';
import { Bikes } from '../entities/Bike.js';
import { Player } from '../entities/Player.js';
import { Zones } from '../entities/Zones.js';

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
    this.buildWalls(map);

    // map objects are in tile coordinates
    const spawn = map.objects.find(o => o.type === 'spawn' && o.id === 'player');
    this.player = new Player(this, ctx, (spawn.x + 0.5) * ts, (spawn.y + 0.5) * ts, cache.get('vehicles'), 'foot');
    ctx.player = this.player;
    this.bikes = new Bikes(this, ctx);
    this.zones = new Zones(this, ctx);
    this.zoomCfg = cache.get('camera');

    const worldW = map.rows[0].length * ts;
    const worldH = map.rows.length * ts;
    this.cameras.main.setBounds(0, 0, worldW, worldH);
    this.cameras.main.startFollow(this.player.sprite, true, 0.15, 0.15);

    // UIScene asks for pause / quit through events; the world is only changed here.
    this.paused = false;
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
    map.rows.forEach((row, ty) => {
      let start = -1;
      for (let tx = 0; tx <= row.length; tx++) {
        const wall = tx < row.length && this.ctx.surfaces.solid(map.legend[row[tx]]);
        if (wall && start < 0) start = tx;
        if (!wall && start >= 0) {
          addStaticWall(this, ((start + tx) / 2) * ts, (ty + 0.5) * ts, (tx - start) * ts, ts);
          start = -1;
        }
      }
    });
  }

  setPaused(on) {
    this.paused = on;
    if (on) this.matter.world.pause(); else this.matter.world.resume();
  }

  update(time, delta) {
    const dt = Math.min(delta, 50) / 1000;
    this.ctx.input.update();
    if (this.ctx.input.intent.pause) this.ctx.events.emit('ui:pause-toggle');
    if (this.paused) return;
    this.player.update(dt);
    this.bikes.update(dt);
    this.zones.update();
    this.updateZoom(dt);
  }
}
