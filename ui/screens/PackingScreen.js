import { uiText } from '../uiKit.js';
import { ChoiceCursor } from '../../minigames/minigameCore.js';
import { missingItems } from '../../services/Morning.js';

const BAG = { x: 267, y: 69, w: 165, h: 102 };

export class PackingScreen {
  constructor(scene, ctx, morning, player = 0) {
    this.id = 'packing';
    this.scene = scene;
    this.ctx = ctx;
    this.morning = morning;
    this.player = player;
    this.focus = 0;
    this.cursor = new ChoiceCursor();
    this.objects = [];
    this.cards = [];
  }

  create() {
    const { scene, ctx, morning } = this;
    morning.begin();
    const own = o => { this.objects.push(o); return o; };
    own(scene.add.rectangle(0, 0, ctx.res.w, ctx.res.h, 0x000000, 0.86).setOrigin(0).setDepth(40).setInteractive());
    own(scene.add.rectangle(24, 12, 432, 246, 0x1a2830).setOrigin(0).setDepth(41).setStrokeStyle(2, 0xe2bb65));
    const text = (x, y, size = 10, extra = {}) => own(uiText(scene, x, y, '', {
      fontFamily: 'monospace', fontSize: `${size}px`, color: '#ffffff', ...extra
    }).setDepth(42));
    this.title = text(240, 26, 13, { color: '#ffe14d' }).setOrigin(0.5);
    this.tabs = ctx.players.map((p, i) => {
      const tab = text(120 + i * 220, 49, 10).setOrigin(0.5).setInteractive({ useHandCursor: true });
      tab.on('pointerdown', () => { this.player = i; this.focus = 0; this.retext(); });
      return tab;
    });
    own(scene.add.rectangle(BAG.x, BAG.y, BAG.w, BAG.h, 0x355e81).setOrigin(0).setDepth(42).setStrokeStyle(2, 0x88b5d5));
    this.bagLabel = text(BAG.x + BAG.w / 2, BAG.y + 13, 11, { color: '#ffe14d' }).setOrigin(0.5);
    this.contents = text(BAG.x + 8, BAG.y + 29, 8, { wordWrap: { width: BAG.w - 16 } });
    this.missing = text(BAG.x, 180, 8, { color: '#ffe1a0', wordWrap: { width: BAG.w }, lineSpacing: 2 });
    this.help = text(40, 219, 8, { color: '#b8d6e5' });
    this.cards = morning.cfg.items.map((item, i) => {
      const card = text(40, 68 + i * 14, 9, { padding: { x: 4, y: 1 } }).setInteractive({ useHandCursor: true });
      scene.input.setDraggable(card);
      card.on('pointerdown', () => { card.dragged = false; this.focus = i; this.paint(); });
      card.on('dragstart', () => { card.dragged = true; card.setDepth(44); });
      card.on('drag', (pointer, x, y) => card.setPosition(x, y));
      card.on('dragend', pointer => {
        const point = scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
        const inside = point.x >= BAG.x && point.x <= BAG.x + BAG.w && point.y >= BAG.y && point.y <= BAG.y + BAG.h;
        this.put(item.id, inside);
        card.setDepth(42);
        this.retext();
      });
      card.on('pointerup', () => { if (!card.dragged) this.toggle(item.id); });
      return card;
    });
    this.done = text(240, 243, 10, { color: '#ffe14d' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    this.done.on('pointerdown', () => this.finish());
    this.retext();
  }

  put(id, packed) {
    const bag = this.ctx.state.players[this.player].bag;
    const next = packed ? [...new Set([...bag, id])] : bag.filter(i => i !== id);
    this.morning.setBag(this.player, next);
    this.retext();
  }

  toggle(id) { this.put(id, !this.ctx.state.players[this.player].bag.includes(id)); }

  retext() {
    const { ctx, morning } = this;
    const required = morning.required();
    const bag = ctx.state.players[this.player].bag;
    this.title.setText(ctx.t('home.packing', { day: morning.day }));
    this.tabs.forEach((tab, i) => {
      const who = ctx.players[i].character?.name ?? ctx.t('menu.slot.player', { n: i + 1 });
      tab.setText(who).setColor(i === this.player ? '#ffe14d' : '#ffffff');
    });
    this.cards.forEach((card, i) => {
      const item = morning.cfg.items[i];
      card.setPosition(40, 68 + i * 14).setText(`${bag.includes(item.id) ? '[x]' : '[ ]'} ${ctx.t(item.label)}${required.includes(item.id) ? ' *' : ''}`);
    });
    const missing = missingItems(required, bag);
    this.bagLabel.setText(ctx.t('home.bag'));
    this.contents.setText(bag.length ? morning.names(bag) : ctx.t('home.empty-bag'));
    this.missing.setText(missing.length ? ctx.t('home.missing', { items: morning.names(missing) }) : ctx.t('home.all-packed'));
    this.help.setText(ctx.t('home.pack-help'));
    this.done.setText(ctx.t('home.ready'));
    this.paint();
  }

  paint() {
    this.cards.forEach((c, i) => c.setBackgroundColor(i === this.focus ? '#78612c' : '#243b44'));
    this.done.setBackgroundColor(this.focus === this.cards.length ? '#78612c' : '#243b44');
  }

  handleIntent(intent) {
    if (intent.pause) { this.close(); return; }
    const nav = this.cursor.read(this.ctx.input.intents[this.player]);
    if (nav.dy) this.focus = (this.focus + nav.dy + this.cards.length + 1) % (this.cards.length + 1);
    if (nav.dx && this.ctx.players.length > 1) {
      this.player = (this.player + nav.dx + this.ctx.players.length) % this.ctx.players.length;
      this.retext();
    }
    if (nav.confirm) this.focus === this.cards.length ? this.finish() : this.toggle(this.morning.cfg.items[this.focus].id);
    this.paint();
  }

  finish() {
    this.morning.check(this.player);
    this.morning.save();
    const next = this.ctx.players.find(p => !this.morning.progress(p.index).packed);
    if (next) { this.player = next.index; this.focus = 0; this.retext(); return; }
    this.close();
    this.morning.depart();
  }

  close() {
    if (this.ctx.screens.top() === this) { this.morning.save(); this.ctx.screens.pop(); }
  }
  destroy() { for (const o of this.objects) o.destroy(); }
}
