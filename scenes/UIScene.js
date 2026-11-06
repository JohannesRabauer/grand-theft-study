// Overlay HUD. Reads only; never mutates the world (AD-13).
export class UIScene extends Phaser.Scene {
  constructor() { super('UI'); }

  create(data) {
    this.ctx = data.ctx;
    this.fps = this.add.text(4, 2, '', { fontFamily: 'monospace', fontSize: '8px', color: '#ffff66' });
    this.nextFps = 0;
  }

  update(time) {
    if (time < this.nextFps) return;
    this.nextFps = time + 250;
    this.fps.setText(this.ctx.t('hud.fps', { n: Math.round(this.game.loop.actualFps) }));
  }
}
