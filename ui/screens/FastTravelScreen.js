import { uiLabel, uiLeave, uiScreenFrame, uiFace } from '../uiKit.js';
import { ChoiceCursor } from '../../minigames/minigameCore.js';

// The tram map (story 9.4): from a known stop the kid picks any known stop to ride to (the fare is the usual one, a day ticket
// covers it). Arrows or 1-4 choose, jump / interact rides, Esc stays. The world is frozen while it is open.
export class FastTravelScreen {
  constructor(scene, ctx, stack, commute, stop, targets, player) {
    this.id = 'fastTravel';
    this.scene = scene;
    this.ctx = ctx;
    this.stack = stack;
    this.commute = commute;
    this.stop = stop;
    this.targets = targets.slice(0, 4);
    this.player = player;
    this.sel = 0;
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
    const text = (y, size, color) => own(uiLabel(scene, w / 2, y, '', 'body', 'ink', { size, color, align: 'center', wordWrap: { width: w - 70 } }).setOrigin(0.5, 0).setDepth(43));
    this.title = text(18, 14, '#ffd36b');
    this.here = text(44, 9, '#9ddc7a');
    this.nav = text(h - 26, 8, '#b4c2d8');
    this.faces = [];
    this.buttons = this.targets.map((o, i) => {
      const b = own(uiLabel(scene, w / 2, 80 + i * 28, '', 'body', 'ink', { size: 12, padding: { x: 16, y: 5 }, align: 'center', shadow: false }).setOrigin(0.5, 0).setDepth(43).setInteractive({ useHandCursor: true }));
      this.faces.push(own(uiFace(scene, b)));
      b.on('pointerdown', () => { this.sel = i; this.confirm(); });
      return b;
    });
    this.render();
  }

  render() {
    const { ctx } = this;
    this.title.setText(ctx.t('tram.fast.title'));
    this.here.setText(ctx.t('tram.fast.here', { stop: ctx.t(`tram.stop.${this.stop.id}`) }));
    this.nav.setText(ctx.t('tram.fast.nav'));
    this.buttons.forEach((b, i) => { b.setText(`${i === this.sel ? '> ' : '  '}${ctx.t(`tram.stop.${this.targets[i].id}`)}`); this.faces[i].sync(i === this.sel ? 'focus' : 'idle'); });
  }

  retext() { this.render(); }

  confirm() {
    const dest = this.targets[this.sel];
    this.close();
    this.commute.ride(this.stop, dest);
  }

  close() {
    if (this.stack.top() === this) this.stack.pop();
  }

  handleIntent(intent) {
    if (intent.pause) { this.close(); return; }
    const read = this.cursor.read(this.ctx.input.intents[this.player]);
    if (read.dy || read.dx) { this.sel = Math.max(0, Math.min(this.targets.length - 1, this.sel + read.dy + read.dx)); this.render(); return; }
    if (read.pick && read.pick <= this.targets.length) { this.sel = read.pick - 1; this.confirm(); return; }
    if (read.confirm) this.confirm();
  }

  destroy() {
    uiLeave(this.scene, this.ctx, this.objects);
  }
}
