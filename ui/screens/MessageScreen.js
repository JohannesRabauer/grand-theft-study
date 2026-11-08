import { uiText } from '../uiKit.js';
import { controlParams } from '../controlLabels.js';
import { ChoiceCursor } from '../../minigames/minigameCore.js';

// A message that waits to be read (story 9.1, 11.6): a title and text, the world frozen, closed by a fresh confirmation of
// any player or Esc. Used for the start and the end of missions; `lines` is a list of already translated paragraphs.
export class MessageScreen {
  constructor(scene, ctx, stack, { title, lines, inputCfg, onDone }) {
    this.id = 'message';
    this.scene = scene;
    this.ctx = ctx;
    this.stack = stack;
    this.opts = { title, lines, inputCfg, onDone };
    this.objects = [];
    this.cursors = ctx.players.map(() => new ChoiceCursor());
  }

  create() {
    const { scene, ctx } = this;
    const { w, h } = ctx.res;
    const own = o => { this.objects.push(o); return o; };
    own(scene.add.rectangle(0, 0, w, h, 0x12151c, 0.94).setOrigin(0).setDepth(40).setInteractive());
    own(scene.add.rectangle(w / 2, h / 2, w - 36, h - 44, 0x1d2430).setStrokeStyle(2, 0xe2bb65).setDepth(40.5));
    this.title = own(uiText(scene, w / 2, 40, this.opts.title, { fontFamily: 'monospace', fontSize: '15px', color: '#ffe14d', align: 'center', wordWrap: { width: w - 76 } }).setOrigin(0.5, 0).setDepth(41));
    this.body = own(uiText(scene, w / 2, 74, this.opts.lines.join('\n\n'), { fontFamily: 'monospace', fontSize: '11px', color: '#ffe7ac', align: 'center', wordWrap: { width: w - 76 } }).setOrigin(0.5, 0).setDepth(41));
    this.footer = own(uiText(scene, w / 2, h - 70, '', { fontFamily: 'monospace', fontSize: '10px', color: '#ffffff', align: 'center' }).setOrigin(0.5, 0).setDepth(41).setInteractive({ useHandCursor: true }));
    this.footer.on('pointerdown', () => this.close());
    this.retext();
  }

  retext() {
    const { ctx, opts } = this;
    const keys = controlParams(opts.inputCfg, ctx.players.map(p => p.index), ctx.input.type, ctx.t);
    this.footer.setText(ctx.t('hint.continue', { keys: [keys.jump, keys.interact].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' / ') }));
  }

  close() {
    if (this.stack.top() === this) this.stack.pop();
  }

  handleIntent(intent) {
    if (intent.pause) { this.close(); return; }
    for (const p of this.ctx.players) if (this.cursors[p.index].read(this.ctx.input.intents[p.index]).confirm) { this.close(); return; }
  }

  destroy() {
    for (const o of this.objects) o.destroy();
    this.opts.onDone?.();
  }
}
