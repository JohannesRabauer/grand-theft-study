import { HudModule } from './HudModule.js';
import { uiText } from '../uiKit.js';

// "€ 5,00" in the HUD; changes come from `state:changed` (read-only).
export class MoneyModule extends HudModule {
  constructor(scene, ctx, opts) {
    super(scene, ctx, opts);
    this.text = this.track(uiText(scene, 4, 50, '', { fontFamily: 'monospace', fontSize: '8px', color: '#ffe14d' }));
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
