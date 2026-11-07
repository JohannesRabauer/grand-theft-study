// Pooled speech bubbles over pedestrians (AD-8, AD-15): a few Text objects created once, at most
// `maxBubbles` visible at a time. The caller passes already translated text (ctx.t). Owners are anything with x, y and `active`;
// each set of bubbles registers its pool under `name`.
export class SpeechBubbles {
  constructor(scene, ctx, max, name = 'bubbles') {
    const res = Math.round(ctx.res.scale * 2); // glyphs are drawn at twice the screen scale (Text keeps its logical size); shown at 6 world px
    this.items = [];
    for (let i = 0; i < max; i++) {
      const text = scene.add.text(0, 0, '', {
        fontFamily: 'monospace', fontSize: '8px', color: '#16161e', backgroundColor: '#ffffff', padding: { x: 3, y: 2 }, resolution: res
      }).setOrigin(0.5, 1).setScale(0.75).setDepth(9500).setVisible(false);
      this.items.push({ text, owner: null, left: 0 });
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
    return true;
  }

  release(owner) {
    for (const b of this.items) if (b.owner === owner) { b.owner = null; b.text.setVisible(false); }
  }

  clear() {
    for (const b of this.items) { b.owner = null; b.text.setVisible(false); }
  }

  update(dt) {
    for (const b of this.items) {
      if (!b.owner) continue;
      b.left -= dt;
      if (b.left <= 0 || !b.owner.active) { b.owner = null; b.text.setVisible(false); continue; }
      b.text.setPosition(b.owner.x, b.owner.y - 17);
    }
  }
}
