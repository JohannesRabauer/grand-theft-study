import { uiLabel, uiLeave, uiScreenFrame, paintRects, uiCfg } from '../uiKit.js';
import { faceTone, panelRects } from '../uiTheme.js';
import { controlParams } from '../controlLabels.js';
import { itemStatus } from '../../services/shopLogic.js';
import { ChoiceCursor } from '../../minigames/minigameCore.js';

// A shop (story 10.1): the items of one shop with prices from data/shop.json, bought by the player who opened it. Up / down
// choose, jump or interact (or a click) buys; an owned cosmetic is put on or taken off instead. The world is frozen while it
// is open and a fresh press is needed, so a key held from play cannot buy anything. Esc or the back line leaves.
const ROWS = 6;

export class ShopScreen {
  constructor(scene, ctx, stack, shops, shopId, player) {
    this.id = 'shop';
    this.scene = scene;
    this.ctx = ctx;
    this.stack = stack;
    this.shops = shops;
    this.shopId = shopId;
    this.player = player;
    this.items = shops.items(shopId);
    this.sel = 0;
    this.top = 0;
    this.note = '';
    this.noteColor = 'green';
    this.objects = [];
    this.cursor = new ChoiceCursor();
  }

  create() {
    const { scene, ctx } = this;
    const own = o => { this.objects.push(o); return o; };
    const frame = uiScreenFrame(scene, ctx, { x: 24, y: 12, w: 432, h: 246, dimAlpha: 0.88, depth: 40 });
    own(frame.dim);
    own(frame.panel);
    const text = (x, y, size = 10, color = 'text') => own(uiLabel(scene, x, y, '', 'body', 'ink', { size, color }).setDepth(43));
    this.title = text(240, 24, 14, 'gold').setOrigin(0.5);
    this.money = text(432, 24, 10, 'green').setOrigin(1, 0.5);
    const cfg = uiCfg(scene);
    this.cursorBar = own(scene.add.graphics().setDepth(42));
    paintRects(this.cursorBar, panelRects(412, 20, faceTone(cfg.button.idle.face, cfg.edge, cfg.tones.ink.accent), cfg.edge, { shadow: false }));
    paintRects(this.cursorBar, [[2, 3, 2, 14, cfg.button.focus.face, 1]]);
    this.rows = Array.from({ length: ROWS }, (_, i) => {
      const y = 48 + i * 22;
      const name = text(42, y + 4, 10);
      const price = text(438, y + 4, 10, 'gold').setOrigin(1, 0);
      const hit = own(scene.add.rectangle(34, y, 412, 20, 0xffffff, 0.001).setOrigin(0).setDepth(44).setInteractive({ useHandCursor: true }));
      hit.on('pointerdown', () => { this.sel = Math.min(this.items.length - 1, this.top + i); this.act(); if (this.ctx.screens.top() === this) this.retext(); });
      return { name, price, y };
    });
    this.more = text(240, 183, 9, 'muted').setOrigin(0.5);
    this.desc = text(40, 195, 10, 'text');
    this.desc.setWordWrapWidth(400);
    this.noteText = text(240, 229, 10).setOrigin(0.5);
    this.hint = text(240, 246, 9, 'muted').setOrigin(0.5);
    this.hint.setInteractive({ useHandCursor: true });
    this.hint.on('pointerdown', () => this.close());
    this.retext();
  }

  item() { return this.items[this.sel]; }

  itemName(item) { return this.ctx.t(item.type === 'vehicle' ? `vehicle.${item.vehicle}` : `item.${item.id}.name`); }

  priceText(item) {
    if (item.type === 'activity') return this.ctx.t('shop.practice');
    return this.ctx.t('hud.money', { v: (item.price / 100).toFixed(2).replace('.', this.ctx.i18n.lang === 'de' ? ',' : '.') });
  }

  retext() {
    const { ctx } = this;
    const data = ctx.state.data;
    this.title.setText(ctx.t(`shop.${this.shopId}.name`));
    this.money.setText(ctx.t('shop.money', { v: ctx.t('hud.money', { v: (data.shared.money / 100).toFixed(2).replace('.', ctx.i18n.lang === 'de' ? ',' : '.') }) }));
    if (this.sel < this.top) this.top = this.sel;
    if (this.sel >= this.top + ROWS) this.top = this.sel - ROWS + 1;
    this.rows.forEach((row, i) => {
      const item = this.items[this.top + i];
      row.name.setVisible(!!item);
      row.price.setVisible(!!item);
      if (!item) return;
      const st = itemStatus(this.shops.cfg, data, this.player, item);
      const cos = item.type === 'cosmetic';
      const ink = uiCfg(this.scene).text.ink;
      row.name.setText(`${this.top + i === this.sel ? '> ' : '  '}${this.itemName(item)}`).setColor(st.owned && !cos ? ink.muted : st.affordable || st.owned ? ink.text : ink.muted);
      row.price.setText(st.worn ? ctx.t('shop.worn') : st.owned ? ctx.t(cos ? 'shop.owned.change' : 'shop.owned') : this.priceText(item))
        .setColor(st.worn ? ink.green : st.owned ? ink.muted : st.affordable ? ink.gold : ink.red);
    });
    const shown = this.sel - this.top;
    this.cursorBar.setPosition(34, 48 + shown * 22);
    this.more.setText(this.items.length > ROWS ? ctx.t('shop.more', { n: this.sel + 1, total: this.items.length }) : '');
    const item = this.item();
    this.desc.setText(item ? ctx.t(`item.${item.id}.desc`) : '');
    this.noteText.setText(this.note).setColor(uiCfg(this.scene).text.ink[this.noteColor]);
    const keys = controlParams(this.shops.inputCfg, [this.player], ctx.input.type, ctx.t);
    this.hint.setText(ctx.t('shop.hint', { keys: [keys.jump, keys.interact].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' / ') }));
  }

  say(key, params, ok) {
    this.note = this.ctx.t(key, params);
    this.noteColor = ok ? 'green' : 'red';
  }

  act() {
    const item = this.item();
    if (!item) return;
    const { ctx, shops, player } = this;
    if (item.type === 'activity') { this.close(); ctx.activities.start(item.activity, player); return; } // the counter: practise ordering for pocket money
    const status = itemStatus(shops.cfg, ctx.state.data, player, item);
    const name = this.itemName(item);
    if (item.type === 'cosmetic' && status.owned) {
      shops.equip(player, item.slot, status.worn ? null : item.id);
      this.say(status.worn ? 'shop.tookOff' : 'shop.putOn', { item: name }, true);
      return;
    }
    const r = shops.buy(item.id, player);
    if (r.ok) this.say(item.type === 'snack' ? 'shop.ate' : 'shop.bought', { who: shops.who(player), item: name }, true);
    else if (r.reason === 'insufficient-funds') this.say('shop.notEnough', { item: name }, false);
    else this.say('shop.already', { item: name }, false);
  }

  close() {
    if (this.stack.top() === this) this.stack.pop();
  }

  handleIntent(intent) {
    if (intent.pause) { this.close(); return; }
    const read = this.cursor.read(this.ctx.input.intents[this.player]);
    if (read.dy) { this.sel = Math.max(0, Math.min(this.items.length - 1, this.sel + read.dy)); this.note = ''; this.retext(); }
    else if (read.confirm) { this.act(); if (this.ctx.screens.top() === this) this.retext(); }
  }

  destroy() {
    uiLeave(this.scene, this.ctx, this.objects);
  }
}
