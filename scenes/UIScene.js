import { setupUiCamera } from '../ui/uiKit.js';
import { createHud } from '../ui/hud/index.js';
import { ScreenStack } from '../ui/ScreenStack.js';
import { PauseScreen } from '../ui/screens/PauseScreen.js';
import { TestScreen } from '../ui/screens/TestScreen.js';
import { HintScreen } from '../ui/screens/HintScreen.js';
import { StickerAlbumScreen } from '../ui/screens/StickerAlbumScreen.js';
import { Hints } from '../services/Hints.js';

// Overlay host (AD-27): HUD modules from data/hud.json plus the screen stack. Reads only; never mutates
// the world (AD-13). The world is frozen through game:pause / game:resume, raised by the stack.
export class UIScene extends Phaser.Scene {
  constructor() { super('UI'); }

  create(data) {
    const ctx = data.ctx;
    this.ctx = ctx;
    const events = ctx.events;
    setupUiCamera(this, ctx.res);
    const cache = this.cache.json;
    this.hud = createHud(this, ctx, cache.get('hud'), 'play', { players: ctx.players.length, debug: !!window.SCHULWEG_DEBUG });
    this.hudList = [...this.hud.values()];
    this.screens = new ScreenStack(cache.get('screens'), (on) => events.emit(on ? 'game:pause' : 'game:resume'));
    ctx.screens = this.screens;
    // Story 11.5: contextual explanations open here (reading freezes the world until a fresh confirmation) and the
    // pause menu's Help pages through all of them. Read-only for the world, like the rest of this scene.
    const hintCfg = cache.get('hints');
    const inputCfg = cache.get('input');
    ctx.hints = new Hints(ctx, hintCfg, (def, audience, done) => {
      this.screens.push(new HintScreen(this, ctx, this.screens, { mode: 'hint', ids: [def.id], audience, inputCfg, onDone: confirmed => (confirmed ? done() : ctx.hints?.abandon()) }));
    });
    ctx.openHelp = () => this.screens.push(new HintScreen(this, ctx, this.screens, { mode: 'browse', ids: hintCfg.hints.map(h => h.id), index: 0, inputCfg }));
    ctx.openAlbum = () => this.screens.push(new StickerAlbumScreen(this, ctx, this.screens, ctx.stickers)); // story 10.3
    this.ducked = false;
    ctx.duckHud = (on) => { // AD-20: a minigame covers the HUD
      this.ducked = on;
      for (const m of this.hudList) m.setDucked(on);
      if (on) { // hide whatever the HUD is showing and remember exactly that
        this.duckedObjects = this.children.list.filter(o => o.visible);
        for (const o of this.duckedObjects) o.setVisible(false);
      } else {
        for (const o of this.duckedObjects ?? []) if (o.scene) o.setVisible(true);
        this.duckedObjects = null;
      }
    };

    // every visible text re-resolves when the language changes
    const onLang = () => {
      for (const m of this.hudList) m.retext();
      this.screens.retext();
    };
    const onToggle = () => this.togglePause();
    events.on('lang:changed', onLang);
    events.on('ui:pause-toggle', onToggle);
    if (window.SCHULWEG_DEBUG) window.SCHULWEG_GAME.pushTestScreen = (id) => this.screens.push(new TestScreen(this, ctx, this.screens, id));
    this.events.once('shutdown', () => {
      events.off('lang:changed', onLang);
      events.off('ui:pause-toggle', onToggle);
      this.screens.clear();
      ctx.hints?.destroy();
      delete ctx.hints;
      delete ctx.openHelp;
      delete ctx.openAlbum;
      for (const m of this.hudList) m.destroy();
      delete ctx.screens;
      delete ctx.duckHud;
    });
  }

  togglePause() {
    const { screens } = this;
    const top = screens.top();
    if (top?.id === 'pause') top.close();
    else if (!top || top.id === 'minigame') screens.push(new PauseScreen(this, this.ctx, screens));
  }

  update(time) {
    // Edge intents last one frame; the open screen consumes them, otherwise Esc / the touch button opens the pause screen.
    const intent = this.ctx.input.intent;
    if (!this.screens.route(intent) && intent.pause) this.togglePause();
    for (const m of this.hudList) if (!this.ducked || m.updatesWhileDucked) m.update(time);
  }
}
