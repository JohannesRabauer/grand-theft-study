import { HudModule } from './HudModule.js';
import { uiIcon, uiPanel } from '../uiKit.js';

// The minimap (story 11.2): the tile map of the current world drawn once as one pixel per tile, with the players, the objective and the
// bullies' spotted radius on top. Hidden until a player presses the map key (global intent, P1) and toggled from GameScene through
// ctx.minimap.toggle(); it is only redrawn (every third frame) while it shows. Read-only.
let uids = 0;
const MAX_W = 140;
const MAX_H = 96;

export class MinimapModule extends HudModule {
  constructor(scene, ctx, opts) {
    super(scene, ctx, opts);
    this.shown = false;
    this.frame = 0;
    this.key = null;
    this.made = new Set();
    this.uid = ++uids;
    this.image = this.track(scene.add.image(0, 0, '__DEFAULT').setOrigin(0).setVisible(false).setDepth(9));
    this.back = null; // the panel under the map, made per world (its size follows the map)
    this.gfx = this.track(scene.add.graphics().setDepth(9.1));
    this.goalIcon = this.track(uiIcon(scene, 0, 0, 'star').setDepth(9.2).setVisible(false));
    ctx.minimap = this;
    this.on('world:enter', () => this.build());
    this.build();
  }

  // The map as a canvas texture, one per world, built the first time it is needed.
  build() {
    const { ctx, scene } = this;
    const map = ctx.map;
    const cols = map.rows[0].length;
    const rows = map.rows.length;
    this.cols = cols;
    this.rows = rows;
    this.s = Math.min(MAX_W / cols, MAX_H / rows);
    for (const k of this.made) if (scene.textures.exists(k)) scene.textures.remove(k); // one texture per module, rebuilt when the world changes
    this.made.clear();
    this.key = `minimap-${this.uid}-${ctx.world.id}`;
    const tex = scene.textures.createCanvas(this.key, cols, rows);
    this.made.add(this.key);
    const g = tex.getContext();
    const tiles = scene.cache.json.get('tiles');
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      g.fillStyle = tiles[map.legend[map.rows[y][x]]]?.base ?? '#16161e';
      g.fillRect(x, y, 1, 1);
    }
    tex.refresh();
    const w = cols * this.s;
    const h = rows * this.s;
    this.x0 = ctx.res.w - 6 - w;
    this.y0 = ctx.res.h - 6 - h;
    this.image.setTexture(this.key).setScale(this.s).setPosition(this.x0, this.y0);
    this.back?.destroy();
    this.floor?.destroy();
    this.objects = this.objects.filter(o => o !== this.back && o !== this.floor);
    // an opaque dark floor under the whole map and its frame, so the minimap reads on any world behind it
    this.floor = this.track(scene.add.rectangle(Math.round(this.x0) - 4, Math.round(this.y0) - 4, Math.ceil(w) + 8, Math.ceil(h) + 8, 0x16161e, 1).setOrigin(0).setDepth(8.8).setVisible(this.shown));
    this.back = this.track(uiPanel(this.scene, Math.round(this.x0) - 4, Math.round(this.y0) - 4, Math.ceil(w) + 8, Math.ceil(h) + 8, { depth: 8.9 }).setVisible(this.shown));
    this.draw();
  }

  toggle() {
    this.shown = !this.shown;
    this.image.setVisible(this.shown);
    this.back.setVisible(this.shown);
    this.floor.setVisible(this.shown);
    this.gfx.setVisible(this.shown);
    if (!this.shown) this.goalIcon.setVisible(false);
    this.ctx.events.emit('minimap:toggled', { on: this.shown });
    if (this.shown) this.draw();
  }

  // Where the objective arrow points, in tiles, or null.
  objective() {
    const { ctx } = this;
    const quest = ctx.quests?.objective() ?? ctx.dayFlow?.objective() ?? null;
    if (quest && quest.map === ctx.world.id) return { x: quest.x + 0.5, y: quest.y + 0.5 };
    const goal = ctx.map.objects.find(o => o.type === 'goal');
    return goal ? { x: goal.x + goal.w / 2, y: goal.y + goal.h / 2 } : null;
  }

  draw() {
    const { ctx, gfx, s, x0, y0 } = this;
    const ts = ctx.map.tileSize;
    gfx.clear();
    const goal = this.objective();
    this.goalIcon.setVisible(!!goal && this.shown);
    if (goal) this.goalIcon.setPosition(Math.round(x0 + goal.x * s - 4), Math.round(y0 + goal.y * s - 4));
    const lr = ctx.chase?.cfg?.lookout?.radius ?? 0;
    for (const o of ctx.map.objects) if (lr && o.type === 'lookout') gfx.lineStyle(1, 0xff9a3a, 0.5).strokeCircle(x0 + (o.x + 0.5) * s, y0 + (o.y + 0.5) * s, (lr / ts) * s);
    const view = ctx.chase?.cfg?.perception?.viewDistance ?? 0;
    for (const b of ctx.chase?.bullies ?? []) {
      if (!b.active) continue;
      const bx = x0 + (b.x / ts) * s;
      const by = y0 + (b.y / ts) * s;
      if (view) gfx.lineStyle(1, 0xff5a4a, 0.55).strokeCircle(bx, by, (view / ts) * s);
      this.dot(0xff5a4a, bx, by);
    }
    for (const p of ctx.players) this.dot(p.index === 0 ? 0x4dd2ff : 0x9be58f, x0 + (p.x / ts) * s, y0 + (p.y / ts) * s, 2);
  }

  // A marker: a square of whole pixels with an outline.
  dot(color, x, y, r = 1) {
    const px = Math.round(x);
    const py = Math.round(y);
    this.gfx.fillStyle(0x16161e).fillRect(px - r - 1, py - r - 1, 2 * r + 3, 2 * r + 3).fillStyle(color).fillRect(px - r, py - r, 2 * r + 1, 2 * r + 1);
  }

  update() {
    if (!this.shown || ++this.frame % 3) return;
    this.draw();
  }

  destroy() {
    if (this.ctx.minimap === this) this.ctx.minimap = null;
    super.destroy();
    for (const k of this.made) if (this.scene.textures.exists(k)) this.scene.textures.remove(k); // a canvas texture belongs to the game, not the scene
  }
}
