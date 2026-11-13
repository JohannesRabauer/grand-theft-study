import { uiLabel, uiLeave, uiScreenFrame, uiPanel, uiIcon } from '../uiKit.js';
import { ChoiceCursor } from '../../minigames/minigameCore.js';

// The phone (story 11.3): the newest messages with who sent them and on which day, opening marks them read. Closed by a fresh confirm,
// the phone key or Esc. The world is frozen while it is open.
const SHOWN = 6;

export class PhoneScreen {
  constructor(scene, ctx, stack, phone) {
    this.id = 'phone';
    this.scene = scene;
    this.ctx = ctx;
    this.stack = stack;
    this.phone = phone;
    this.objects = [];
    this.cursor = new ChoiceCursor();
  }

  create() {
    const { scene, ctx } = this;
    const { w, h } = ctx.res;
    const own = o => { this.objects.push(o); return o; };
    const frame = uiScreenFrame(scene, ctx, { dimAlpha: 0.95 });
    own(frame.dim);
    own(frame.panel);
    own(uiIcon(scene, w / 2 - 70, 17, 'mail').setDepth(43));
    this.title = own(uiLabel(scene, w / 2 - 56, 14, '', 'heading').setOrigin(0, 0).setDepth(43));
    own(uiPanel(scene, 24, 36, w - 48, h - 72, { tone: 'paper', shadow: false, depth: 42 }));
    this.body = own(uiLabel(scene, 34, 44, '', 'body', 'paper', { lineSpacing: 6, wordWrap: { width: w - 68 } }).setOrigin(0, 0).setDepth(43));
    this.nav = own(uiLabel(scene, w / 2, h - 28, '', 'small').setOrigin(0.5, 0).setDepth(43));
    this.wasUnread = this.phone.inbox.filter(m => !m.read).map(m => m.id + m.day);
    this.phone.read();
    this.render();
  }

  render() {
    const { ctx } = this;
    const list = this.phone.inbox.slice(-SHOWN).reverse();
    this.title.setText(ctx.t('phone.title'));
    this.body.setText(list.length ? list.map(m => `${this.wasUnread.includes(m.id + m.day) ? '* ' : '  '}${ctx.t(`phone.from.${m.from}`)} (${ctx.t('phone.day', { n: m.day })})\n   ${ctx.t(`phone.msg.${m.id}`)}`).join('\n') : ctx.t('phone.empty'));
    this.nav.setText(ctx.t('phone.nav'));
  }

  retext() { this.render(); }

  close() {
    if (this.stack.top() === this) this.stack.pop();
  }

  handleIntent(intent) {
    if (intent.pause) { this.close(); return; }
    if (intent.phone) { this.close(); this.phone.closedByKey(); return; }
    if (this.cursor.read(this.ctx.input.intents[0]).confirm) this.close();
  }

  destroy() {
    uiLeave(this.scene, this.ctx, this.objects);
  }
}
