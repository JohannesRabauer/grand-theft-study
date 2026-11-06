import { ButtonMenu } from '../ui/ButtonMenu.js';
import { settingsRows } from '../ui/settingsRows.js';

export class MenuScene extends Phaser.Scene {
  constructor() { super('Menu'); }

  create() {
    const app = this.registry.get('app');
    const { t, events } = app;
    const { width, height } = this.scale;
    const title = this.add.text(width / 2, 52, '', { fontFamily: 'monospace', fontSize: '32px', color: '#ffe14d', stroke: '#000000', strokeThickness: 4 }).setOrigin(0.5);
    const tag = this.add.text(width / 2, 84, '', { fontFamily: 'monospace', fontSize: '10px', color: '#cccccc' }).setOrigin(0.5);
    const hint = this.add.text(width / 2, height - 10, '', { fontFamily: 'monospace', fontSize: '8px', color: '#888888' }).setOrigin(0.5);
    const rows = [
      { items: [{ label: () => t('menu.start'), on: () => this.scene.start('Game') }] },
      ...settingsRows(app)
    ];
    const menu = new ButtonMenu(this, t, rows, width / 2, 130, 28);
    const texts = () => {
      title.setText(t('menu.title'));
      tag.setText(t('menu.tagline'));
      hint.setText(t('menu.hint'));
      menu.refresh();
    };
    texts();
    events.on('lang:changed', texts);
    this.events.once('shutdown', () => events.off('lang:changed', texts));
  }
}
