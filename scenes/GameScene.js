import { createT } from '../i18n/i18n.js';
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
    const events = new Phaser.Events.EventEmitter();
    const ctx = {
      events,
      t: createT(cache.get('i18n')),
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

    this.scene.launch('UI', { ctx });
    this.events.once('shutdown', () => this.scene.stop('UI'));
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

  update(time, delta) {
    const dt = Math.min(delta, 50) / 1000;
    this.ctx.input.update();
    this.player.update(dt);
    this.bikes.update(dt);
    this.zones.update();
    this.updateZoom(dt);
  }
}
