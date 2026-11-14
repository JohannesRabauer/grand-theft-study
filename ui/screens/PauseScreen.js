import { ButtonMenu } from '../ButtonMenu.js';
import { settingsRows } from '../settingsRows.js';
import { uiLabel, uiLeave, uiScreenFrame } from '../uiKit.js';
import { modeSummary } from '../menuFlow.js';

// The pause overlay: Resume, the pages (help, album, achievements, Lernbuch, parents), language, quality and back to the menu. Esc / the touch
// pause button close it. The buttons are the kit's pixel buttons in a few rows; arrows move the focus, which wears the 2 px ring.
export class PauseScreen {
  constructor(scene, ctx, stack) {
    this.id = 'pause';
    this.scene = scene;
    this.ctx = ctx;
    this.stack = stack;
  }

  create() {
    const { scene, ctx } = this;
    const { w: width } = ctx.res;
    const frame = uiScreenFrame(scene, ctx, { x: 60, y: 8, w: width - 120, h: 254, dimAlpha: 0.72, depth: 20 });
    this.title = uiLabel(scene, width / 2, 28, ctx.t('pause.title'), 'heading', 'ink', { size: 20 }).setOrigin(0.5).setDepth(21);
    this.slot = uiLabel(scene, width / 2, 48, '', 'small').setOrigin(0.5).setDepth(21);
    this.mode = uiLabel(scene, width / 2, 59, '', 'small', 'ink', { color: 'gold' }).setOrigin(0.5).setDepth(21);
    this.belts = uiLabel(scene, width / 2, 70, '', 'small', 'ink', { color: 'green', align: 'center', wordWrap: { width: width - 140 } }).setOrigin(0.5).setDepth(21);
    this.objects = [frame.dim, frame.panel, this.title, this.slot, this.mode, this.belts];
    const rows = [
      { items: [{ label: () => ctx.t('pause.resume'), on: () => this.close() }] },
      { items: [
        { label: () => ctx.t('pause.help'), on: () => ctx.openHelp?.() },
        { label: () => ctx.t('pause.album'), on: () => ctx.openAlbum?.() },
        { label: () => ctx.t('pause.achievements'), on: () => ctx.openAchievements?.() }
      ] },
      { items: [
        { label: () => ctx.t('pause.lernbuch'), on: () => ctx.openLernbuch?.() },
        { label: () => ctx.t('pause.parent'), on: () => ctx.openParent?.() }
      ] },
      ...settingsRows(ctx, { effects: true }),
      { items: [
        ...(ctx.minigames?.active ? [{ label: () => ctx.t('minigame.quit'), on: () => ctx.minigames.quit() }] : []),
        { label: () => ctx.t('pause.menu'), on: () => ctx.events.emit('game:quit') }
      ] }
    ];
    this.menu = new ButtonMenu(scene, ctx.t, rows, width / 2, 98, 24);
    this.menu.objects.forEach(o => o.setDepth(21));
    this.objects.push(...this.menu.objects);
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
    this.menu.release();
    uiLeave(this.scene, this.ctx, this.objects);
  }
}
