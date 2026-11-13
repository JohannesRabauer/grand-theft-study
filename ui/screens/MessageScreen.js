import { uiLabel, uiLeave, uiScreenFrame } from '../uiKit.js';
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
    const frame = uiScreenFrame(scene, ctx, { x: 18, y: 22, w: w - 36, h: h - 44 });
    own(frame.dim);
    own(frame.panel);
    this.title = own(uiLabel(scene, w / 2, 40, this.opts.title, 'heading', 'ink', { size: 15, align: 'center', wordWrap: { width: w - 76 } }).setOrigin(0.5, 0).setDepth(41));
    this.body = own(uiLabel(scene, w / 2, 74, this.opts.lines.join('\n\n'), 'body', 'ink', { size: 11, align: 'center', wordWrap: { width: w - 76 } }).setOrigin(0.5, 0).setDepth(41));
    this.footer = own(uiLabel(scene, w / 2, h - 70, '', 'body', 'ink', { color: 'muted', align: 'center' }).setOrigin(0.5, 0).setDepth(41).setInteractive({ useHandCursor: true }));
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
    uiLeave(this.scene, this.ctx, this.objects);
    this.opts.onDone?.();
  }
}
