import { uiText } from '../uiKit.js';
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
    own(scene.add.rectangle(0, 0, ctx.res.w, ctx.res.h, 0x12151c).setOrigin(0).setDepth(40).setInteractive());
    const text = (y, size, color, wrap) => own(uiText(scene, ctx.res.w / 2, y, '', {
      fontFamily: 'monospace', fontSize: `${size}px`, color, align: 'center',
      ...(wrap ? { wordWrap: { width: ctx.res.w - 50 } } : {})
    }).setOrigin(0.5).setDepth(41));
    this.title = text(28, 14, '#ffe14d');
    this.message = text(112, 11, '#ffe7ac', true);
    this.hint = text(195, 9, '#b8d6e5', true);
    this.buttons = this.session.players.map((player, i) => {
      const button = own(uiText(scene, ctx.res.w * (i + 1) / (this.session.players.length + 1), 224, '', {
        fontFamily: 'monospace', fontSize: '10px', color: '#ffe14d', backgroundColor: '#243b44',
        padding: { x: 8, y: 4 }
      }).setOrigin(0.5).setDepth(41).setInteractive({ useHandCursor: true }));
      button.on('pointerdown', () => this.confirm(player));
      return button;
    });
    this.back = text(251, 9, '#ffffff').setInteractive({ useHandCursor: true });
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

  destroy() { for (const o of this.objects) o.destroy(); }
}
