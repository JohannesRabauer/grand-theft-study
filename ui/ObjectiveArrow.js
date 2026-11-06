// GTA-style objective arrow: orbits the player on screen and points at the school goal, with the
// distance in meters. Drawn in UIScene space (480x270); reads the game camera, never the world state mutably.
export class ObjectiveArrow {
  constructor(scene, ctx, game) {
    this.ctx = ctx;
    this.cam = game.cameras.main;
    this.ts = ctx.map.tileSize;
    this.mpt = ctx.map.metersPerTile;
    const goal = ctx.map.objects.find(o => o.type === 'goal');
    this.gx = (goal.x + goal.w / 2) * this.ts;
    this.gy = (goal.y + goal.h / 2) * this.ts;
    this.arrow = scene.add.image(0, 0, 'arrow').setDepth(10);
    this.text = scene.add.text(0, 0, '', { fontFamily: 'monospace', fontSize: '8px', color: '#ffe14d', stroke: '#000000', strokeThickness: 2 })
      .setOrigin(0.5).setDepth(10);
    this.lastMeters = -1;
    this.done = false;
    const sw = scene.scale.width;
    this.msg = scene.add.text(sw / 2, 60, ctx.t('msg.arrived'), { fontFamily: 'monospace', fontSize: '14px', color: '#ffffff', stroke: '#000000', strokeThickness: 3 })
      .setOrigin(0.5).setDepth(10).setVisible(false);
    this.onReached = () => {
      this.done = true;
      this.arrow.setVisible(false);
      this.text.setVisible(false);
      this.msg.setVisible(true);
      scene.time.delayedCall(4000, () => this.msg.setVisible(false));
    };
    ctx.events.on('goal:reached', this.onReached);
    scene.events.once('shutdown', () => ctx.events.off('goal:reached', this.onReached));
  }

  update() {
    if (this.done) return;
    const { player } = this.ctx;
    const cam = this.cam;
    const wv = cam.worldView;
    const sx = (player.x - wv.x) * cam.zoom;
    const sy = (player.y - wv.y) * cam.zoom;
    const dx = this.gx - player.x;
    const dy = this.gy - player.y;
    const dist = Math.hypot(dx, dy);
    const nx = dx / dist;
    const ny = dy / dist;
    const r = 30;
    this.arrow.setPosition(sx + nx * r, sy + ny * r).setRotation(Math.atan2(dy, dx));
    this.text.setPosition(Phaser.Math.Clamp(sx + nx * (r + 12), 36, 444), Phaser.Math.Clamp(sy + ny * (r + 12), 8, 262));
    const m = Math.round((dist / this.ts) * this.mpt / 5) * 5; // 5 m steps, so the text rarely changes
    if (m !== this.lastMeters) {
      this.lastMeters = m;
      this.text.setText(this.ctx.t('hud.goal', { m }));
    }
  }

  retext() {
    this.msg.setText(this.ctx.t('msg.arrived'));
    this.lastMeters = -1; // next update re-resolves the distance text
  }
}
