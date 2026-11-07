// Gamepad navigation for menu screens: polls the pads each frame and reports 'left' | 'right' | 'confirm'.
// `which()` returns the pad indices that may steer this screen (ui/menuFlow.js menuPads). Menu-only, like ButtonMenu's keys.
import { padAction } from './menuFlow.js';

export class PadNav {
  constructor(scene, which, onAction) {
    this.scene = scene;
    this.which = which;
    this.onAction = onAction;
    this.prev = {};
    this.poll = () => this.update();
    scene.events.on('update', this.poll);
  }

  update() {
    const gp = this.scene.input.gamepad;
    if (!gp) return;
    for (const k of this.which(gp.gamepads.length)) {
      const pad = gp.gamepads[k];
      if (!pad) continue;
      const a = padAction(pad, this.prev[k] ??= {});
      if (a) this.onAction(a);
    }
  }

  destroy() {
    this.scene.events.off('update', this.poll);
  }
}
