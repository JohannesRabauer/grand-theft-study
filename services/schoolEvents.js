// Surprise events of the school day (story 8.4, ctx.schoolEvents): the homework check, a pop quiz and a substitute teacher.
// The schedule is a pure function of the data and the day number (a given game day always has the same surprises); the
// service turns it into events and the lines the lesson introduction shows. Phaser-free. See data/school-events.json.
export function rng(seed) {
  let s = (seed * 2654435761 + 12345) % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

// What happens on `day` with a timetable of `lessons` lessons: the lesson index of the pop quiz (or -1) and of the
// substitute teacher (or -1) and which substitute.
export function schedule(cfg, day, lessons) {
  const r = rng(cfg.seed * 1009 + day * 7919);
  const quiz = r() < cfg.popQuiz.chance && lessons > cfg.popQuiz.fromLesson;
  const quizAt = quiz ? cfg.popQuiz.fromLesson + Math.floor(r() * (lessons - cfg.popQuiz.fromLesson)) : -1;
  const sub = r() < cfg.substitute.chance;
  const names = cfg.substitute.names;
  const subAt = sub ? Math.min(cfg.substitute.lesson, lessons - 1) : -1;
  return { popQuiz: quizAt, substitute: subAt, substituteName: sub ? names[Math.floor(r() * names.length)] : null };
}

// Did this kid bring the homework? Players whose morning was never checked this day are given the benefit of the doubt.
export const forgotHomework = (morning, day, item) => morning.day === day && Array.isArray(morning.missing) && morning.missing.includes(item);

export class SchoolEvents {
  constructor(ctx, cfg) {
    this.ctx = ctx;
    this.cfg = cfg;
    this.checked = new Set(); // `${day}:${player}` homework checks already done
    this.enabled = () => !window.SCHULWEG_GAME?.schoolEventsOff; // test hook: the scripted school runs have no surprises
    ctx.schoolEvents = this;
  }

  scheduleFor(day = this.ctx.day.day) {
    return schedule(this.cfg, day, this.ctx.school.schedule(day).lessons.length);
  }

  who(index) { return this.ctx.players[index].character?.name ?? this.ctx.t('menu.slot.player', { n: index + 1 }); }

  // The lines to show before this lesson (translated) and the events they come with; null when events are switched off.
  before(lesson, players) {
    if (!this.enabled()) return null;
    const { ctx, cfg } = this;
    const sched = this.scheduleFor(lesson.day);
    const lines = [];
    if (sched.substitute === lesson.index) {
      const n = sched.substituteName;
      lines.push(ctx.t('school.event.substitute', { name: ctx.t(`school.sub.${n}.name`), quirk: ctx.t(`school.sub.${n}.quirk`) }));
      ctx.events.emit('school:substitute', { day: lesson.day, name: n, lesson: lesson.id });
    }
    if (lesson.index === cfg.homeworkCheck.lesson) {
      for (const player of players) {
        const key = `${lesson.day}:${player}`;
        if (this.checked.has(key)) continue;
        this.checked.add(key);
        const forgot = forgotHomework(ctx.state.players[player].morning, lesson.day, cfg.homeworkCheck.item);
        lines.push(ctx.t(forgot ? 'school.event.homework.forgot' : 'school.event.homework.ok', { who: this.who(player) }));
        ctx.events.emit(forgot ? 'homework:forgotten' : 'homework:done', { player });
      }
    }
    return { lines };
  }

  // After this lesson comes a pop quiz of the same subject.
  popQuiz(lesson) {
    return this.enabled() && this.scheduleFor(lesson.day).popQuiz === lesson.index;
  }
}
