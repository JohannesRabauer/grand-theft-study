import { addPropLink } from '../physics/bodies.js';
import { CAT } from '../physics/categories.js';
import { playLayout, validatePlay } from './playLogic.js';

export class PlayObjects {
  constructor(scene, ctx, cfg) {
    if (!validatePlay(cfg)) throw new Error('invalid play catalog');
    this.scene = scene;
    this.ctx = ctx;
    this.cfg = cfg;
    this.groups = [];
    this.links = [];
    this.hints = Array.from({ length: ctx.maxPlayers }, () => scene.add.text(0, 0, '', {
      fontFamily: 'monospace', fontSize: '8px', color: '#d1f7ff', backgroundColor: '#243d46', resolution: ctx.res.scale
    }).setOrigin(0.5).setDepth(8100).setVisible(false));
    this.gfx = scene.add.graphics().setDepth(0);
    this.places = scene.add.graphics().setDepth(-1);
    ctx.play = this;
    this.loadMap();
    ctx.world.register(this);
  }

  loadMap() {
    const { ctx, cfg } = this;
    for (const o of ctx.map.objects.filter(o => o.type === 'play')) {
      const k = cfg.kinds[o.kind];
      const origins = playLayout(o, k, ctx.map.tileSize);
      const group = { o, k, origins, parts: [], time: 0, uses: 0, x: (o.x + 0.5) * ctx.map.tileSize, y: (o.y + 0.5) * ctx.map.tileSize };
      group.parts = origins.map((pos, i) => ctx.props.addPlay({ id: `${o.id}-${i}` }, k, pos.x, pos.y));
      for (const p of group.parts) p.playGroup = group;
      if (o.kind === 'floater') group.parts[0].body.collisionFilter.mask &= ~CAT.STATIC;
      if (k.tether) this.links.push({ link: addPropLink(this.scene, group.parts[0].body, o.kind === 'floater' ? origins[0] : group, null, k.tether), group });
      if (o.kind === 'bridge') {
        for (let i = 1; i < group.parts.length; i++) this.links.push({ link: addPropLink(this.scene, group.parts[i - 1].body, null, group.parts[i].body, k.spacing), group });
        for (const i of [0, group.parts.length - 1]) this.links.push({ link: addPropLink(this.scene, group.parts[i].body, origins[i], null, 0), group });
      }
      this.groups.push(group);
      const { x, y } = group;
      const art = this.places;
      if (o.kind === 'swing') art.lineStyle(3, 0x805839).lineBetween(x - 16, y + 24, x - 12, y).lineBetween(x + 16, y + 24, x + 12, y).lineBetween(x - 12, y, x + 12, y);
      if (o.kind === 'sign' || o.kind === 'flag') art.lineStyle(2, 0x805839).lineBetween(x, y, x, y + 20);
      if (o.kind === 'cart') {
        art.fillStyle(0x9a8767).fillTriangle(x - 12, y + 18, x + 80, y + 18, x - 12, y - 4);
        art.lineStyle(2, 0xe8c67b).lineBetween(x, y + 6, x + 50, y + 14).lineBetween(x + 42, y + 7, x + 50, y + 14);
      }
      if (o.kind === 'bridge') {
        for (const end of [origins[0], origins.at(-1)]) art.fillStyle(0x805839).fillRect(end.x - 2, end.y - 10, 4, 20);
      }
    }
    for (const o of ctx.map.objects) {
      const x = (o.x + 0.5) * ctx.map.tileSize, y = (o.y + 0.5) * ctx.map.tileSize;
      const art = this.places;
      if (o.type === 'shop' || o.type === 'bakery') {
        art.fillStyle(o.type === 'shop' ? 0x43747a : 0xc5874a).fillRect(x - 16, y - 20, 32, 28);
        art.fillStyle(0xf4deb0).fillRect(x - 13, y - 14, 26, 10);
        for (let i = 0; i < 4; i++) art.fillStyle(0xa7473d).fillRect(x - 16 + i * 8, y - 23, 4, 9);
      }
      if (o.type === 'pfand-machine') art.fillStyle(0x4a8761).fillRect(x - 5, y - 10, 10, 16).fillStyle(0x243d46).fillCircle(x, y - 5, 3);
      if (o.type === 'newsstand') art.fillStyle(0x8a5a3c).fillRect(x - 10, y - 8, 20, 14).fillStyle(0xf4deb0).fillRect(x - 8, y - 14, 16, 6).fillStyle(0xa7473d).fillRect(x - 10, y - 17, 20, 3);
      if (o.type === 'tram-stop' && o.id.startsWith('riverside')) art.lineStyle(2, 0x805839).lineBetween(x, y, x, y - 18).fillStyle(0xffdf65).fillCircle(x, y - 18, 5).lineStyle(1, 0x3d786c).strokeCircle(x, y - 18, 3);
    }
    ctx.props.cull();
  }

  unloadMap() {
    for (const { link } of this.links) this.scene.matter.world.removeConstraint(link);
    this.links = [];
    this.groups = [];
    this.gfx.clear();
    this.places.clear();
    for (const label of this.hints) label.setVisible(false);
  }

  activate(g, player) {
    const { ctx } = this;
    if (g.parts.some(p => !p.awake)) return false;
    // Reuse the same bodies: resetting a toy never creates debris or repeat rewards.
    for (let i = 0; i < g.parts.length; i++) {
      const p = g.parts[i];
      this.scene.matter.body.setPosition(p.body, g.origins[i]);
      this.scene.matter.body.setAngle(p.body, 0);
      this.scene.matter.body.setVelocity(p.body, { x: 0, y: 0 });
      ctx.props.sleeping.set(p.body, false);
    }
    const p = g.parts[g.o.kind === 'bridge' ? 2 : 0];
    const sideways = ['bridge', 'swing', 'sign', 'kite', 'flag', 'floater'].includes(g.o.kind);
    this.scene.matter.body.setVelocity(p.body, { x: sideways ? g.k.push * 0.3 : g.k.push, y: sideways ? g.k.push : 0 });
    g.time = 3;
    g.uses++;
    ctx.events.emit('play:used', { id: g.o.id, kind: g.o.kind, player: player.index });
    ctx.events.emit('ui:toast', { key: `play.feedback.${g.o.kind}` });
    ctx.particles.emit('spark', p.body.position.x, p.body.position.y, { count: 3 });
    player.vehicleSwapped = true;
    return true;
  }

  update(dt) {
    const { ctx, scene, gfx } = this;
    for (const p of ctx.players) {
      let best = null, distance = this.cfg.reach * this.cfg.reach;
      for (const g of this.groups) {
        let dx = p.x - g.x, dy = p.y - g.y;
        let d = dx * dx + dy * dy;
        for (const part of g.parts) {
          dx = p.x - part.body.position.x;
          dy = p.y - part.body.position.y;
          d = Math.min(d, dx * dx + dy * dy);
        }
        if (d <= distance) { best = g; distance = d; }
      }
      const label = this.hints[p.index];
      label.setVisible(!!best && p.vehicle === 'foot' && !p.pinned).setPosition(p.x, p.y - 26);
      if (best && (label.playTarget !== best || label.playDevice !== ctx.input.type || label.playLanguage !== ctx.i18n.lang)) {
        label.setText(`${ctx.t(`world.interact.${ctx.input.type === 'keyboard' && p.index === 1 ? 'keyboardP2' : ctx.input.type}`)} ${ctx.t(`play.name.${best.o.kind}`)}`);
        label.playTarget = best;
        label.playDevice = ctx.input.type;
        label.playLanguage = ctx.i18n.lang;
      }
      if (best && !p.pinned && p.vehicle === 'foot' && !p.vehicleSwapped && ctx.input.intents[p.index].interact) this.activate(best, p);
    }
    gfx.clear();
    for (const { link, group } of this.links) {
      if (!group.parts[0].awake) continue;
      const a = link.bodyA.position;
      const b = link.bodyB?.position ?? link.pointB;
      gfx.lineStyle(1, 0xd3b77b, 0.9).lineBetween(a.x, a.y, b.x, b.y);
    }
    for (const g of this.groups) {
      if (!g.parts[0].awake || g.time <= 0) continue;
      g.time = Math.max(0, g.time - dt);
      if (g.k.slope) {
        const b = g.parts[0].body;
        scene.matter.body.applyForce(b, b.position, { x: b.mass * g.k.slope / 1e6, y: 0 });
      }
    }
  }
}
