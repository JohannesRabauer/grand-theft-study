import { uiText } from '../uiKit.js';
import { controlParams } from '../controlLabels.js';
import { ChoiceCursor } from '../../minigames/minigameCore.js';

// A contextual explanation (story 11.5, 11.6). Two modes, same layout:
//  - 'hint': opened by the Hints service for the players it addresses. It stays until one of them confirms (jump or
//    interact, a fresh press: a key still held from play cannot dismiss it) or Esc is pressed; the world is frozen the
//    whole time, so reading never costs anything and slower readers are never rushed.
//  - 'browse': opened from the pause menu's Help. Left / right page through every tip, confirm or Esc closes.
export class HintScreen {
  // opts: { mode: 'hint' | 'browse', ids: [hint ids], index, audience: [player indices], inputCfg, defs, onDone }
  constructor(scene, ctx, stack, opts) {
    this.id = 'hint';
    this.scene = scene;
    this.ctx = ctx;
    this.stack = stack;
    this.opts = opts;
    this.index = opts.index ?? 0;
    this.objects = [];
    this.cursors = ctx.players.map(() => new ChoiceCursor());
    this.finished = false;
  }

  create() {
    const { scene, ctx } = this;
    const { w, h } = ctx.res;
    const own = o => { this.objects.push(o); return o; };
    own(scene.add.rectangle(0, 0, w, h, 0x12151c, 0.94).setOrigin(0).setDepth(40).setInteractive());
    own(scene.add.rectangle(w / 2, h / 2, w - 36, h - 44, 0x1d2430).setStrokeStyle(2, 0xffe14d).setDepth(40.5));
    const text = (y, size, color, wrap) => own(uiText(scene, w / 2, y, '', {
      fontFamily: 'monospace', fontSize: `${size}px`, color, align: 'center',
      ...(wrap ? { wordWrap: { width: w - 76 } } : {})
    }).setOrigin(0.5, 0).setDepth(41));
    this.who = text(34, 9, '#9be58f');
    this.title = text(48, 15, '#ffe14d', true);
    this.body = text(84, 11, '#ffe7ac', true);
    this.footer = text(h - 70, 10, '#ffffff', true).setInteractive({ useHandCursor: true });
    this.footer.on('pointerdown', () => this.confirm());
    this.counter = text(h - 46, 8, '#8fa6b2');
    this.retext();
  }

  get ids() { return this.opts.ids; }

  audience() { return this.opts.audience ?? this.ctx.players.map(p => p.index); }

  retext() {
    const { ctx, opts } = this;
    const def = this.ids[this.index];
    const aud = this.audience();
    const params = controlParams(opts.inputCfg, aud, ctx.input.type, ctx.t);
    const confirmKeys = [params.jump, params.interact].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' / ');
    this.title.setText(ctx.t(`hint.${def}.title`));
    this.body.setText(ctx.t(`hint.${def}.body`, params));
    const named = ctx.players.length > 1 && aud.length === 1;
    this.who.setText(opts.mode === 'browse' ? ctx.t('hint.browse.heading') : named
      ? ctx.t('hint.for', { who: ctx.players[aud[0]].character?.name ?? ctx.t('menu.slot.player', { n: aud[0] + 1 }) })
      : ctx.players.length > 1 ? ctx.t('hint.forAll') : ctx.t('hint.tip'));
    if (opts.mode === 'browse') {
      this.footer.setText(ctx.t('hint.browse.nav', { keys: confirmKeys }));
      this.counter.setText(ctx.t('hint.browse.counter', { n: this.index + 1, total: this.ids.length }));
    } else {
      this.footer.setText(ctx.t('hint.continue', { keys: confirmKeys }));
      this.counter.setText(ctx.t('hint.revisit'));
    }
  }

  confirm() {
    if (this.finished) return;
    this.finished = true;
    if (this.stack.top() === this) this.stack.pop();
  }

  handleIntent(intent) {
    if (intent.pause) { this.confirm(); return; }
    const browse = this.opts.mode === 'browse';
    const players = browse ? this.ctx.players.map(p => p.index) : this.audience();
    // every cursor is read every frame, so a press held when the screen opened has to be released before it counts
    for (const p of this.ctx.players.map(x => x.index)) {
      const read = this.cursors[p].read(this.ctx.input.intents[p]);
      if (!players.includes(p)) continue;
      if (browse && read.dx) {
        this.index = (this.index + read.dx + this.ids.length) % this.ids.length;
        this.retext();
        return;
      }
      if (read.confirm) { this.confirm(); return; }
    }
  }

  destroy() {
    for (const o of this.objects) o.destroy();
    this.opts.onDone?.(this.finished);
  }
}
