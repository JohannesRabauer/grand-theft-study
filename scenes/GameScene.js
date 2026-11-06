import { createT } from '../i18n/i18n.js';
import { Surfaces } from '../physics/surfaces.js';
import { addStaticRect } from '../physics/bodies.js';
import { Input } from '../ui/input.js';
import { Player } from '../entities/Player.js';

export class GameScene extends Phaser.Scene {
  constructor() { super('Game'); }

  create() {
    const cache = this.cache.json;
    const map = cache.get('town');
    const ts = map.tileSize;

    // AD-2: one ctx, created once, handed to every system.
    const ctx = {
      events: new Phaser.Events.EventEmitter(),
      t: createT(cache.get('i18n')),
      map,
      surfaces: new Surfaces(map, cache.get('surfaces')),
      input: new Input(this)
    };
    this.ctx = ctx;

    this.renderGrid(map);
    this.buildWalls(map);

    // map objects are in tile coordinates
    const spawn = map.objects.find(o => o.type === 'spawn' && o.id === 'player');
    this.player = new Player(this, ctx, (spawn.x + 0.5) * ts, (spawn.y + 0.5) * ts, cache.get('vehicles').foot);

    const worldW = map.rows[0].length * ts;
    const worldH = map.rows.length * ts;
    this.cameras.main.setBounds(0, 0, worldW, worldH);
    this.cameras.main.startFollow(this.player.sprite, true, 0.15, 0.15);

    this.scene.launch('UI', { ctx });
    this.events.once('shutdown', () => this.scene.stop('UI'));
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
        const wall = tx < row.length && map.legend[row[tx]] === 'wall';
        if (wall && start < 0) start = tx;
        if (!wall && start >= 0) {
          addStaticRect(this, ((start + tx) / 2) * ts, (ty + 0.5) * ts, (tx - start) * ts, ts);
          start = -1;
        }
      }
    });
  }

  update(time, delta) {
    const dt = Math.min(delta, 50) / 1000;
    this.ctx.input.update();
    this.player.update(dt);
  }
}
