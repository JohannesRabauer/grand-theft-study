// The comic "caught" frame (CAP-7), drawn procedurally in UIScene space (480x270): halftone panel,
// a locker with the player stuffed inside, the bully with the snatched lunchbox and a speech bubble.
// One frame per player (created by CaughtModule on the first catch of that player, `index`). With one player it fills the screen;
// with two it is scaled down (data/chase.json caught.coopScale) and sits on the caught player's HUD side (P1 left half, P2 right
// half), so the other player keeps a clear view of the game they are still playing. Shows that player's own kid. Read-only:
// the world logic is entities/Caught.js.
import { uiText } from './uiKit.js';

const W = 480;
const H = 270;
const PX = 20;
const PY = 16;
const PW = 440;
const PH = 238;
const DEPTH = 15; // above the HUD, below the pause menu

export class CaughtFrame {
  constructor(scene, ctx, index = 0) {
    this.scene = scene;
    this.ctx = ctx;
    this.index = index;
    this.items = [];
    this.box = null; // container holding the items: scaled and placed per layout
    this.built = false;
  }

  destroy() {
    for (const o of this.items) o.destroy();
    this.items.length = 0;
    this.box?.destroy();
  }

  // Created on first use, then reused (only texts change between showings).
  build() {
    const { scene, ctx } = this;
    this.built = true;
    this.makeHalftone();
    this.box = scene.add.container(0, 0).setDepth(DEPTH);
    const add = (o) => { o.setVisible(false); this.box.add(o); this.items.push(o); return o; };
    const text = (x, y, size, color, stroke, origin = 0.5) => add(uiText(scene, x, y, '', {
      fontFamily: 'monospace', fontSize: `${size}px`, fontStyle: 'bold', color, stroke: '#000000', strokeThickness: stroke, align: 'center'
    }).setOrigin(origin));

    add(scene.add.rectangle(0, 0, W, H, 0x20204a).setOrigin(0).setInteractive()); // swallows clicks
    add(scene.add.rectangle(PX + 3, PY + 3, PW, PH, 0x000000).setOrigin(0)); // panel shadow
    add(scene.add.image(PX, PY, 'caught-halftone').setOrigin(0).setScale(ctx.res.inv));
    const g = add(scene.add.graphics());
    g.lineStyle(4, 0x000000).strokeRect(PX, PY, PW, PH);

    // locker: body, vents, dark inside, swung-open door
    g.fillStyle(0x5b7fa6).fillRect(52, 68, 84, 172).lineStyle(3, 0x000000).strokeRect(52, 68, 84, 172);
    g.lineStyle(2, 0x2b3f58);
    for (let i = 0; i < 4; i++) g.lineBetween(62, 78 + i * 5, 126, 78 + i * 5);
    g.fillStyle(0x1d2a3a).fillRect(62, 104, 64, 126);
    const big = 6 * ctx.res.inv; // the 2x textures are shown at half scale
    this.kid = add(scene.add.image(94, 178, this.sharpCopy('player')).setScale(big).setAngle(10));
    g.fillStyle(0x7aa0cc).lineStyle(3, 0x000000).fillPoints([{ x: 62, y: 104 }, { x: 36, y: 114 }, { x: 36, y: 222 }, { x: 62, y: 230 }], true).strokePoints([{ x: 62, y: 104 }, { x: 36, y: 114 }, { x: 36, y: 222 }, { x: 62, y: 230 }], true);
    g.lineStyle(2, 0x2b3f58).lineBetween(40, 140, 58, 134).lineBetween(40, 160, 58, 155);
    g.fillStyle(0xffe14d).fillCircle(42, 190, 3);

    // bully with the lunchbox, and the speech bubble pointing at him
    add(scene.add.image(352, 188, this.sharpCopy('bully')).setScale(big).setFlipX(true));
    g.fillStyle(0xb06a2c).lineStyle(3, 0x000000).fillRect(262, 176, 34, 24).strokeRect(262, 176, 34, 24);
    g.fillStyle(0xffe14d).fillRect(276, 184, 6, 5).lineStyle(3, 0x000000).strokeRect(272, 168, 14, 8);
    g.lineStyle(2, 0x000000).lineBetween(250, 182, 258, 184).lineBetween(248, 192, 258, 192).lineBetween(250, 202, 258, 200);
    g.fillStyle(0xffffff).lineStyle(3, 0x000000);
    g.fillRoundedRect(172, 62, 276, 58, 10).strokeRoundedRect(172, 62, 276, 58, 10);
    g.fillTriangle(330, 118, 346, 118, 344, 138).lineBetween(330, 119, 344, 138).lineBetween(346, 119, 344, 138);
    g.fillStyle(0xffffff).fillRect(332, 116, 13, 4);
    this.line = text(310, 91, 11, '#111111', 0);
    this.line.setWordWrapWidth(256);

    add(scene.add.star(112, 62, 10, 14, 30, 0xffe14d).setStrokeStyle(3, 0x000000).setAngle(-8));
    this.sfx = text(112, 62, 9, '#e0302a', 2).setAngle(-8);
    this.title = text(W / 2, 36, 22, '#ffe14d', 5).setAngle(-2);
    this.lost = text(W / 2, 240, 9, '#ffffff', 3);
    this.prompt = text(W / 2, 262, 8, '#ffffff', 2);
    scene.tweens.add({ targets: this.prompt, alpha: 0.35, duration: 450, yoyo: true, repeat: -1 });
  }

  // World textures are bilinear filtered (BootScene); the enlarged comic figures keep hard pixels.
  sharpCopy(key) {
    const name = `caught-${key}`;
    const { textures } = this.scene;
    if (!textures.exists(name)) {
      const src = textures.get(key).getSourceImage();
      const tex = textures.createCanvas(name, src.width, src.height);
      tex.getContext().drawImage(src, 0, 0);
      tex.refresh();
    }
    return name;
  }

  // Halftone dots (bigger towards the edges) on a warm background, baked once into a texture.
  makeHalftone() {
    if (this.scene.textures.exists('caught-halftone')) return; // baked by an earlier run
    const k = this.ctx.res.scale; // drawn on the render grid so the dots stay round and sharp
    const tex = this.scene.textures.createCanvas('caught-halftone', PW * k, PH * k);
    const c = tex.getContext();
    c.scale(k, k);
    c.fillStyle = '#ffd23f';
    c.fillRect(0, 0, PW, PH);
    c.fillStyle = '#f08a24';
    for (let y = 0, row = 0; y < PH + 8; y += 7, row++) {
      for (let x = (row % 2) * 4; x < PW + 8; x += 8) {
        const d = Math.hypot(x - PW / 2, y - PH / 2) / Math.hypot(PW / 2, PH / 2);
        c.beginPath();
        c.arc(x, y, 0.6 + d * 2.4, 0, Math.PI * 2);
        c.fill();
      }
    }
    tex.refresh();
  }

  show({ lost, player }) {
    if (!this.built) this.build();
    const { ctx } = this;
    const v = (x) => ctx.i18n.lang === 'de' ? x.toFixed(2).replace('.', ',') : x.toFixed(2);
    this.title.setText(ctx.t('caught.title'));
    this.sfx.setText(ctx.t('caught.sfx'));
    this.line.setText(ctx.t(`caught.line${Phaser.Math.Between(1, 3)}`));
    this.lost.setText(lost > 0 ? ctx.t('caught.lost', { v: `${v(lost)} €` }) : ctx.t('caught.nothing'));
    this.prompt.setText(ctx.t(`caught.continue.${ctx.input.type}`));
    this.kid.setTexture(this.sharpCopy(ctx.players[player]?.look?.walk ?? 'player')); // the caught kid's own look
    const coop = ctx.players.length > 1;
    const k = coop ? ctx.chase.cfg.caught.coopScale : 1;
    this.box.setScale(k).setPosition(coop ? (this.index ? W / 2 : 0) + (W / 2 - W * k) / 2 : 0, coop ? (H - H * k) / 2 : 0);
    for (const o of this.items) o.setVisible(true);
  }

  hide() {
    for (const o of this.items) o.setVisible(false);
  }
}
