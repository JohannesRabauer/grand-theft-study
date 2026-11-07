import { uiText } from '../uiKit.js';
import { formatTime } from '../../services/dayTime.js';
import { ChoiceCursor } from '../../minigames/minigameCore.js';

export class TimetableScreen {
  constructor(scene, ctx, school) {
    this.id = 'timetable';
    this.scene = scene;
    this.ctx = ctx;
    this.school = school;
    this.objects = [];
    this.cursors = ctx.players.map(() => new ChoiceCursor());
  }

  create() {
    const { scene, ctx } = this;
    const own = o => { this.objects.push(o); return o; };
    own(scene.add.rectangle(0, 0, ctx.res.w, ctx.res.h, 0x000000, 0.86).setOrigin(0).setDepth(40).setInteractive());
    own(scene.add.rectangle(24, 12, 432, 246, 0x1a2830).setOrigin(0).setDepth(41).setStrokeStyle(2, 0xe2bb65));
    const text = (x, y, size = 11, color = '#ffffff') => own(uiText(scene, x, y, '', {
      fontFamily: 'monospace', fontSize: `${size}px`, color
    }).setDepth(42));
    this.title = text(240, 28, 14, '#ffe14d').setOrigin(0.5);
    this.rows = this.school.schedule().lessons.map((_, i) => text(40, 52 + i * 23));
    this.hint = text(240, 201, 9, '#b8d6e5').setOrigin(0.5);
    this.button = text(240, 226, 11, '#ffe14d').setOrigin(0.5).setInteractive({ useHandCursor: true });
    this.button.on('pointerdown', () => this.attend());
    this.back = text(420, 242, 9).setOrigin(1, 0.5).setInteractive({ useHandCursor: true });
    this.back.on('pointerdown', () => this.close());
    this.retext();
  }

  retext() {
    const { ctx, school } = this;
    const schedule = school.schedule();
    this.title.setText(ctx.t('school.timetable', { day: ctx.day.day, weekday: ctx.t(schedule.name) }));
    this.rows.forEach((row, i) => {
      const lesson = schedule.lessons[i];
      const grades = ctx.players.map(p => {
        const record = school.recordFor(lesson, p.index);
        return record ? ctx.t('minigame.result.grade', { grade: record.grade }) : '-';
      }).join(' / ');
      row.setText(`${formatTime(lesson.start)}  ${ctx.t(`minigame.${lesson.minigame}.title`)}  ${grades}`);
      row.setColor(school.pendingPlayers(lesson).length ? '#ffffff' : '#9be58f');
    });
    this.hint.setText(ctx.t('school.wait'));
    this.button.setText(ctx.t(school.canAttend() ? 'school.attend' : school.next() ? 'school.closed' : 'school.finished'));
    this.back.setText(ctx.t('school.back'));
  }

  handleIntent(intent) {
    if (intent.pause) { this.close(); return; }
    for (let i = 0; i < this.cursors.length; i++) {
      if (this.cursors[i].read(this.ctx.input.intents[i]).confirm) { this.attend(); return; }
    }
  }

  attend() {
    if (!this.school.canAttend()) return;
    this.close();
    this.school.attend().catch(err => {
      console.warn(err.message);
      this.ctx.events.emit('ui:toast', { key: 'school.error' });
    });
  }

  close() { if (this.ctx.screens.top() === this) this.ctx.screens.pop(); }
  destroy() { for (const o of this.objects) o.destroy(); }
}
