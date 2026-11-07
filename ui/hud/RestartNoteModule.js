import { HudModule } from './HudModule.js';
import { uiText } from '../uiKit.js';

// Short "restart needed" banner while the page reloads for a render-resolution change (quality.js).
export class RestartNoteModule extends HudModule {
  constructor(scene, ctx, opts) {
    super(scene, ctx, opts);
    this.note = this.track(uiText(scene, ctx.res.w / 2, ctx.res.h - 40, '', {
      fontFamily: 'monospace', fontSize: '14px', color: '#000000', backgroundColor: '#ffe14d', padding: { x: 10, y: 6 }
    }).setOrigin(0.5).setDepth(100).setVisible(false));
    this.on('quality:restart', () => this.note.setText(ctx.t('quality.restart')).setVisible(true));
  }
}
