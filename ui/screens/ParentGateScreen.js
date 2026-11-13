import { uiLabel, uiLeave, uiScreenFrame, uiFace } from '../uiKit.js';
import { Gate } from '../../services/parentLogic.js';
import { ChoiceCursor } from '../../minigames/minigameCore.js';

// The parent gate (story 11.4): a sum a class 3 kid does not do in their head, with four answers. A wrong answer shuts the gate for a
// few seconds and brings a new question; several wrong ones in a row shut it for longer. The right answer opens the settings.
// Arrows (or the pointer) choose, jump / interact confirms; Esc leaves. The time is the scene clock, so pausing does not matter.
export class ParentGateScreen {
  constructor(scene, ctx, stack, cfg, onOpen, rng = Math.random) {
    this.id = 'parentGate';
    this.scene = scene;
    this.ctx = ctx;
    this.stack = stack;
    this.cfg = cfg;
    this.onOpen = onOpen;
    this.gate = new Gate(cfg.gate, rng);
    this.sel = 0;
    this.objects = [];
    this.cursors = ctx.players.map(() => new ChoiceCursor());
    this.note = '';
  }

  now() { return this.scene.time.now / 1000; }

  create() {
    const { scene, ctx } = this;
    const { w, h } = ctx.res;
    const own = o => { this.objects.push(o); return o; };
    const frame = uiScreenFrame(scene, ctx, { x: 30, y: 25, w: w - 60, h: h - 50, dimAlpha: 0.95 });
    own(frame.dim);
    own(frame.panel);
    const text = (x, y, size, color, wrap) => own(uiLabel(scene, x, y, '', 'body', 'ink', { size, color, align: 'center', ...(wrap ? { wordWrap: { width: wrap } } : {}) }).setOrigin(0.5, 0).setDepth(43));
    this.title = text(w / 2, 40, 14, '#ffd36b');
    this.intro = text(w / 2, 62, 9, '#b4c2d8', w - 100);
    this.question = text(w / 2, 100, 18, '#f6efdc');
    this.status = text(w / 2, 196, 9, '#ff9f8e', w - 100);
    this.nav = text(w / 2, 226, 8, '#b4c2d8');
    this.faces = [];
    this.options = [0, 1, 2, 3].map(i => {
      const x = w / 2 + (i % 2 ? 62 : -62);
      const y = 140 + Math.floor(i / 2) * 28;
      const t = own(uiLabel(scene, x, y, '', 'body', 'ink', { size: 13, padding: { x: 12, y: 4 }, shadow: false }).setOrigin(0.5).setDepth(43).setInteractive({ useHandCursor: true }));
      this.faces[i] = own(uiFace(scene, t));
      t.on('pointerdown', () => { this.sel = i; this.choose(); });
      return t;
    });
    this.render();
  }

  render() {
    const { ctx, gate } = this;
    const q = gate.question;
    this.title.setText(ctx.t('parent.gate.title'));
    this.intro.setText(ctx.t('parent.gate.intro'));
    this.question.setText(ctx.t('parent.gate.question', { a: q.a, b: q.b, c: q.c }));
    this.options.forEach((t, i) => { t.setText(String(q.options[i])).setAlpha(gate.locked(this.now()) ? 0.4 : 1); this.faces[i].sync(i === this.sel ? 'focus' : 'idle'); });
    this.status.setText(this.note);
    this.nav.setText(ctx.t('parent.gate.nav'));
  }

  choose() {
    const { gate, ctx } = this;
    const result = gate.answer(this.sel, this.now());
    if (result === 'open') { this.close(); this.onOpen(); return; }
    if (result === 'wrong') { this.note = ctx.t('parent.gate.wrong', { s: gate.secondsLeft(this.now()) }); ctx.events.emit('parent:gate-failed', { wrong: gate.wrong }); }
    else this.note = ctx.t('parent.gate.locked', { s: gate.secondsLeft(this.now()) });
    this.render();
  }

  retext() { this.render(); }

  close() {
    if (this.stack.top() === this) this.stack.pop();
  }

  handleIntent(intent) {
    if (intent.pause) { this.close(); return; }
    if (this.gate.locked(this.now())) { // the countdown follows the clock, and the buttons come back when the lock is over
      const left = this.gate.secondsLeft(this.now());
      const text = this.ctx.t('parent.gate.locked', { s: left });
      if (this.note !== text && left > 0) { this.note = text; this.render(); }
    } else if (this.note && this.gate.openUntil > 0 && !this.gate.locked(this.now()) && this.options[0].alpha < 1) { this.note = ''; this.render(); }
    for (const p of this.ctx.players) {
      const read = this.cursors[p.index].read(this.ctx.input.intents[p.index]);
      if (read.dx || read.dy) { this.sel = Math.max(0, Math.min(3, this.sel + read.dx + read.dy * 2)); this.render(); return; }
      if (read.confirm) { this.choose(); return; }
    }
  }

  destroy() {
    uiLeave(this.scene, this.ctx, this.objects);
  }
}
