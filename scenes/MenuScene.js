import { ButtonMenu } from '../ui/ButtonMenu.js';
import { settingsRows } from '../ui/settingsRows.js';
import { CharacterSelect } from '../ui/CharacterSelect.js';
import { slotSummary } from '../ui/slotSummary.js';
import { NewGameFlow, coopAvailable, padJoinHint, startActions } from '../ui/menuFlow.js';
import { PadNav } from '../ui/PadNav.js';
import { uiLabel, uiPanel, setupUiCamera, bindRestartNote } from '../ui/uiKit.js';
import { drawBackdrop } from '../ui/menuBackdrop.js';

const NOTE = { align: 'center', color: 'text' };

// Screens: title (Play + toggles) -> slots (three slots, each New game / Continue / Delete) ->
// confirm (overwrite or delete); New game continues to the mode screen (solo or co-op), then to the character select
// (once per player in co-op), whose last pick starts the game (ui/menuFlow.js holds that flow). Esc or Back steps one
// screen up. Every screen is rebuilt on show(), which also re-resolves the text after a language change.
export class MenuScene extends Phaser.Scene {
  constructor() { super('Menu'); }

  create() {
    const app = this.registry.get('app');
    const { t, events, saves } = app;
    setupUiCamera(this, app.res);
    const { w: width, h: height } = app.res;
    const cx = width / 2;
    drawBackdrop(this, app.res);
    const title = uiLabel(this, cx, 52, '', 'title', 'ink', { size: 32, stroke: '#16161e', strokeThickness: 4, shadow: false }).setOrigin(0.5);
    const tag = uiLabel(this, cx, 84, '', 'sub', 'ink', { color: 'text' }).setOrigin(0.5);
    const hint = uiLabel(this, cx, height - 10, '', 'small', 'ink', { color: 'text' }).setOrigin(0.5);
    const brokenSlots = new Set(); // slots found unreadable this visit; their note stays until you leave
    let menu = null;
    let extras = [];
    let screen = 'title';
    let back = null;
    let flow = null; // the new-game flow of the open slot
    let joinPad = null; // the mode screen's A-to-join listener

    const clear = () => {
      menu?.destroy();
      joinPad?.destroy();
      joinPad = null;
      extras.forEach(o => o.destroy());
      extras = [];
    };
    const note = (x, y, str, over = NOTE) => { const o = uiLabel(this, x, y, str, 'small', 'ink', { ...NOTE, ...over }).setOrigin(0.5); extras.push(o); return o; };
    // the panel behind a screen's buttons and lines (below the default depth 0, above the backdrop)
    const backing = (x, y, w, h, accent = true) => extras.push(uiPanel(this, x, y, w, h, { accent, depth: -5 }));

    const play = (action) => { action(); this.scene.start('Game'); };
    // a new game in `slot` with the chosen mode and characters (saved at once, so Continue brings the same kids back)
    const startNew = (slot, result) => play(() => {
      saves.startNew(slot);
      for (const { action, payload } of startActions(result)) app.state.dispatch(action, payload);
      saves.save(slot);
    });
    const padCount = () => this.input.gamepad?.gamepads.filter(Boolean).length ?? 0;
    const newGame = (slot) => {
      flow = new NewGameFlow(app.characters.characters.map(c => c.id), {
        coopAllowed: coopAvailable({ coarse: window.matchMedia('(pointer: coarse)').matches, pads: padCount() })
      });
      show('mode', { slot });
    };
    const chooseMode = (slot, mode) => { if (flow.chooseMode(mode)) show('character', { slot }); };
    const pickCharacter = (slot, id) => {
      if (!flow.pick(id)) return;
      if (flow.result) startNew(slot, flow.result);
      else show('character', { slot });
    };
    const stepBack = (slot) => {
      const to = flow.back();
      show(to === 'exit' ? 'slots' : to === 'mode' ? 'mode' : 'character', { slot });
    };

    const showTitle = () => {
      title.setPosition(cx, 52); tag.setVisible(true);
      back = null;
      backing(cx - 140, 22, 280, 80);
      backing(cx - 130, 112, 260, 100);
      menu = new ButtonMenu(this, t, [
        { items: [{ label: () => t('menu.play'), on: () => show('slots') }] },
        ...settingsRows(app)
      ], cx, 130, 28);
    };

    const showSlots = () => {
      title.setPosition(cx, 28); tag.setVisible(false);
      back = () => show('title');
      backing(24, 10, width - 48, height - 36);
      for (const r of saves.list()) if (r.status === 'corrupt') { saves.load(r.slot); brokenSlots.add(r.slot); }
      const rows = saves.list().map(r => {
        const items = r.status === 'ok' ? [{ label: () => t('menu.slot.continue'), on: () => play(() => saves.load(r.slot)) }] : [];
        items.push({ label: () => t('menu.slot.new'), on: () => (r.status === 'ok' ? show('confirm', { kind: 'new', slot: r.slot }) : newGame(r.slot)) });
        if (r.status === 'ok') items.push({ label: () => t('menu.slot.delete'), on: () => show('confirm', { kind: 'delete', slot: r.slot }) });
        return { items, row: r };
      });
      rows.push({ items: [{ label: () => t('menu.back'), on: back }] });
      menu = new ButtonMenu(this, t, rows, cx, 90, 40);
      note(cx, 56, t('menu.slots.title'), { size: 10 });
      for (const r of rows) {
        if (!r.row) continue;
        const n = r.row.slot;
        note(cx, r.y - 27, t('menu.slot.name', { n }), { color: 'gold' });
        note(cx, r.y - 18, slotSummary(r.row, t, app.i18n.lang, brokenSlots.has(n) && saves.hasBackup(n)));
      }
    };

    const showConfirm = ({ kind, slot }) => {
      title.setPosition(cx, 28); tag.setVisible(false);
      back = () => show('slots');
      backing(40, 10, width - 80, 210);
      const yes = kind === 'new' ? () => newGame(slot) : () => { saves.delete(slot); show('slots'); };
      menu = new ButtonMenu(this, t, [{ items: [
        { label: () => t(`menu.confirm.${kind}Yes`), on: yes },
        { label: () => t(`menu.confirm.${kind}No`), on: back }
      ] }], cx, 150, 28);
      menu.focus(0, 1); // the gentle default is "no"
      note(cx, 110, t(`menu.confirm.${kind}`, { n: slot }), { size: 10, wordWrap: { width: width - 60 } });
    };

    const showMode = ({ slot }) => {
      title.setPosition(cx, 28); tag.setVisible(false);
      back = () => stepBack(slot);
      backing(40, 10, width - 80, 200);
      const items = [{ label: () => t('menu.mode.solo'), on: () => chooseMode(slot, 'solo') }];
      if (flow.coopAllowed) items.push({ label: () => t('menu.mode.coop'), on: () => chooseMode(slot, 'coop') });
      items.push({ label: () => t('menu.back'), on: back });
      menu = new ButtonMenu(this, t, [{ items }], cx, 120, 28);
      note(cx, 70, t('menu.mode.title'), { size: 10 });
      if (flow.coopAllowed) {
        note(cx, 160, t('menu.mode.controls'), { color: 'gold' });
        if (padJoinHint({ pads: padCount(), coopAllowed: true })) {
          note(cx, 176, t('menu.mode.padJoin'), { color: 'green' });
          // A on any connected pad joins as player 2
          joinPad = new PadNav(this, n => Array.from({ length: n }, (_, i) => i), a => { if (a === 'confirm') chooseMode(slot, 'coop'); });
        }
      } else {
        note(cx, 160, t('menu.mode.touchOnly'), { color: 'gold', wordWrap: { width: width - 60 } });
      }
    };

    const showCharacter = ({ slot }) => {
      title.setPosition(cx, 22); tag.setVisible(false);
      back = () => stepBack(slot);
      backing(4, 4, width - 8, height - 20, false);
      menu = new CharacterSelect(this, app, id => pickCharacter(slot, id), back, { player: flow.picker, coop: flow.coop });
    };

    const hintKey = (name) => {
      if (name === 'mode') return 'menu.mode.hint';
      if (name !== 'character') return 'menu.hint';
      return flow.coop ? `menu.character.hintP${flow.picker + 1}` : 'menu.character.hint';
    };

    const show = (name, arg) => {
      clear();
      screen = [name, arg];
      title.setText(t('menu.title'));
      tag.setText(t('menu.tagline'));
      hint.setText(t(hintKey(name)));
      ({ slots: showSlots, confirm: showConfirm, mode: showMode, character: showCharacter }[name] ?? showTitle)(arg);
    };

    show('title');
    if (window.SCHULWEG_GAME) { // ?debug: the same steps as the buttons, for the smoke test (scripts/smoke/coop.js)
      window.SCHULWEG_GAME.menuNav = {
        play: () => show('slots'),
        newGame,
        mode: (mode) => chooseMode(screen[1].slot, mode),
        pick: (id) => pickCharacter(screen[1].slot, id),
        continueSlot: (slot) => play(() => saves.load(slot)),
        state: () => ({ screen: screen[0], step: flow?.step, coop: flow?.coop, picker: flow?.picker, picks: flow ? [...flow.picks] : [] })
      };
    }
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
