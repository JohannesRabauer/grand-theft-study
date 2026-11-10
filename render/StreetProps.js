// Street props in the world (story 16.9, AD-31). The standing set dressing of render/streetMath.js (planters, bollards, hydrants,
// letterboxes, recycling bins, parked bikes, street signs, the kiosk and the Pfand machine) as y-sorted images. A fixed pool of
// images (the tier's `streetProps`, made at map load so the display list never grows while playing) is lent to the props near the
// view and taken back when they leave it; the props are static, so the check runs a few times a second. Props never collide.
import { STREET_ATLAS, frameKey, FRAME_SIZE } from '../scenes/StreetArt.js';
import { outdoorInfo } from '../scenes/BuildingArt.js';
import { mapSeed } from '../scenes/GroundArt.js';
import { streetInfo } from './streetMath.js';

export class StreetProps {
  constructor(scene, ctx, cfg) {
    this.scene = scene;
    this.ctx = ctx;
    this.cfg = cfg;
    this.props = [];
    this.free = [];
    this.acc = 0;
    ctx.world.register(this);
    this.loadMap();
  }

  loadMap() {
    const { ctx, scene, cfg } = this;
    const { map } = ctx;
    if (map.indoor) return;
    const info = streetInfo(map, mapSeed(map, ctx.world.id), outdoorInfo(map, ctx.world.id), cfg);
    this.props = info.props;
    const n = Math.min(ctx.quality.tier.streetProps ?? 0, this.props.length);
    this.free = Array.from({ length: n }, () => scene.add.image(0, 0, STREET_ATLAS, frameKey('hydrant', 0)).setScale(ctx.res.inv).setVisible(false));
    for (const p of this.props) p.img = null;
    this.acc = cfg.tick;
  }

  unloadMap() {
    for (const p of this.props) { p.img?.destroy(); p.img = null; }
    for (const i of this.free) i.destroy();
    this.free.length = 0;
    this.props = [];
  }

  update(dt) {
    if (!this.props.length) return;
    this.acc += dt;
    if (this.acc < this.cfg.tick) return;
    this.acc = 0;
    const v = this.scene.cameras.main.worldView;
    const m = this.cfg.margin;
    const x0 = v.x - m, x1 = v.right + m, y0 = v.y - m, y1 = v.bottom + m + 20;
    const free = this.free;
    for (const p of this.props) {
      const seen = p.x > x0 && p.x < x1 && p.y > y0 && p.y < y1;
      if (seen && !p.img) {
        const img = free.pop();
        if (!img) continue; // pool exhausted: this one stays bare until another leaves
        const h = FRAME_SIZE[p.kind][1];
        img.setFrame(frameKey(p.kind, p.v)).setOrigin(0.5, (h - 2) / h).setPosition(p.x, p.y).setDepth(p.depth).setVisible(true);
        p.img = img;
      } else if (!seen && p.img) {
        p.img.setVisible(false);
        free.push(p.img);
        p.img = null;
      }
    }
  }
}
