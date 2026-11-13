import { uiLabel, uiLeave, uiScreenFrame, uiFace } from '../uiKit.js';
import { ChoiceCursor } from '../../minigames/minigameCore.js';

export class MinigameIntroductionScreen {
  constructor(scene, ctx, session, onContinue, onCancel) {
    this.id = 'minigameIntroduction';
    this.scene = scene;
    this.ctx = ctx;
    this.session = session;
    this.onContinue = onContinue;
    this.onCancel = onCancel;
    this.objects = [];
    this.ready = new Set();
    this.cursors = session.players.map(() => new ChoiceCursor());
  }

  create() {
    const { scene, ctx } = this;
    const own = o => { this.objects.push(o); return o; };
    const frame = uiScreenFrame(scene, ctx, { x: 14, y: 14, w: ctx.res.w - 28, h: ctx.res.h - 28, dimAlpha: 1 });
    own(frame.dim);
    own(frame.panel);
    const text = (y, size, color, wrap) => own(uiLabel(scene, ctx.res.w / 2, y, '', 'body', 'ink', {
      size, color, align: 'center',
      ...(wrap ? { wordWrap: { width: ctx.res.w - 50 } } : {})
    }).setOrigin(0.5).setDepth(41));
    this.title = text(28, 14, '#ffd36b');
    this.message = text(112, 11, '#f6efdc', true);
    this.hint = text(195, 9, '#b4c2d8', true);
    this.faces = [];
    this.buttons = this.session.players.map((player, i) => {
      const button = own(uiLabel(scene, ctx.res.w * (i + 1) / (this.session.players.length + 1), 224, '', 'body', 'ink', {
        padding: { x: 8, y: 4 }, shadow: false
      }).setOrigin(0.5).setDepth(41).setInteractive({ useHandCursor: true }));
      this.faces.push(own(uiFace(scene, button)));
      button.on('pointerdown', () => this.confirm(player));
      return button;
    });
    this.back = text(251, 9, '#f6efdc').setInteractive({ useHandCursor: true });
    this.back.on('pointerdown', this.onCancel);
    this.retext();
  }

  retext() {
    const { ctx, session } = this;
    this.title.setText(ctx.t(`minigame.${session.def.id}.title`));
    this.message.setText(ctx.t(session.notice.key, session.notice.params));
    this.hint.setText(ctx.t('minigame.introduction.read'));
    this.buttons.forEach((b, i) => {
      const player = session.players[i];
      const who = ctx.players[player].character?.name ?? ctx.t('menu.slot.player', { n: player + 1 });
      b.setText(ctx.t(this.ready.has(player) ? 'minigame.introduction.ready' : 'minigame.introduction.continue', { who }));
      this.faces[i].sync(this.ready.has(player) ? 'selected' : 'focus');
    });
    this.back.setText(ctx.t('school.back'));
  }

  confirm(player) {
    this.ready.add(player);
    if (this.ready.size === this.session.players.length) this.onContinue();
    else this.retext();
  }

  handleIntent(intent) {
    if (intent.pause) { this.onCancel(); return; }
    for (let i = 0; i < this.cursors.length; i++) {
      if (this.cursors[i].read(this.ctx.input.intents[this.session.players[i]]).confirm) {
        this.confirm(this.session.players[i]);
        if (this.ready.size === this.session.players.length) return;
      }
    }
  }

  destroy() { uiLeave(this.scene, this.ctx, this.objects); }
}
