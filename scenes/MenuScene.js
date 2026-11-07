import { ButtonMenu } from '../ui/ButtonMenu.js';
import { settingsRows } from '../ui/settingsRows.js';
import { slotSummary } from '../ui/slotSummary.js';
import { uiText, setupUiCamera, bindRestartNote } from '../ui/uiKit.js';

const NOTE = { fontFamily: 'monospace', fontSize: '8px', color: '#dddddd', align: 'center' };

// Screens: title (Play + toggles) -> slots (three slots, each New game / Continue / Delete) ->
// confirm (overwrite or delete). Esc or Back steps one screen up. Every screen is rebuilt on
// show(), which also re-resolves the text after a language change.
export class MenuScene extends Phaser.Scene {
  constructor() { super('Menu'); }

  create() {
    const app = this.registry.get('app');
    const { t, events, saves } = app;
    setupUiCamera(this, app.res);
    const { w: width, h: height } = app.res;
    const cx = width / 2;
    const title = uiText(this, cx, 52, '', { fontFamily: 'monospace', fontSize: '32px', color: '#ffe14d', stroke: '#000000', strokeThickness: 4 }).setOrigin(0.5);
    const tag = uiText(this, cx, 84, '', { fontFamily: 'monospace', fontSize: '10px', color: '#cccccc' }).setOrigin(0.5);
    const hint = uiText(this, cx, height - 10, '', { fontFamily: 'monospace', fontSize: '8px', color: '#888888' }).setOrigin(0.5);
    const brokenSlots = new Set(); // slots found unreadable this visit; their note stays until you leave
    let menu = null;
    let extras = [];
    let screen = 'title';
    let back = null;

    const clear = () => {
      menu?.destroy();
      extras.forEach(o => o.destroy());
      extras = [];
    };
    const note = (x, y, str, style = NOTE) => { const o = uiText(this, x, y, str, style).setOrigin(0.5); extras.push(o); return o; };

    const play = (action) => { action(); this.scene.start('Game'); };

    const showTitle = () => {
      title.setPosition(cx, 52); tag.setVisible(true);
      back = null;
      menu = new ButtonMenu(this, t, [
        { items: [{ label: () => t('menu.play'), on: () => show('slots') }] },
        ...settingsRows(app)
      ], cx, 130, 28);
    };

    const showSlots = () => {
      title.setPosition(cx, 28); tag.setVisible(false);
      back = () => show('title');
      for (const r of saves.list()) if (r.status === 'corrupt') { saves.load(r.slot); brokenSlots.add(r.slot); }
      const rows = saves.list().map(r => {
        const items = r.status === 'ok' ? [{ label: () => t('menu.slot.continue'), on: () => play(() => saves.load(r.slot)) }] : [];
        items.push({ label: () => t('menu.slot.new'), on: () => (r.status === 'ok' ? show('confirm', { kind: 'new', slot: r.slot }) : play(() => saves.startNew(r.slot))) });
        if (r.status === 'ok') items.push({ label: () => t('menu.slot.delete'), on: () => show('confirm', { kind: 'delete', slot: r.slot }) });
        return { items, row: r };
      });
      rows.push({ items: [{ label: () => t('menu.back'), on: back }] });
      menu = new ButtonMenu(this, t, rows, cx, 90, 40);
      note(cx, 56, t('menu.slots.title'), { ...NOTE, fontSize: '10px', color: '#ffffff' });
      for (const r of rows) {
        if (!r.row) continue;
        const n = r.row.slot;
        note(cx, r.y - 22, t('menu.slot.name', { n }), { ...NOTE, color: '#ffe14d' });
        note(cx, r.y - 13, slotSummary(r.row, t, app.i18n.lang, brokenSlots.has(n) && saves.hasBackup(n)));
      }
    };

    const showConfirm = ({ kind, slot }) => {
      title.setPosition(cx, 28); tag.setVisible(false);
      back = () => show('slots');
      const yes = kind === 'new' ? () => play(() => saves.startNew(slot)) : () => { saves.delete(slot); show('slots'); };
      menu = new ButtonMenu(this, t, [{ items: [
        { label: () => t(`menu.confirm.${kind}Yes`), on: yes },
        { label: () => t(`menu.confirm.${kind}No`), on: back }
      ] }], cx, 150, 28);
      menu.focus(0, 1); // the gentle default is "no"
      note(cx, 110, t(`menu.confirm.${kind}`, { n: slot }), { ...NOTE, fontSize: '10px', color: '#ffffff', wordWrap: { width: width - 60 } });
    };

    const show = (name, arg) => {
      clear();
      screen = [name, arg];
      title.setText(t('menu.title'));
      tag.setText(t('menu.tagline'));
      hint.setText(t('menu.hint'));
      (name === 'slots' ? showSlots : name === 'confirm' ? showConfirm : showTitle)(arg);
    };

    show('title');
    bindRestartNote(this, events, t, app.res);
    const onLang = () => show(...screen);
    const onEsc = () => back?.();
    events.on('lang:changed', onLang);
    this.input.keyboard.on('keydown-ESC', onEsc);
    this.events.once('shutdown', () => {
      events.off('lang:changed', onLang);
      this.input.keyboard.off('keydown-ESC', onEsc);
    });
  }
}
