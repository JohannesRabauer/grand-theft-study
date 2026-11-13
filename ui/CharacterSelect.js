// Character select (CAP-12): three cards (portrait, name, title, six attribute bars, start vehicle, perk text),
// reached from the menu after "New game" (once per player in co-op: `opts.player`, `opts.coop`). Keys and pad move the focus
// and pick (ui/menuFlow.js: alone arrows, WASD and any pad; in co-op each picker has its own keys and pad), the Back button
// (and Escape, handled by the menu) steps out, a click or tap on a card picks it. The focused card's character says an intro quip. The caller decides
// what picking means (onPick(id)); this object only draws and routes input. Like ButtonMenu it listens to keys
// itself because it is a menu, never gameplay input.
import { uiLabel, uiFace, uiCfg, paintRects, drawBar } from './uiKit.js';
import { panelRects, notched } from './uiTheme.js';
import { displayValue } from '../characters/attributes.js';
import { navAction, menuPads } from './menuFlow.js';
import { PadNav } from './PadNav.js';

const CARD = { w: 140, h: 184, gap: 9, top: 58 };
const BAR = { x: 58, w: 7, gap: 1, h: 6, step: 9, top: 82 };
// The cards are kit panels; the focused one wears the 2 px ring of the kit's focus state.

export class CharacterSelect {
  constructor(scene, app, onPick, onBack, { player = 0, coop = false } = {}) {
    this.scene = scene;
    this.app = app;
    this.onPick = onPick;
    this.player = player;
    this.coop = coop;
    this.cards = [];
    this.index = 0;
    this.objects = [];
    const { t, res } = app;
    const chars = app.characters.characters;
    const left = (res.w - (chars.length * CARD.w + (chars.length - 1) * CARD.gap)) / 2;
    const add = (o) => { this.objects.push(o); return o; };
    const text = (x, y, str, style, origin = 0) => add(uiLabel(scene, x, y, str, 'small', 'ink', style).setOrigin(origin, 0));

    add(uiLabel(scene, res.w / 2, 47, t(coop ? `menu.character.titleP${player + 1}` : 'menu.character.title'), 'body', 'ink', { color: 'text' }).setOrigin(0.5, 0.5));
    const back = add(uiLabel(scene, 10, 10, `< ${t('menu.back')}`, 'body', 'ink', { padding: { x: 5, y: 3 }, shadow: false })
      .setInteractive({ useHandCursor: true }));
    add(uiFace(scene, back)).sync('idle');
    back.on('pointerdown', onBack);
    this.quip = text(res.w / 2, 245, '', { size: 9, color: 'gold', align: 'center', wordWrap: { width: res.w - 40 } }, 0.5);

    chars.forEach((c, i) => {
      const x = left + i * (CARD.w + CARD.gap);
      const y = CARD.top;
      const cx = x + CARD.w / 2;
      const face = add(scene.add.graphics().setPosition(x, y));
      const bg = add(scene.add.rectangle(x, y, CARD.w, CARD.h, 0xffffff, 0.001).setOrigin(0).setInteractive({ useHandCursor: true }));
      bg.on('pointerover', () => this.focus(i));
      bg.on('pointerdown', () => { this.focus(i); this.pick(); });
      const key = `portrait-${c.id}`;
      scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
      add(scene.add.image(cx, y + 4, key).setOrigin(0.5, 0).setScale(3 * res.inv));
      text(cx, y + 56, c.name, { size: 12, fontStyle: 'bold', color: 'gold' }, 0.5);
      text(cx, y + 69, t(c.title), { color: 'muted' }, 0.5);
      app.characters.attributeOrder.forEach((a, r) => {
        const ry = y + BAR.top + r * BAR.step;
        text(x + 8, ry - 1, t(`attr.${a}`), { color: 'text' });
        const value = displayValue(c.attributes[a]);
        const bars = add(scene.add.graphics());
        for (let s = 0; s < app.characters.attrMax; s++) drawBar(scene, bars, x + BAR.x + s * (BAR.w + BAR.gap), ry, BAR.w, BAR.h, s < value ? 1 : 0, s < value ? 'green' : 'grey');
      });
      text(cx, y + 140, t('menu.character.vehicle', { v: t(`vehicle.${c.startVehicle}`) }), { color: 'text' }, 0.5);
      text(cx, y + 152, t(c.perkText), { color: 'muted', align: 'center', wordWrap: { width: CARD.w - 12 } }, 0.5);
      this.cards.push({ def: c, bg, face });
    });

    this.onKey = e => this.key(e.code);
    scene.input.keyboard.on('keydown', this.onKey);
    scene.events.once('shutdown', () => scene.input.keyboard.off('keydown', this.onKey));
    this.pads = new PadNav(scene, total => menuPads(player, coop, total), a => this.act(a));
    this.focus(0);
  }

  focus(i) {
    this.index = i;
    this.cards.forEach((c, n) => {
      const on = n === i;
      this.paintCard(c, on);
    });
    const quips = this.cards[i].def.quips;
    this.quip.setText(`${this.cards[i].def.name}: "${this.app.t(quips[Math.floor(Math.random() * quips.length)])}"`);
  }

  paintCard(c, on) {
    const cfg = uiCfg(this.scene);
    const g = c.face.clear();
    if (on) paintRects(g, [...notched(-3, -3, CARD.w + 6, CARD.h + 6, cfg.edge), ...notched(-2, -2, CARD.w + 4, CARD.h + 4, cfg.button.focus.ring)]);
    paintRects(g, panelRects(CARD.w, CARD.h, { ...cfg.tones.ink, fill: on ? cfg.button.idle.face : cfg.tones.ink.fill }, cfg.edge, { shadow: !on }));
  }

  key(code) { this.act(navAction(this.player, this.coop, code)); }

  act(action) {
    const n = this.cards.length;
    if (action === 'right') this.focus((this.index + 1) % n);
    else if (action === 'left') this.focus((this.index + n - 1) % n);
    else if (action === 'confirm') this.pick();
  }

  pick() { this.onPick(this.cards[this.index].def.id); }

  destroy() {
    this.scene.input.keyboard.off('keydown', this.onKey);
    this.pads.destroy();
    for (const o of this.objects) o.destroy();
  }
}
