import { HudModule } from './HudModule.js';
import { uiText } from '../uiKit.js';
import { drawSeasonIcon } from '../seasonIcon.js';

// Top centre: season icon, "HH:MM" and "Day n - phase", refreshed on `clock:tick` (read-only).
export class ClockModule extends HudModule {
  constructor(scene, ctx, opts) {
    super(scene, ctx, opts);
    const cx = ctx.res.w / 2;
    const style = { fontFamily: 'monospace', fontSize: '10px', color: '#ffffff', stroke: '#000000', strokeThickness: 2 };
    this.icon = this.track(scene.add.graphics().setPosition(cx - 30, 9));
    this.time = this.track(uiText(scene, cx - 20, 2, '', style));
    this.phase = this.track(uiText(scene, cx, 15, '', { ...style, fontSize: '8px', color: '#cfe7ff' }).setOrigin(0.5, 0));
    this.season = null;
    this.on('clock:tick', () => this.show());
    this.show();
  }

  show() {
    const { ctx } = this;
    const { day } = ctx;
    this.time.setText(day.time);
    this.phase.setText(`${ctx.t('hud.day', { n: day.day })} - ${ctx.t(`day.phase.${day.phase}`)}`);
    if (day.season !== this.season) {
      this.season = day.season;
      drawSeasonIcon(this.icon, day.season);
    }
  }

  retext() { this.show(); }
}
