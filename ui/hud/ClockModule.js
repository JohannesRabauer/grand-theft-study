import { HudModule } from './HudModule.js';
import { uiLabel, uiIcon, HudPlate } from '../uiKit.js';

// Top centre: a plate with the season icon, "HH:MM" and "Day n - phase", refreshed on `clock:tick` (read-only).
export class ClockModule extends HudModule {
  constructor(scene, ctx, opts) {
    super(scene, ctx, opts);
    const cx = ctx.res.w / 2;
    this.plate = new HudPlate(scene);
    this.plate.fit(cx - 46, 2, 92, 25);
    this.track(this.plate.g);
    this.icon = this.track(uiIcon(scene, cx - 38, 9, 'summer'));
    this.time = this.track(uiLabel(scene, cx - 22, 3, '', 'body', 'ink', { color: 'gold', fontStyle: 'bold' }));
    this.phase = this.track(uiLabel(scene, cx, 15, '', 'hud', 'ink', { color: 'blue' }).setOrigin(0.5, 0));
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
      this.icon.setFrame(day.season);
    }
  }

  retext() { this.show(); }
}
