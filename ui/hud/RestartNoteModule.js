import { HudModule } from './HudModule.js';
import { bindRestartNote } from '../uiKit.js';

// Short "restart needed" banner while the page reloads for a render-resolution change (quality.js).
export class RestartNoteModule extends HudModule {
  constructor(scene, ctx, opts) {
    super(scene, ctx, opts);
    bindRestartNote(scene, ctx.events, ctx.t, ctx.res);
  }
}
