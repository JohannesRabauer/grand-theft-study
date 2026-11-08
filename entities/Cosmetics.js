// Cosmetics on the players (story 10.1, ctx.cosmetics): the hat floats above the head, the ring glows under the feet.
// What each player wears is saved state (players[i].cosmetics.equipped, set by shop.buy / cosmetics.equip); this only
// draws it, with one pair of pooled sprites per player. Read-only for the world.
export class Cosmetics {
  constructor(scene, ctx) {
    this.scene = scene;
    this.ctx = ctx;
    this.slots = [];
    ctx.cosmetics = this;
  }

  pair(index) {
    if (!this.slots[index]) {
      const make = () => this.scene.add.image(0, 0, '__DEFAULT').setScale(this.ctx.res.inv).setVisible(false);
      this.slots[index] = { hat: make(), ring: make().setAlpha(0.85), t: index * 0.7 };
    }
    return this.slots[index];
  }

  wearing(index) { return this.ctx.state.players[index]?.cosmetics.equipped ?? {}; }

  update(dt) {
    const { ctx, scene } = this;
    for (const p of ctx.players) {
      const slot = this.pair(p.index);
      const eq = this.wearing(p.index);
      const show = p.alive !== false && p.sprite.visible && !p.hidden;
      slot.t += dt;
      const hat = eq.hat && show && scene.textures.exists(`cosm-${eq.hat}`);
      if (hat) {
        if (slot.hat.texture.key !== `cosm-${eq.hat}`) slot.hat.setTexture(`cosm-${eq.hat}`);
        slot.hat.setPosition(p.x, p.y - 17 - Math.sin(slot.t * 3) * 0.6).setDepth(p.sprite.depth + 2);
      }
      slot.hat.setVisible(!!hat);
      const ring = eq.ring && show && scene.textures.exists(`cosm-${eq.ring}`);
      if (ring) {
        if (slot.ring.texture.key !== `cosm-${eq.ring}`) slot.ring.setTexture(`cosm-${eq.ring}`);
        slot.ring.setPosition(p.x, p.y + 3).setDepth(p.sprite.depth - 1).setScale(ctx.res.inv * (1 + Math.sin(slot.t * 4) * 0.06));
      }
      slot.ring.setVisible(!!ring);
    }
  }
}
