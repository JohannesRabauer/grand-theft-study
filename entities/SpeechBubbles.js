// Pooled speech bubbles over pedestrians (AD-8, AD-15): a few Text objects created once, at most
// `maxBubbles` visible at a time. The caller passes already translated text (ctx.t). Owners are anything with x, y and `active`;
// each set of bubbles registers its pool under `name`. The kit look (story 16.14): a paper plate with the outline and bevel of the other
// plates and a small tail, drawn once per line; a bubble lives in the world, so it is lit like the world (the UI plates are not).
import { panelRects, notched } from '../ui/uiTheme.js';

export class SpeechBubbles {
  constructor(scene, ctx, max, name = 'bubbles') {
    const res = Math.round(ctx.res.scale * 2);
    this.tone = scene.cache.json.get('ui'); // glyphs are drawn at twice the screen scale (Text keeps its logical size); shown at 6 world px
    this.items = [];
    for (let i = 0; i < max; i++) {
      const text = scene.add.text(0, 0, '', {
        fontFamily: 'monospace', fontSize: '8px', color: this.tone.text.paper.text, padding: { x: 4, y: 3 }, resolution: res
      }).setOrigin(0.5, 1).setScale(0.75).setDepth(9500).setVisible(false);
      const frame = scene.add.graphics().setDepth(9499).setScale(0.75).setVisible(false);
      this.items.push({ text, frame, owner: null, left: 0 });
    }
    this.max = max;
    ctx.pools.register(name, { live: () => this.live(), cap: max });
  }

  live() {
    let n = 0;
    for (const b of this.items) if (b.owner) n++;
    return n;
  }

  // false when every bubble is busy (the line is simply not shown)
  say(owner, str, seconds) {
    let free = null;
    for (const b of this.items) {
      if (b.owner === owner) { free = b; break; }
      if (!b.owner && !free) free = b;
    }
    if (!free) return false;
    free.owner = owner;
    free.left = seconds;
    free.text.setText(str).setVisible(true);
    this.draw(free);
    free.frame.setVisible(true);
    return true;
  }

  // The plate fits the text (in the text's own, unscaled pixels) with a tail under its middle; the frame sits at the text's bottom centre.
  draw(b) {
    const w = Math.round(b.text.width);
    const h = Math.round(b.text.height);
    const { edge, tones } = this.tone;
    const g = b.frame.clear();
    const rects = [...panelRects(w, h, tones.paper, edge, { shadow: false }), ...notched(w / 2 - 2, h, 5, 3, edge), [w / 2 - 1, h, 3, 2, tones.paper.fill, 1]];
    for (const [x, y, rw, rh, color, a] of rects) g.fillStyle(parseInt(color.slice(1, 7), 16), a).fillRect(Math.round(x - w / 2), y - h, rw, rh);
  }

  hide(b) { b.text.setVisible(false); b.frame.setVisible(false); }

  release(owner) {
    for (const b of this.items) if (b.owner === owner) { b.owner = null; this.hide(b); }
  }

  clear() {
    for (const b of this.items) { b.owner = null; this.hide(b); }
  }

  update(dt) {
    for (const b of this.items) {
      if (!b.owner) continue;
      b.left -= dt;
      if (b.left <= 0 || !b.owner.active) { b.owner = null; this.hide(b); continue; }
      b.text.setPosition(b.owner.x, b.owner.y - 17);
      b.frame.setPosition(b.owner.x, b.owner.y - 17);
    }
  }
}
