import { createT } from '../i18n/i18n.js';

export class MenuScene extends Phaser.Scene {
  constructor() { super('Menu'); }

  create() {
    const t = createT(this.cache.json.get('i18n'));
    const { width, height } = this.scale;
    this.add.text(width / 2, height / 2 - 20, t('menu.title'), { fontFamily: 'monospace', fontSize: '32px', color: '#ffffff' }).setOrigin(0.5);
    this.add.text(width / 2, height / 2 + 20, t('menu.start'), { fontFamily: 'monospace', fontSize: '12px', color: '#cccccc' }).setOrigin(0.5);
    const start = () => this.scene.start('Game');
    this.input.keyboard.once('keydown', start);
    this.input.once('pointerdown', start);
  }
}
