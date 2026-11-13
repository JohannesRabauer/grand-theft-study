import { uiLabel, uiScreenFrame } from '../uiKit.js';
import { ChoiceCursor, lineFor, starsFor } from '../../minigames/minigameCore.js';

const DEPTH = 40;
const CARD = { x: 40, y: 14, w: 400, h: 242 };
const STAR = { y: 66, gap: 50, r: 17 };
const COLORS = { on: 0xffd36b, off: 0x3a4b68, edge: 0x16161e };

// The result screen of a minigame (AD-20, AD-27): score, stars drawn procedurally, the German grade with a kind headline,
// the funny line of the result band, XP and money, and "continue" (click, tap, confirm key or pad button of any
// player in the round). It sits on the 'minigame' screen, so the world stays frozen until it is closed.
export class MinigameResultScreen {
  constructor(scene, ctx, { result, cfg, onContinue }) {
    this.id = 'minigameResult';
    this.scene = scene;
    this.ctx = ctx;
    this.result = result;
    this.cfg = cfg;
    this.onContinue = onContinue;
    this.done = false;
    this.cursors = result.perPlayer.map(() => new ChoiceCursor());
    this.objects = [];
  }

  create() {
    const { scene, ctx, result } = this;
    const { w, h } = ctx.res;
    const own = o => { this.objects.push(o); return o; };
    const frame = uiScreenFrame(scene, ctx, { ...CARD, dimAlpha: 0.88, depth: DEPTH }); // the dim swallows clicks
    own(frame.dim);
    own(frame.panel);
    const cx = w / 2;
    const text = (y, size, color, extra = {}) => own(uiLabel(scene, cx, y, '', 'body', 'ink', {
      size, color, align: 'center', wordWrap: { width: CARD.w - 30 }, ...extra
    }).setOrigin(0.5).setDepth(DEPTH + 2));
    this.title = text(CARD.y + 18, 14, '#ffd36b');
    this.grade = text(112, 26, '#f6efdc', { fontStyle: 'bold' });
    this.headline = text(140, 12, '#9ddc7a');
    this.line = text(164, 10, '#8fd0ff');
    this.score = text(188, 10, '#f6efdc');
    this.rewards = text(202, 10, '#ffd36b');
    this.players = result.perPlayer.length > 1 ? result.perPlayer.map((_, i) => text(216 + i * 11, 8, '#b4c2d8')) : [];
    const earned = starsFor(result.score, this.cfg.stars);
    this.stars = this.cfg.stars.map((_, i) => {
      const star = own(drawStar(scene, cx + (i - 1) * STAR.gap, STAR.y, STAR.r, i < earned).setDepth(DEPTH + 2));
      if (i < earned) {
        star.setScale(0);
        scene.tweens.add({ targets: star, scale: 1, duration: 350, delay: 250 + i * 250, ease: 'Back.easeOut' });
      }
      return star;
    });
    this.button = own(uiLabel(scene, cx, CARD.y + CARD.h - 14, '', 'body', 'ink', { color: '#16161e', backgroundColor: '#e2b684', padding: { x: 12, y: 4 }, shadow: false }).setOrigin(0.5).setDepth(DEPTH + 2).setInteractive({ useHandCursor: true }));
    this.button.on('pointerdown', () => this.proceed());
    this.retext();
  }

  retext() {
    const { ctx, result } = this;
    const money = (cents) => {
      const v = (cents / 100).toFixed(2);
      return ctx.i18n.lang === 'de' ? v.replace('.', ',') : v;
    };
    this.title.setText(ctx.t(`minigame.${result.id}.title`));
    this.grade.setText(ctx.t('minigame.result.grade', { grade: result.grade }));
    this.headline.setText(ctx.t(`minigame.headline.${result.grade}`));
    this.line.setText(ctx.t(lineFor(result, this.cfg.bands)));
    this.score.setText(ctx.t('minigame.result.score', { correct: result.correct, total: result.total }));
    this.rewards.setText(`${ctx.t('minigame.result.xp', { xp: result.xp })}   ${ctx.t('minigame.result.money', { v: money(result.moneyCents) })}`);
    this.players.forEach((t, i) => {
      const p = result.perPlayer[i];
      const name = ctx.players[p.player].character?.name ?? ctx.t('menu.slot.player', { n: p.player + 1 });
      t.setText(`${name}: ${ctx.t('minigame.result.score', { correct: p.correct, total: p.total })}  ${ctx.t('minigame.result.grade', { grade: p.grade })}  ${ctx.t('minigame.result.xp', { xp: p.xp })}`);
    });
    this.button.setText(ctx.t('minigame.result.continue'));
  }

  // Any player's fresh confirm press continues (the cursors start "held", so the key that answered the last question does not).
  handleIntent() {
    const { intents } = this.ctx.input;
    for (let i = 0; i < this.cursors.length; i++) {
      if (this.cursors[i].read(intents[this.result.perPlayer[i].player]).confirm) this.proceed();
    }
  }

  proceed() {
    if (this.done) return;
    this.done = true;
    this.onContinue();
  }

  destroy() {
    for (const o of this.objects) {
      this.scene.tweens.killTweensOf(o);
      o.destroy();
    }
  }
}

// A five-pointed star as one Graphics object around its own origin: gold when earned, dark grey otherwise.
function drawStar(scene, x, y, r, on) {
  const points = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.45;
    points.push({ x: Math.cos(a) * rr, y: Math.sin(a) * rr });
  }
  const g = scene.add.graphics({ x, y });
  g.fillStyle(on ? COLORS.on : COLORS.off, 1).fillPoints(points, true);
  g.lineStyle(2, on ? COLORS.edge : 0x252a35, 1).strokePoints(points, true);
  return g;
}
