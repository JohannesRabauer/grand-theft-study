import { uiText } from '../ui/uiKit.js';

// Co-op player markers (AD-18): a coloured ring under each player (P1 cyan, P2 orange, data/camera.json coop.ringColors),
// drawn once and only moved afterwards; with ?debug also a "P1"/"P2" tag. Nothing exists while only one player is in the game.
export class PlayerMarkers {
  constructor(scene, ctx, cfg) {
    this.scene = scene;
    this.ctx = ctx;
    this.colors = cfg.ringColors.map(c => parseInt(c.slice(1), 16));
    this.rings = [];
    this.tags = [];
  }

  add(index) {
    const { scene } = this;
    const color = this.colors[index % this.colors.length];
    this.rings[index] = scene.add.graphics().fillStyle(color, 0.22).fillEllipse(0, 0, 22, 12).lineStyle(1.5, color, 0.9).strokeEllipse(0, 0, 22, 12);
    if (window.SCHULWEG_DEBUG) {
      this.tags[index] = uiText(scene, 0, 0, `P${index + 1}`, { fontFamily: 'monospace', fontSize: '8px', color: `#${color.toString(16).padStart(6, '0')}`, stroke: '#000000', strokeThickness: 2 }).setOrigin(0.5, 1);
    }
  }

  update() {
    const { players } = this.ctx;
    if (players.length < 2) return;
    for (const p of players) {
      if (!this.rings[p.index]) this.add(p.index);
      const ring = this.rings[p.index];
      const hidden = p.hid; // a hidden player's ring would give the hiding spot away
      ring.setVisible(!hidden).setPosition(p.x, p.y + 3).setDepth(p.y - 0.5);
      const tag = this.tags[p.index];
      if (tag) tag.setVisible(!hidden).setPosition(p.x, p.y - 24).setDepth(p.y + 1);
    }
  }
}
