// The belt colour on the kid's waist (story 6.4): one small tinted tag per player drawn over the walking sprite and the karate poses,
// in the town and in the dojo. The colour comes from the belt table of data/karate.json (state.players[i].karate.belt); the tag is
// hidden while the kid rides something (the sprite is then a bike or board seen from above), rolls, is caught or hidden away.
export class BeltTags {
  constructor(scene, ctx, cfg) {
    this.ctx = ctx;
    this.cfg = cfg;
    this.colors = Object.fromEntries(cfg.belts.map(b => [b.id, parseInt(b.color.slice(1), 16)]));
    this.tags = Array.from({ length: ctx.maxPlayers }, () => ({ image: scene.add.image(0, 0, 'belt-tag').setScale(ctx.res.inv).setOrigin(0.5, 0).setVisible(false), belt: '' }));
  }

  update() {
    const { ctx, cfg } = this;
    for (let i = 0; i < this.tags.length; i++) {
      const tag = this.tags[i];
      const p = ctx.players[i];
      const show = p && p.vehicle === 'foot' && p.alive !== false && !p.hid && !p.grabbing && !p.stumbling && p.sprite.visible && !cfg.beltTag.hiddenStates.includes(p.defense.state);
      if (tag.image.visible !== !!show) tag.image.setVisible(!!show);
      if (!show) continue;
      const belt = ctx.karate.beltOf(i);
      if (belt !== tag.belt) {
        tag.belt = belt;
        tag.image.setTint(this.colors[belt] ?? 0xffffff);
      }
      tag.image.setPosition(p.x, p.y + cfg.beltTag.dy).setDepth(p.y + 0.1);
    }
  }
}
