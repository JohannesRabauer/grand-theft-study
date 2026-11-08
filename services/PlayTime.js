// The play-time reminder (story 11.4, ctx.playTime): counts the seconds the game actually ran in this session (not while a screen froze it)
// and, when the family set a reminder (flag playReminder, minutes; 0 = off), shows one friendly break message per interval through
// `show(minutesPlayed)`. It never stops the game or pushes: the message just waits to be read. Phaser-free.
import { dueReminders } from './parentLogic.js';

export class PlayTime {
  constructor(ctx, show) {
    this.ctx = ctx;
    this.show = show;
    this.seconds = 0;
    this.announced = 0;
    ctx.playTime = this;
  }

  get minutes() { return this.ctx.state.shared.flags.playReminder ?? 0; }

  update(dt) {
    if (this.ctx.frozen) return;
    this.seconds += dt;
    const due = dueReminders(this.seconds, this.minutes, this.announced);
    if (due > 0) {
      this.announced += due;
      this.ctx.events.emit('parent:reminder', { minutes: Math.round(this.seconds / 60) });
      this.show(Math.round(this.seconds / 60));
    }
  }

  // Changing the reminder starts counting its intervals from what has been played so far, so a new setting does not fire at once.
  reset() { this.announced = this.minutes ? Math.floor(this.seconds / (this.minutes * 60)) : 0; }
}
