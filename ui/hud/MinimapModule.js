import { HudModule } from './HudModule.js';

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
    this.back = this.track(scene.add.rectangle(0, 0, 10, 10, 0x000000, 0.65).setOrigin(0).setVisible(false).setDepth(8.9));
    this.gfx = this.track(scene.add.graphics().setDepth(9.1));
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
      g.fillStyle = tiles[map.legend[map.rows[y][x]]]?.base ?? '#000000';
      g.fillRect(x, y, 1, 1);
    }
    tex.refresh();
    const w = cols * this.s;
    const h = rows * this.s;
    this.x0 = ctx.res.w - 6 - w;
    this.y0 = ctx.res.h - 6 - h;
    this.image.setTexture(this.key).setScale(this.s).setPosition(this.x0, this.y0);
    this.back.setPosition(this.x0 - 2, this.y0 - 2).setSize(w + 4, h + 4);
    this.draw();
  }

  toggle() {
    this.shown = !this.shown;
    this.image.setVisible(this.shown);
    this.back.setVisible(this.shown);
    this.gfx.setVisible(this.shown);
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
    if (goal) gfx.fillStyle(0xffe14d).fillCircle(x0 + goal.x * s, y0 + goal.y * s, 2.5).lineStyle(1, 0x000000).strokeCircle(x0 + goal.x * s, y0 + goal.y * s, 2.5);
    const view = ctx.chase?.cfg?.perception?.viewDistance ?? 0;
    for (const b of ctx.chase?.bullies ?? []) {
      if (!b.active) continue;
      const bx = x0 + (b.x / ts) * s;
      const by = y0 + (b.y / ts) * s;
      if (view) gfx.lineStyle(1, 0xff5a4a, 0.55).strokeCircle(bx, by, (view / ts) * s);
      gfx.fillStyle(0xff5a4a).fillCircle(bx, by, 1.6);
    }
    for (const p of ctx.players) gfx.fillStyle(p.index === 0 ? 0x4dd2ff : 0x9be58f).fillCircle(x0 + (p.x / ts) * s, y0 + (p.y / ts) * s, 2).lineStyle(1, 0xffffff).strokeCircle(x0 + (p.x / ts) * s, y0 + (p.y / ts) * s, 2);
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
