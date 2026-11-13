import { uiLabel, uiLeave, uiScreenFrame, paintRects, uiCfg } from '../uiKit.js';
import { faceTone, panelRects } from '../uiTheme.js';
import { ChoiceCursor } from '../../minigames/minigameCore.js';

// The achievements and streaks of one kid (story 10.4): unlocked ones in gold with their funny names, the others grey with how far
// along they are; the three streaks with the current and the best run. Up / down choose (the description is shown below), Q / E switch
// to the other kid's page in co-op, Esc closes. Read-only.
const ROWS = 10;

export class AchievementsScreen {
  constructor(scene, ctx, stack, service, player = 0) {
    this.id = 'achievements';
    this.scene = scene;
    this.ctx = ctx;
    this.stack = stack;
    this.service = service;
    this.player = player;
    this.sel = 0;
    this.objects = [];
    this.cursors = ctx.players.map(() => new ChoiceCursor());
  }

  create() {
    const { scene, ctx } = this;
    const { w, h } = ctx.res;
    const own = o => { this.objects.push(o); return o; };
    const frame = uiScreenFrame(scene, ctx, { dimAlpha: 0.95 });
    own(frame.dim);
    own(frame.panel);
    const text = (x, y, size, color, wrap) => own(uiLabel(scene, x, y, '', 'body', 'ink', { size, color, ...(wrap ? { wordWrap: { width: wrap } } : {}) }).setDepth(43));
    this.title = text(w / 2, 16, 14, '#ffd36b').setOrigin(0.5, 0);
    this.owner = text(w / 2, 33, 9, '#9ddc7a').setOrigin(0.5, 0);
    this.streaks = text(30, 47, 8, '#ffd36b', w - 60);
    const cfg = uiCfg(scene);
    this.cursorBar = own(scene.add.graphics().setDepth(42));
    paintRects(this.cursorBar, panelRects(204, 14, faceTone(cfg.button.idle.face, cfg.edge, cfg.tones.ink.accent), cfg.edge, { shadow: false }));
    paintRects(this.cursorBar, [[2, 3, 2, 8, cfg.button.focus.face, 1]]);
    const per = this.service.cfg.achievements.length;
    this.rows = Array.from({ length: per }, (_, i) => {
      const col = Math.floor(i / ROWS);
      const x = 30 + col * 214;
      const y = 68 + (i % ROWS) * 14;
      const name = text(x + 4, y + 2, 9, '#f6efdc');
      const prog = text(x + 198, y + 3, 7, '#b4c2d8').setOrigin(1, 0);
      const hit = own(scene.add.rectangle(x, y, 204, 14, 0xffffff, 0.001).setOrigin(0).setDepth(44).setInteractive({ useHandCursor: true }));
      hit.on('pointerdown', () => { this.sel = i; this.render(); });
      return { name, prog, x, y };
    });
    this.desc = text(30, 214, 9, '#f6efdc', w - 60);
    this.nav = text(w / 2, h - 26, 8, '#b4c2d8').setOrigin(0.5, 0);
    this.render();
  }

  who() { const p = this.ctx.players[this.player]; return p?.character?.name ?? this.ctx.t('menu.slot.player', { n: this.player + 1 }); }

  render() {
    const { ctx, service } = this;
    const list = service.cfg.achievements;
    this.title.setText(ctx.t('achievements.title'));
    this.owner.setText(ctx.t('achievements.owner', { who: this.who(), n: service.unlockedCount(this.player), total: list.length }));
    this.streaks.setText(`${ctx.t('achievements.streaks')}: ${service.cfg.streaks.map(s => { const st = service.streak(s.id, this.player); return `${ctx.t(`streak.${s.id}.name`)} ${ctx.t('achievements.days', { n: st.n })} (${ctx.t('achievements.best', { n: st.best })})`; }).join('  |  ')}`);
    list.forEach((a, i) => {
      const row = this.rows[i];
      const done = service.unlocked(a.id, this.player);
      row.name.setText(`${done ? '* ' : '  '}${ctx.t(`ach.${a.id}.name`)}`).setColor(done ? '#ffd36b' : '#b4c2d8');
      row.prog.setText(done ? '' : ctx.t('achievements.progress', { n: Math.min(service.count(a.id, this.player), a.n), total: a.n }));
    });
    const sel = this.rows[this.sel];
    this.cursorBar.setPosition(sel.x, sel.y);
    const a = list[this.sel];
    this.desc.setText(`${ctx.t(`ach.${a.id}.name`)}: ${ctx.t(`ach.${a.id}.desc`)}`);
    this.nav.setText(ctx.t('achievements.nav'));
  }

  retext() { this.render(); }

  close() {
    if (this.stack.top() === this) this.stack.pop();
  }

  handleIntent(intent) {
    if (intent.pause) { this.close(); return; }
    const total = this.service.cfg.achievements.length;
    for (const p of this.ctx.players) {
      const i = this.ctx.input.intents[p.index];
      const read = this.cursors[p.index].read(i);
      if ((i.toolNext || i.toolPrev) && this.ctx.players.length > 1) {
        this.player = (this.player + (i.toolNext ? 1 : -1) + this.ctx.players.length) % this.ctx.players.length;
        this.render();
        return;
      }
      if (read.dx || read.dy) {
        const next = this.sel + read.dy + read.dx * ROWS;
        if (next >= 0 && next < total) { this.sel = next; this.render(); }
        return;
      }
    }
  }

  destroy() {
    uiLeave(this.scene, this.ctx, this.objects);
  }
}
