import { uiText } from '../../ui/uiKit.js';

// The shared round timer: a bar that drains left to right with the seconds left on it. It turns orange for the last
// `warnSeconds`. Cheap per frame: the scale is a single set, the text only changes once a second.
export class Timer {
  constructor(scene, { x, y, w, h, depth = 20, warnSeconds = 10 }) {
    this.warnMs = warnSeconds * 1000;
    this.seconds = -1;
    this.warn = null;
    this.bg = scene.add.rectangle(x, y, w, h, 0x1c1f27).setOrigin(0, 0.5).setDepth(depth);
    this.fill = scene.add.rectangle(x, y, w, h, 0x6fd08a).setOrigin(0, 0.5).setDepth(depth + 1);
    this.text = uiText(scene, x + w / 2, y, '', { fontFamily: 'monospace', fontSize: '8px', color: '#ffffff', stroke: '#000000', strokeThickness: 2 })
      .setOrigin(0.5).setDepth(depth + 2);
  }

  set(remainingMs, totalMs) {
    this.fill.setScale(Math.max(0, remainingMs / totalMs), 1);
    const seconds = Math.ceil(Math.max(0, remainingMs) / 1000);
    if (seconds !== this.seconds) {
      this.seconds = seconds;
      this.text.setText(String(seconds));
    }
    const warn = remainingMs <= this.warnMs;
    if (warn !== this.warn) {
      this.warn = warn;
      this.fill.setFillStyle(warn ? 0xff9d4d : 0x6fd08a);
    }
  }

  destroy() {
    this.bg.destroy();
    this.fill.destroy();
    this.text.destroy();
  }
}
