// Flags from map objects (type "flag"): a pole and a cloth built from a few segments that
// streams along the wind (AD-7: the flag reads ctx.wind.vector and animates itself).
// Weak wind lets the cloth droop short; strong wind stretches and ripples it.
// Only flags near the camera are animated.
export class Flags {
  constructor(scene, ctx, cfg) {
    this.scene = scene;
    this.ctx = ctx;
    this.cfg = cfg;
    this.t = 0;
    const ts = ctx.map.tileSize;
    this.flags = ctx.map.objects.filter(o => o.type === 'flag').map(o => {
      const x = (o.x + 0.5) * ts;
      const y = (o.y + 0.5) * ts;
      const top = y - cfg.poleHeight;
      const objs = [scene.add.image(x, y, 'flag-pole').setOrigin(0.5, 1).setScale(ctx.res.inv).setDepth(y)];
      const segs = [];
      const color = parseInt(o.color.slice(1), 16);
      for (let i = 0; i < cfg.segments; i++) {
        const s = scene.add.image(x, top, 'flag-seg').setOrigin(0, 0).setScale(ctx.res.inv).setTint(i % 2 ? color : color + 0x101010).setDepth(y + 0.1);
        segs.push(s);
        objs.push(s);
      }
      return { x, y, top, segs, objs, dir: 1 };
    });
  }

  update(dt) {
    const { wind } = this.ctx;
    const view = this.scene.cameras.main.worldView;
    this.t += dt;
    const c = this.cfg;
    for (const f of this.flags) {
      const near = f.x > view.x - 32 && f.x < view.right + 32 && f.y > view.y - 32 && f.y < view.bottom + 64;
      if (!near) { if (f.objs[0].visible) f.objs.forEach(o => o.setVisible(false)); continue; }
      if (!f.objs[0].visible) f.objs.forEach(o => o.setVisible(true));
      const s = wind.strength;
      f.dir += (Math.sign(wind.vector.x || 1) - f.dir) * Math.min(1, dt * c.turn);
      const reach = c.segWidth * (0.35 + 0.65 * s); // horizontal step per segment
      const amp = c.wave * (0.2 + s);
      for (let i = 0; i < f.segs.length; i++) {
        const seg = f.segs[i];
        const along = (i + (f.dir < 0 ? 1 : 0)) * reach * f.dir;
        const wave = Math.sin(this.t * c.speed * (0.6 + s) - i * 0.9) * amp * (i + 1) / f.segs.length;
        seg.setPosition(f.x + along, f.top + wave + (1 - s) * i * c.droop);
      }
    }
  }
}
