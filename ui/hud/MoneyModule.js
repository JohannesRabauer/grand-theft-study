import { HudModule } from './HudModule.js';
import { uiText } from '../uiKit.js';

// "€ 5,00" in the HUD; changes come from `state:changed` (read-only).
export class MoneyModule extends HudModule {
  constructor(scene, ctx, opts) {
    super(scene, ctx, opts);
    const style = { fontFamily: 'monospace', fontSize: '8px', color: '#ffe14d' };
    // shared, so with two players it sits once under the clock instead of under P1's status
    this.text = this.track(this.players > 1 ? uiText(scene, ctx.res.w / 2, 25, '', style).setOrigin(0.5, 0) : uiText(scene, 4, 50, '', style));
    this.on('state:changed', (e) => { if (!e || e.path === '' || e.path === 'shared.money') this.show(); });
    this.show();
  }

  show() {
    const { ctx } = this;
    const s = (ctx.state.shared.money / 100).toFixed(2);
    this.text.setText(ctx.t('hud.money', { v: ctx.i18n.lang === 'de' ? s.replace('.', ',') : s }));
  }

  retext() { this.show(); }
}
