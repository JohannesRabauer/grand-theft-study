import { parseTime } from './dayTime.js';

export function compileTimetable(raw, minigames, schoolPhase) {
  if (!raw.days?.length || !schoolPhase) throw new Error('school: timetable needs days and school hours');
  return raw.days.map(day => {
    if (day.lessons.length < 4 || day.lessons.length > 6) throw new Error('school: a day needs 4-6 lessons');
    const lessons = day.lessons.map((lesson, index) => {
      const def = minigames.find(d => d.id === lesson.minigame && !d.debug);
      if (!def) throw new Error(`school: unknown lesson minigame "${lesson.minigame}"`);
      const start = parseTime(lesson.start), end = parseTime(lesson.end);
      if (start < schoolPhase.start || end > schoolPhase.end || end <= start) throw new Error('school: lesson outside school hours');
      return { ...lesson, start, end, index, subject: def.subject };
    });
    if (lessons.some((l, i) => i && l.start < lessons[i - 1].end)) throw new Error('school: overlapping lessons');
    return { name: day.name, lessons };
  });
}

// The grade ledger is also the attendance record, so Continue cannot repeat a finished lesson.
export class SchoolDay {
  constructor(ctx, cfg, minigames) {
    this.ctx = ctx;
    this.cfg = cfg;
    this.days = compileTimetable(cfg, minigames, ctx.day.cfg.phases.find(p => p.id === 'school'));
    this.running = false;
    this.closed = false;
  }

  schedule(day = this.ctx.day.day) {
    const row = this.days[(day - 1) % this.days.length];
    return { name: row.name, lessons: row.lessons.map(l => ({ ...l, day, id: `school-${day}-${l.index + 1}` })) };
  }

  recordFor(lesson, player) {
    return this.ctx.state.players[player].grades.entries.find(e => e.lessonId === lesson.id && e.day === lesson.day);
  }

  pendingPlayers(lesson) {
    return this.ctx.players.filter(p => !this.recordFor(lesson, p.index)).map(p => p.index);
  }

  next() { return this.schedule().lessons.find(l => this.pendingPlayers(l).length) ?? null; }

  canAttend() {
    return !this.closed && !this.running && !this.ctx.minigames.active && this.ctx.world.id === this.cfg.map
      && ['morning', 'commute', 'school'].includes(this.ctx.day.phase) && !!this.next();
  }

  async attend() {
    const { ctx } = this;
    if (!this.canAttend()) throw new Error('school: no lesson available here now');
    const lesson = this.next();
    const players = this.pendingPlayers(lesson);
    this.running = true;
    try {
      while (ctx.day.phase !== 'school') ctx.day.advance('attend-school');
      ctx.day.skipTo(Math.max(ctx.day.minute, lesson.start), 'lesson-start');
      ctx.events.emit('lesson:started', { lesson, players });
      const notice = ctx.home?.lessonNotice(lesson, players);
      const result = await ctx.minigames.start(lesson.minigame, { players, context: 'lesson', lessonId: lesson.id, notice });
      if (this.closed || result.quit) return result;
      for (const p of result.perPlayer) {
        if (!ctx.grades.grade(p.player, lesson.subject, { ...p, difficulty: result.difficulty, lessonId: lesson.id })) {
          throw new Error(`school: could not record lesson for player ${p.player}`);
        }
      }
      ctx.events.emit('lesson:completed', { lesson, players });
      if (!this.next()) {
        ctx.day.advance('lessons-complete');
        ctx.events.emit('ui:toast', { key: 'school.finished' });
      } else {
        ctx.day.skipTo(Math.max(ctx.day.minute, lesson.end), 'lesson-end');
        if (ctx.saves?.activeSlot) ctx.saves.save(ctx.saves.activeSlot);
      }
      return result;
    } finally {
      this.running = false;
    }
  }
}
