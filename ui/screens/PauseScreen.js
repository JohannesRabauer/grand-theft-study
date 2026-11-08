import { ButtonMenu } from '../ButtonMenu.js';
import { settingsRows } from '../settingsRows.js';
import { uiText } from '../uiKit.js';
import { modeSummary } from '../menuFlow.js';

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
    this.title = uiText(scene, width / 2, 54, ctx.t('pause.title'), { fontFamily: 'monospace', fontSize: '20px', color: '#ffe14d', stroke: '#000000', strokeThickness: 3 }).setOrigin(0.5).setDepth(21);
    this.slot = uiText(scene, width / 2, 72, '', { fontFamily: 'monospace', fontSize: '10px', color: '#cccccc' }).setOrigin(0.5).setDepth(21);
    this.mode = uiText(scene, width / 2, 83, '', { fontFamily: 'monospace', fontSize: '10px', color: '#ffe14d' }).setOrigin(0.5).setDepth(21);
    this.belts = uiText(scene, width / 2, 94, '', { fontFamily: 'monospace', fontSize: '10px', color: '#9be58f' }).setOrigin(0.5).setDepth(21);
    this.objects = [dim, this.title, this.slot, this.mode, this.belts];
    const rows = [
      { items: [{ label: () => ctx.t('pause.resume'), on: () => this.close() }] },
      { items: [{ label: () => ctx.t('pause.help'), on: () => ctx.openHelp?.() }] },
      { items: [{ label: () => ctx.t('pause.album'), on: () => ctx.openAlbum?.() }] },
      { items: [{ label: () => ctx.t('pause.achievements'), on: () => ctx.openAchievements?.() }] },
      { items: [{ label: () => ctx.t('pause.lernbuch'), on: () => ctx.openLernbuch?.() }] },
      { items: [{ label: () => ctx.t('pause.parent'), on: () => ctx.openParent?.() }] },
      ...settingsRows(ctx),
      ...(ctx.minigames?.active ? [{ items: [{ label: () => ctx.t('minigame.quit'), on: () => ctx.minigames.quit() }] }] : []),
      { items: [{ label: () => ctx.t('pause.menu'), on: () => ctx.events.emit('game:quit') }] }
    ];
    this.menu = new ButtonMenu(scene, ctx.t, rows, width / 2, 110, 28);
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
    this.mode.setText(modeSummary(ctx.players.map(p => p.character?.name ?? ctx.t('menu.slot.player', { n: p.index + 1 })), ctx.t));
    const who = p => p.character?.name ?? ctx.t('menu.slot.player', { n: p.index + 1 });
    this.belts.setText(ctx.t('pause.belts', { list: ctx.players.map(p => `${who(p)}: ${ctx.t(`karate.belt.${ctx.karate.beltOf(p)}`)}`).join(' · ') }));
    this.menu.refresh();
  }

  destroy() {
    this.menu.destroy();
    for (const o of this.objects) o.destroy();
  }
}
