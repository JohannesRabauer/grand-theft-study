import { ButtonMenu } from '../ButtonMenu.js';
import { settingsRows } from '../settingsRows.js';
import { uiText } from '../uiKit.js';

// The pause overlay: Resume, language, quality and back to the menu. Esc / the touch pause button close it.
export class PauseScreen {
  constructor(scene, ctx, stack) {
    this.id = 'pause';
    this.scene = scene;
    this.ctx = ctx;
    this.stack = stack;
  }

  create() {
    const { scene, ctx } = this;
    const { w: width, h: height } = ctx.res;
    const dim = scene.add.rectangle(0, 0, width, height, 0x000000, 0.7).setOrigin(0).setDepth(20).setInteractive(); // swallows clicks
    this.title = uiText(scene, width / 2, 60, ctx.t('pause.title'), { fontFamily: 'monospace', fontSize: '20px', color: '#ffe14d', stroke: '#000000', strokeThickness: 3 }).setOrigin(0.5).setDepth(21);
    this.slot = uiText(scene, width / 2, 80, '', { fontFamily: 'monospace', fontSize: '10px', color: '#cccccc' }).setOrigin(0.5).setDepth(21);
    this.objects = [dim, this.title, this.slot];
    const rows = [
      { items: [{ label: () => ctx.t('pause.resume'), on: () => this.close() }] },
      ...settingsRows(ctx),
      { items: [{ label: () => ctx.t('pause.menu'), on: () => ctx.events.emit('game:quit') }] }
    ];
    this.menu = new ButtonMenu(scene, ctx.t, rows, width / 2, 100, 28);
    this.menu.objects.forEach(o => o.setDepth(21));
    this.retext();
  }

  close() {
    if (this.stack.top() === this) this.stack.pop();
  }

  handleIntent(intent) {
    if (intent.pause) this.close();
  }

  retext() {
    const { ctx } = this;
    this.title.setText(ctx.t('pause.title'));
    const slot = ctx.saves.activeSlot;
    this.slot.setText(slot ? ctx.t('pause.slot', { n: slot }) : '');
    this.menu.refresh();
  }

  destroy() {
    this.menu.destroy();
    for (const o of this.objects) o.destroy();
  }
}
