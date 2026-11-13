import { uiLabel, uiLeave, uiScreenFrame, uiFace } from '../uiKit.js';
import { ChoiceCursor } from '../../minigames/minigameCore.js';
import { canPlay } from '../../services/activityLogic.js';

// The chore board (stories 9.5 and 9.6): the chores this kid can do, those done today greyed out with a tick. Arrows or 1-6 choose,
// jump / interact starts the chore (its own activity screen opens), Esc closes. The world is frozen while it is open.
export class ChoreScreen {
  constructor(scene, ctx, stack, activities, ids, player) {
    this.id = 'chores';
    this.scene = scene;
    this.ctx = ctx;
    this.stack = stack;
    this.activities = activities;
    this.ids = ids;
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
    this.title = text(14, 14, '#ffd36b');
    this.nav = text(h - 24, 8, '#b4c2d8');
    this.faces = [];
    this.buttons = this.ids.map((id, i) => {
      const b = own(uiLabel(scene, w / 2, 44 + i * 24, '', 'body', 'ink', { size: 11, padding: { x: 14, y: 4 }, align: 'center', shadow: false }).setOrigin(0.5, 0).setDepth(43).setInteractive({ useHandCursor: true }));
      this.faces.push(own(uiFace(scene, b)));
      b.on('pointerdown', () => { this.sel = i; this.confirm(); });
      return b;
    });
    this.render();
  }

  open(i) {
    const { activities, ctx, player } = this;
    return canPlay(activities.cfg, ctx.state.shared.flags, this.ids[i], ctx.state.shared.clock.day, player);
  }

  render() {
    const { ctx } = this;
    this.title.setText(ctx.t('activity.chores.title'));
    this.nav.setText(ctx.t('chores.nav'));
    this.buttons.forEach((b, i) => {
      const open = this.open(i);
      b.setText(`${i === this.sel ? '> ' : '  '}${ctx.t(`activity.${this.ids[i]}.title`)}${open ? '' : `  ✓ ${ctx.t('chores.done')}`}`)
        .setColor('#f6efdc');
      this.faces[i].sync(i === this.sel ? 'focus' : 'idle', open);
    });
  }

  retext() { this.render(); }

  confirm() {
    if (!this.open(this.sel)) return;
    const id = this.ids[this.sel];
    this.close();
    this.activities.start(id, this.player);
  }

  close() {
    if (this.stack.top() === this) this.stack.pop();
  }

  handleIntent(intent) {
    if (intent.pause) { this.close(); return; }
    const read = this.cursor.read(this.ctx.input.intents[this.player]);
    if (read.dy || read.dx) { this.sel = Math.max(0, Math.min(this.ids.length - 1, this.sel + read.dy + read.dx)); this.render(); return; }
    if (read.pick && read.pick <= this.ids.length) { this.sel = read.pick - 1; this.confirm(); return; }
    if (read.confirm) this.confirm();
  }

  destroy() {
    uiLeave(this.scene, this.ctx, this.objects);
  }
}
