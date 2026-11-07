import { uiText } from '../../ui/uiKit.js';

const POOL = 6;

// Floating "+1" texts and a sparkle burst where something was scored. The texts are pooled; the sparkle is an
// emitter of the particle registry living in the minigame scene (ctx.particles.createFor), so it scales with the quality tier.
export class ScorePop {
  constructor(scene, ctx, depth = 40) {
    this.scene = scene;
    this.next = 0;
    this.texts = Array.from({ length: POOL }, () => uiText(scene, 0, 0, '', {
      fontFamily: 'monospace', fontSize: '12px', fontStyle: 'bold', color: '#ffe14d', stroke: '#000000', strokeThickness: 3
    }).setOrigin(0.5).setDepth(depth).setVisible(false));
    this.fx = ctx.particles.createFor(scene, 'spark', 0.2);
    this.fx.emitter.setDepth(depth - 1);
  }

  pop(x, y, str, { color = '#ffe14d', sparkle = 0 } = {}) {
    const text = this.texts[this.next];
    this.next = (this.next + 1) % POOL;
    this.scene.tweens.killTweensOf(text);
    text.setText(str).setColor(color).setPosition(x, y).setAlpha(1).setVisible(true);
    this.scene.tweens.add({ targets: text, y: y - 22, alpha: 0, duration: 800, ease: 'Quad.easeOut', onComplete: () => text.setVisible(false) });
    if (sparkle > 0) this.fx.burst(x, y, sparkle);
  }

  destroy() {
    for (const t of this.texts) { this.scene.tweens.killTweensOf(t); t.destroy(); }
    this.fx.emitter.destroy();
  }
}
