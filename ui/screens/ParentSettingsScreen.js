import { ButtonMenu } from '../ButtonMenu.js';
import { uiText } from '../uiKit.js';
import { difficultyId, difficultyValue } from '../../services/parentLogic.js';

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
    const dim = scene.add.rectangle(0, 0, w, h, 0x000000, 0.8).setOrigin(0).setDepth(20).setInteractive();
    this.title = uiText(scene, w / 2, 26, '', { fontFamily: 'monospace', fontSize: '18px', color: '#ffe14d', stroke: '#000000', strokeThickness: 3 }).setOrigin(0.5).setDepth(21);
    this.hint = uiText(scene, w / 2, 48, '', { fontFamily: 'monospace', fontSize: '8px', color: '#b8d6e5', align: 'center', wordWrap: { width: w - 60 } }).setOrigin(0.5, 0).setDepth(21);
    this.objects = [dim, this.title, this.hint];
    const rows = [
      { caption: 'parent.difficulty', items: cfg.difficulties.map(d => ({ label: () => ctx.t(`parent.difficulty.${d.id}`), on: () => this.set('parentDifficulty', d.value), selected: () => difficultyId(cfg, this.flags.parentDifficulty ?? 1) === d.id })) },
      { caption: 'parent.chases', items: [false, true].map(off => ({ label: () => ctx.t(off ? 'parent.off' : 'parent.on'), on: () => this.set('chasesOff', off), selected: () => !!this.flags.chasesOff === off })) },
      { caption: 'parent.reminder', items: cfg.reminders.map(m => ({ label: () => (m ? ctx.t('parent.minutes', { n: m }) : ctx.t('parent.off')), on: () => this.set('playReminder', m), selected: () => (this.flags.playReminder ?? 0) === m })) },
      { items: [{ label: () => ctx.t('parent.back'), on: () => this.close() }] }
    ];
    this.menu = new ButtonMenu(scene, ctx.t, rows, w / 2, 98, 32);
    this.menu.objects.forEach(o => o.setDepth(21));
    this.retext();
  }

  retext() {
    this.title.setText(this.ctx.t('parent.title'));
    this.hint.setText(this.ctx.t('parent.hint'));
    this.menu.refresh();
  }

  close() {
    if (this.stack.top() === this) this.stack.pop();
  }

  handleIntent(intent) {
    if (intent.pause) this.close();
  }

  destroy() {
    this.menu.destroy();
    for (const o of this.objects) o.destroy();
  }
}

export { difficultyValue };
