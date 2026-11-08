import { uiText } from '../uiKit.js';
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
    own(scene.add.rectangle(0, 0, w, h, 0x10131a, 0.95).setOrigin(0).setDepth(40).setInteractive());
    own(scene.add.rectangle(w / 2, h / 2, w - 24, h - 20, 0x232a38).setStrokeStyle(2, 0xe2bb65).setDepth(40.5));
    this.title = own(uiText(scene, w / 2, 14, '', { fontFamily: 'monospace', fontSize: '14px', color: '#ffe14d' }).setOrigin(0.5, 0).setDepth(43));
    this.body = own(uiText(scene, 28, 40, '', { fontFamily: 'monospace', fontSize: '10px', color: '#ffe7ac', lineSpacing: 6, wordWrap: { width: w - 56 } }).setOrigin(0, 0).setDepth(43));
    this.nav = own(uiText(scene, w / 2, h - 24, '', { fontFamily: 'monospace', fontSize: '8px', color: '#8fa6b2' }).setOrigin(0.5, 0).setDepth(43));
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
    for (const o of this.objects) o.destroy();
  }
}
