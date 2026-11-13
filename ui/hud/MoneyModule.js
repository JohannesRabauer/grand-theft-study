import { HudModule } from './HudModule.js';
import { uiLabel, uiIcon, HudPlate } from '../uiKit.js';

// A coin and "€ 5,00" on a small plate; changes come from `state:changed` (read-only). One player: under the status plate; shared with a
// second kid: once in the middle, under the clock.
export class MoneyModule extends HudModule {
  constructor(scene, ctx, opts) {
    super(scene, ctx, opts);
    this.plate = new HudPlate(scene);
    this.track(this.plate.g);
    this.icon = this.track(uiIcon(scene, 0, 0, 'coin'));
    this.text = this.track(uiLabel(scene, 0, 0, '', 'hud', 'ink', { color: 'gold' }));
    this.on('state:changed', (e) => { if (!e || e.path === '' || e.path === 'shared.money') this.show(); });
    this.show();
  }

  show() {
    const { ctx, plate } = this;
    const s = (ctx.state.shared.money / 100).toFixed(2);
    this.text.setText(ctx.t('hud.money', { v: ctx.i18n.lang === 'de' ? s.replace('.', ',') : s }));
    const w = Math.ceil(3 + 9 + 3 + this.text.width + 4);
    const x0 = this.players > 1 ? Math.round(ctx.res.w / 2 - w / 2) : 2;
    const y0 = this.players > 1 ? 29 : 42;
    plate.fit(x0, y0, w, 14);
    this.icon.setPosition(x0 + 3, y0 + 2);
    this.text.setPosition(x0 + 15, y0 + 2);
  }

  retext() { this.show(); }
}
