import { uiLabel, uiText, uiLeave, uiScreenFrame } from '../uiKit.js';
import { ChoiceCursor } from '../../minigames/minigameCore.js';

// The sticker album (story 10.3): a Panini-style page of cards, found ones coloured by category with a gold frame when rare,
// missing ones a grey "?"; the selected sticker shows its name and its fun fact in the active language. Arrows choose, Q / E
// (tool intents) switch to the other kid's album in co-op, Esc closes. Read-only.
const COLS = 10;
const ROWS = 3;
const CARD = { w: 37, h: 42, gx: 4, gy: 4 };

const hex = c => parseInt(c.slice(1), 16);
const shade = (c, k) => { const n = hex(c); return ((((n >> 16) & 255) * k) << 16) | ((((n >> 8) & 255) * k) << 8) | ((n & 255) * k); };

export class StickerAlbumScreen {
  constructor(scene, ctx, stack, stickers, player = 0) {
    this.id = 'album';
    this.scene = scene;
    this.ctx = ctx;
    this.stack = stack;
    this.stickers = stickers;
    this.player = player;
    this.sel = 0;
    this.objects = [];
    this.cards = [];
    this.cursors = ctx.players.map(() => new ChoiceCursor());
  }

  create() {
    const { scene, ctx } = this;
    const { w, h } = ctx.res;
    const own = o => { this.objects.push(o); return o; };
    const frame = uiScreenFrame(scene, ctx, { dimAlpha: 0.95 });
    own(frame.dim);
    own(frame.panel);
    const text = (x, y, size, color, wrap) => own(uiLabel(scene, x, y, '', 'body', 'ink', { size, color, ...(wrap ? { wordWrap: { width: wrap } } : {}) }).setDepth(43));
    this.title = text(w / 2, 18, 14, '#ffd36b').setOrigin(0.5, 0);
    this.owner = text(w / 2, 36, 9, '#9ddc7a').setOrigin(0.5, 0);
    this.gfx = own(scene.add.graphics().setDepth(42));
    this.label = text(30, 192, 11, '#f6efdc');
    this.meta = text(30, 207, 8, '#ffd36b');
    this.fact = text(30, 219, 9, '#f6efdc', w - 60);
    this.nav = text(w / 2, h - 26, 8, '#b4c2d8').setOrigin(0.5, 0);
    this.numbers = [];
    this.cards = [];
    const total = this.stickers.cfg.stickers.length;
    for (let i = 0; i < COLS * ROWS; i++) {
      const x = 34 + (i % COLS) * (CARD.w + CARD.gx);
      const y = 54 + Math.floor(i / COLS) * (CARD.h + CARD.gy);
      this.cards.push({ x, y });
      if (i < total) {
        const hit = own(scene.add.rectangle(x, y, CARD.w, CARD.h, 0xfff1c4, 0.001).setOrigin(0).setDepth(44).setInteractive({ useHandCursor: true }));
        hit.on('pointerdown', () => { this.sel = i; this.render(); });
        this.numbers.push(text(x + 2, y + CARD.h - 10, 7, '#f6efdc'));
      }
    }
    this.render();
  }

  get cfg() { return this.stickers.cfg; }

  who() { const p = this.ctx.players[this.player]; return p?.character?.name ?? this.ctx.t('menu.slot.player', { n: this.player + 1 }); }

  // One tiny symbol per category, drawn from shapes.
  icon(g, kind, cx, cy, col) {
    g.fillStyle(col);
    if (kind === 'animal') { g.fillCircle(cx, cy + 3, 6); for (const dx of [-7, -2.5, 2.5, 7]) g.fillCircle(cx + dx, cy - 5, 2.4); }
    else if (kind === 'science') { g.fillRect(cx - 2, cy - 9, 4, 8); g.fillTriangle(cx - 8, cy + 9, cx + 8, cy + 9, cx, cy - 2); }
    else if (kind === 'place') { g.fillTriangle(cx - 10, cy + 8, cx, cy - 9, cx + 10, cy + 8); g.fillStyle(0xfff1c4, 0.9); g.fillTriangle(cx - 3, cy - 3, cx, cy - 9, cx + 3, cy - 3); }
    else if (kind === 'sport') { g.fillCircle(cx, cy, 9); g.lineStyle(1, 0x16161e, 0.4); g.strokeCircle(cx, cy, 9); g.lineBetween(cx - 9, cy, cx + 9, cy); }
    else { g.fillRect(cx - 8, cy - 2, 16, 11); g.fillTriangle(cx - 10, cy - 2, cx + 10, cy - 2, cx, cy - 11); g.fillStyle(0x16161e, 0.35); g.fillRect(cx - 2, cy + 3, 4, 6); }
  }

  render() {
    const { ctx, gfx } = this;
    const total = this.cfg.stickers.length;
    const mine = new Set(this.stickers.list(this.player));
    gfx.clear();
    this.cfg.stickers.forEach((s, i) => {
      const { x, y } = this.cards[i];
      const have = mine.has(s.id);
      const base = hex(this.cfg.categories[s.category]);
      gfx.fillStyle(have ? shade(this.cfg.categories[s.category], 0.55) : 0x39414f).fillRect(x, y, CARD.w, CARD.h);
      gfx.fillStyle(have ? base : 0x4a5262).fillRect(x + 2, y + 2, CARD.w - 4, CARD.h - 14);
      if (have) {
        this.icon(gfx, s.category, x + CARD.w / 2, y + 2 + (CARD.h - 14) / 2, 0xfff1c4);
        gfx.fillStyle(0xfff1c4, 0.22).fillRect(x + 2, y + 2, CARD.w - 4, 5); // a bit of shine
      }
      gfx.lineStyle(have && s.rarity === 'rare' ? 2 : 1, have && s.rarity === 'rare' ? 0xffd84d : 0x6b7385).strokeRect(x + 0.5, y + 0.5, CARD.w - 1, CARD.h - 1);
      this.numbers[i].setText(String(i + 1).padStart(2, '0')).setColor(have ? '#f6efdc' : '#b4c2d8');
    });
    const sel = this.cards[this.sel];
    gfx.lineStyle(1, 0x16161e).strokeRect(sel.x - 3.5, sel.y - 3.5, CARD.w + 7, CARD.h + 7).lineStyle(2, 0xfff1c4).strokeRect(sel.x - 2, sel.y - 2, CARD.w + 4, CARD.h + 4);
    // the "?" of missing cards is drawn as text over the grey card
    this.marks?.forEach(m => m.destroy());
    this.marks = [];
    this.cfg.stickers.forEach((s, i) => {
      if (mine.has(s.id)) return;
      const t = uiText(this.scene, this.cards[i].x + CARD.w / 2, this.cards[i].y + 16, ctx.t('album.empty'), { fontFamily: 'monospace', fontSize: '14px', color: '#b4c2d8' }).setOrigin(0.5).setDepth(43);
      this.marks.push(t);
    });
    this.title.setText(ctx.t('album.title'));
    this.owner.setText(ctx.t('album.owner', { who: this.who(), n: mine.size, total }));
    const s = this.cfg.stickers[this.sel];
    const have = mine.has(s.id);
    this.label.setText(have ? ctx.t(`sticker.${s.id}.name`) : ctx.t('album.hidden'));
    this.meta.setText(have ? `${ctx.t(`album.cat.${s.category}`)}  -  ${ctx.t(s.rarity === 'rare' ? 'album.rare' : 'album.common')}` : '');
    this.fact.setText(have ? ctx.t(`sticker.${s.id}.fact`) : ctx.t('album.hiddenHint'));
    this.nav.setText(ctx.t('album.nav'));
  }

  retext() { this.render(); }

  close() {
    if (this.stack.top() === this) this.stack.pop();
  }

  handleIntent(intent) {
    if (intent.pause) { this.close(); return; }
    const total = this.cfg.stickers.length;
    for (const p of this.ctx.players) {
      const i = this.ctx.input.intents[p.index];
      const read = this.cursors[p.index].read(i);
      if ((i.toolNext || i.toolPrev) && this.ctx.players.length > 1) {
        this.player = (this.player + (i.toolNext ? 1 : -1) + this.ctx.players.length) % this.ctx.players.length;
        this.render();
        return;
      }
      if (read.dx || read.dy) {
        const next = this.sel + read.dx + read.dy * COLS;
        if (next >= 0 && next < total) { this.sel = next; this.render(); }
        return;
      }
    }
  }

  destroy() {
    this.marks?.forEach(m => m.destroy());
    uiLeave(this.scene, this.ctx, this.objects);
  }
}
