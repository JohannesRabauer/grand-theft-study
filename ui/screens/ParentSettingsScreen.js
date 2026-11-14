import { ButtonMenu } from '../ButtonMenu.js';
import { uiLabel, uiLeave, uiScreenFrame } from '../uiKit.js';
import { difficultyId, difficultyValue } from '../../services/parentLogic.js';
import { ageFlag, difficultyAge } from '../../services/ageLogic.js';
import { effectsItems } from '../settingsRows.js';

// The parent settings (story 11.4), behind the gate: the learning difficulty, whether bullies chase at all and the play-time reminder.
// Each choice is saved in the family's flags at once (parentDifficulty, chasesOff, playReminder) and takes effect straight away.
export class ParentSettingsScreen {
  constructor(scene, ctx, stack, cfg) {
    this.id = 'parentSettings';
    this.scene = scene;
    this.ctx = ctx;
    this.stack = stack;
    this.cfg = cfg;
    this.objects = [];
  }

  get flags() { return this.ctx.state.shared.flags; }

  set(key, value) {
    const { ctx } = this;
    ctx.state.dispatch('flags.set', { key, value });
    if (key === 'chasesOff') ctx.chase.setChasesEnabled(!value);
    if (key === 'playReminder') ctx.playTime?.reset();
    ctx.events.emit('parent:setting', { key, value });
    this.menu.refresh();
  }

  create() {
    const { scene, ctx, cfg } = this;
    const { w, h } = ctx.res;
    const frame = uiScreenFrame(scene, ctx, { x: 18, y: 6, w: w - 36, h: h - 12, dimAlpha: 0.8, depth: 20 });
    this.title = uiLabel(scene, w / 2, 26, '', 'heading', 'ink', { size: 18 }).setOrigin(0.5).setDepth(21);
    this.hint = uiLabel(scene, w / 2, 44, '', 'small', 'ink', { align: 'center', wordWrap: { width: w - 50 } }).setOrigin(0.5, 0).setDepth(21);
    this.objects = [frame.dim, frame.panel, this.title, this.hint];
    const rows = [
      { caption: 'parent.difficulty', items: cfg.difficulties.map(d => ({ label: () => ctx.t(`parent.difficulty.${d.id}`), on: () => this.set('parentDifficulty', d.value), selected: () => difficultyId(cfg, this.flags.parentDifficulty ?? 1) === d.id })) },
      { caption: 'parent.chases', items: [false, true].map(off => ({ label: () => ctx.t(off ? 'parent.off' : 'parent.on'), on: () => this.set('chasesOff', off), selected: () => !!this.flags.chasesOff === off })) },
      { caption: 'parent.reminder', items: cfg.reminders.map(m => ({ label: () => (m ? ctx.t('parent.minutes', { n: m }) : ctx.t('parent.off')), on: () => this.set('playReminder', m), selected: () => (this.flags.playReminder ?? 0) === m })) },
      { caption: 'parent.sound', items: [false, true].map(off => ({ label: () => ctx.t(off ? 'parent.off' : 'parent.on'), on: () => this.set('audioMuted', off), selected: () => !!this.flags.audioMuted === off })) },
      { caption: 'parent.effects', items: effectsItems(ctx).map(it => ({ ...it, on: () => { it.on(); this.menu.refresh(); } })) },
      ...ctx.players.map(p => ({ caption: `parent.age.p${p.index + 1}`, items: [null, ...ctx.learning.cfg.ageMap.choices].map(a => ({ label: () => (a === null ? ctx.t('parent.age.auto', { n: ctx.characters?.def(p.index)?.age ?? '?' }) : ctx.t('parent.age.years', { n: a })), on: () => this.set(ageFlag(p.index), a), selected: () => (a === null ? !ctx.learning.cfg.ageMap.choices.includes(this.flags[ageFlag(p.index)]) : this.flags[ageFlag(p.index)] === a) })) })),
      { items: [{ label: () => ctx.t('parent.back'), on: () => this.close() }] }
    ];
    this.menu = new ButtonMenu(scene, ctx.t, rows, w / 2, rows.length > 4 ? 104 : 108, rows.length > 7 ? 20 : rows.length > 4 ? 24 : 32);
    this.menu.objects.forEach(o => o.setDepth(21));
    this.objects.push(...this.menu.objects);
    this.retext();
  }

  retext() {
    this.title.setText(this.ctx.t('parent.title'));
    this.hint.setText(`${this.ctx.t('parent.hint')}
${this.ctx.t('parent.age.explain')}`);
    this.menu.refresh();
  }

  close() {
    if (this.stack.top() === this) this.stack.pop();
  }

  handleIntent(intent) {
    if (intent.pause) this.close();
  }

  destroy() {
    this.menu.release();
    uiLeave(this.scene, this.ctx, this.objects);
  }
}

export { difficultyValue };
