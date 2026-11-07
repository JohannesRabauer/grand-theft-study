import { uiText } from '../uiKit.js';

// ?debug only (SCHULWEG_GAME.pushTestScreen): proves the screen stack. Counts the intents it receives and
// closes on the pause intent; `id` picks a freezing ("test") or non-freezing ("testHint") declaration.
export class TestScreen {
  constructor(scene, ctx, stack, id = 'test', depth = 30) {
    this.id = id;
    this.scene = scene;
    this.ctx = ctx;
    this.stack = stack;
    this.depth = depth;
    this.received = 0;
  }

  create() {
    const { scene, ctx } = this;
    const n = this.stack.size;
    this.box = scene.add.rectangle(ctx.res.w / 2, ctx.res.h / 2, 200, 40, 0x3355aa, 0.9).setDepth(this.depth);
    this.label = uiText(scene, ctx.res.w / 2, ctx.res.h / 2, `test screen ${n} (${this.id}) - Esc closes`, { fontFamily: 'monospace', fontSize: '8px', color: '#ffffff' }).setOrigin(0.5).setDepth(this.depth + 1);
  }

  handleIntent(intent) {
    this.received++;
    if (intent.pause && this.stack.top() === this) this.stack.pop();
  }

  destroy() {
    this.box.destroy();
    this.label.destroy();
  }
}
