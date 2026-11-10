// The small animals of the town (story 12.5, ctx.critters, data/critters.json): pigeons, cats and ducks from the map objects `critter`. They are
// drawn with small canvas pictures made once and have no physics body at all, so nothing can hit them. Pigeons and cats flee from kids and
// fast vehicles, ducks gather when a kid on foot feeds them (interact). Emits `critter:scatter` { kind, id }, `critter:back` { kind, id } and
// `duck:fed` { player, ducks }.
import { C, Critter } from '../services/critterLogic.js';

function makeTextures(scene, res) {
  const s = res.scale;
  const make = (key, w, h, draw) => {
    if (scene.textures.exists(key)) return;
    const tex = scene.textures.createCanvas(key, w * s, h * s);
    const c = tex.getContext();
    c.scale(s, s);
    draw(c);
    tex.refresh();
  };
  const r = (c, col, x, y, w, h) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
  make('critter-pigeon', 10, 8, c => { r(c, '#8d949e', 2, 3, 6, 4); r(c, '#6b7480', 1, 4, 2, 2); r(c, '#a9b1bb', 6, 1, 3, 3); r(c, '#f0b24a', 9, 2, 1, 1); r(c, '#1b1b1b', 8, 2, 1, 1); r(c, '#5a6068', 4, 7, 1, 1); r(c, '#5a6068', 6, 7, 1, 1); });
  // story 16.20: a sitting cat in profile: tail curled up behind, striped back, pale chest and paws, pointed ears, green eyes
  make('critter-cat', 12, 10, c => {
    const o = '#d9873a', d = '#b96a26', l = '#f2c38a', k = '#3a2416';
    r(c, k, 3, 3, 6, 1); r(c, k, 2, 4, 1, 5); r(c, k, 9, 4, 1, 1);                                  // dark edge behind and above the body
    r(c, d, 1, 8, 4, 1); r(c, d, 0, 5, 1, 3); r(c, d, 1, 4, 1, 1); r(c, k, 0, 4, 1, 1);               // tail curling up behind
    r(c, o, 3, 4, 6, 5); r(c, o, 4, 3, 4, 1);                                                          // body
    r(c, d, 4, 4, 1, 3); r(c, d, 6, 4, 1, 3); r(c, d, 3, 8, 6, 1);                                     // stripes and the shaded belly
    r(c, l, 7, 6, 2, 3); r(c, l, 7, 9, 2, 1); r(c, l, 3, 9, 2, 1);                                     // pale chest and paws
    r(c, o, 8, 2, 4, 4); r(c, d, 8, 1, 1, 1); r(c, o, 8, 1, 1, 1); r(c, o, 10, 1, 1, 1); r(c, d, 10, 0, 1, 1); // head, ears
    r(c, l, 10, 4, 2, 2); r(c, '#6bd06b', 9, 3, 1, 1); r(c, '#6bd06b', 11, 3, 1, 1);                   // muzzle and eyes
    r(c, '#e08a8a', 11, 4, 1, 1); r(c, k, 10, 3, 1, 1);
  });
  make('critter-duck', 10, 8, c => { r(c, '#f2d24a', 2, 3, 6, 4); r(c, '#f2d24a', 6, 1, 3, 3); r(c, '#e58a2a', 9, 2, 1, 1); r(c, '#1b1b1b', 8, 2, 1, 1); r(c, '#cfae2c', 1, 4, 2, 2); r(c, 'rgba(255,255,255,0.4)', 1, 7, 8, 1); });
}

export class Critters {
  constructor(scene, ctx, cfg) {
    this.scene = scene;
    this.ctx = ctx;
    this.cfg = cfg;
    this.list = [];
    this.sprites = [];
    this.feedRest = 0;
    this.away = { x: 0, y: 0 };
    this.label = scene.add.text(0, 0, '', { fontFamily: 'monospace', fontSize: '8px', color: '#fff2a8', backgroundColor: '#243d46', resolution: ctx.res.scale }).setOrigin(0.5).setDepth(8100).setVisible(false);
    makeTextures(scene, ctx.res);
    ctx.critters = this;
    ctx.world.register(this);
    this.loadMap();
  }

  loadMap() {
    const { ctx, scene } = this;
    const ts = ctx.map.tileSize;
    this.list = [];
    this.sprites = [];
    if (ctx.map.indoor) return;
    ctx.map.objects.filter(o => o.type === 'critter').forEach((o, i) => {
      const c = new Critter(o.kind, this.cfg[o.kind], (o.x + 0.5) * ts, (o.y + 0.5) * ts, i);
      this.list.push(c);
      this.sprites.push(scene.add.image(c.x, c.y, `critter-${o.kind}`).setScale(ctx.res.inv).setOrigin(0.5, 0.9));
    });
  }

  unloadMap() {
    for (const s of this.sprites) s.destroy();
    this.sprites = [];
    this.list = [];
    this.label.setVisible(false);
  }

  // The distance from a point to the nearest kid on foot or rider that would startle an animal there; fills this.away with the direction away from it.
  threat(x, y) {
    let best = Infinity;
    for (const p of this.ctx.players) {
      if (!p.alive) continue;
      const d = Math.hypot(p.x - x, p.y - y);
      const reach = p.vehicle !== 'foot' && p.move.velSpeed > this.cfg.vehicleSpeed ? d * 0.6 : d; // a fast rider startles them from farther away
      if (reach < best) { best = reach; this.away.x = x - p.x; this.away.y = y - p.y; }
    }
    return best;
  }

  update(dt) {
    const { ctx } = this;
    if (!this.list.length) return;
    this.feedRest -= dt;
    for (let i = 0; i < this.list.length; i++) {
      const c = this.list[i];
      const near = c.kind === 'duck' ? Infinity : this.threat(c.x, c.y);
      const ev = c.update(dt, near, this.away.x, this.away.y);
      if (ev === 'scatter') ctx.events.emit('critter:scatter', { kind: c.kind, id: c.id });
      else if (ev === 'back') ctx.events.emit('critter:back', { kind: c.kind, id: c.id });
      const s = this.sprites[i];
      s.setVisible(c.visible);
      if (!c.visible) continue;
      if (c.kind === 'duck' && (c.ripple -= dt) <= 0) { // a duck on the pond leaves rings behind it (water ripples, story 16.8)
        c.ripple = this.cfg.duck.rippleEvery;
        const v = this.scene.cameras.main.worldView;
        if (c.x > v.x - 16 && c.x < v.right + 16 && c.y > v.y - 16 && c.y < v.bottom + 16) ctx.particles.emit('ripple', c.x, c.y + 2);
      }
      const bob = c.state === C.IDLE && c.kind === 'pigeon' ? Math.max(0, Math.sin(c.phase)) * 1.5 : 0;
      const flap = c.state === C.FLEE ? Math.sin(c.phase * 4) * 0.25 : 0;
      s.setPosition(c.x, c.y - c.lift - bob).setDepth(c.y + c.lift * 0.1 + 2).setAlpha(c.state === C.BACK ? 0.8 : 1).setRotation(flap);
      s.setFlipX(c.dx < 0 || (c.kind === 'duck' && Math.cos(c.phase * 0.6) < 0));
    }
    this.duckPrompt();
  }

  // Interact near the pond with ducks in it: feed them.
  duckPrompt() {
    const { ctx } = this;
    const radius = this.cfg.duck.feedRadius;
    for (const p of ctx.players) {
      const near = p.alive && !p.pinned && p.vehicle === 'foot' && !ctx.screens?.top() && this.feedRest <= 0 && this.list.some(d => d.kind === 'duck' && Math.hypot(p.x - d.x, p.y - d.y) <= radius);
      const label = p.index === 0 ? this.label : null;
      label?.setVisible(near);
      if (!near) continue;
      if (ctx.input.intents[p.index].interact && !p.vehicleSwapped) { label?.setVisible(false); this.feed(p); continue; }
      if (label) {
        label.setPosition(p.x, p.y - 24);
        const text = `${ctx.t(`world.interact.${ctx.input.type}`)} ${ctx.t('critter.feed')}`;
        if (label.text !== text) label.setText(text);
      }
    }
  }

  feed(p) {
    const { ctx } = this;
    let n = 0;
    for (const d of this.list) if (d.kind === 'duck' && d.feed(p.x, p.y)) { n++; ctx.particles.emit('heart', d.x, d.y - 6, { count: 2 }); }
    if (!n) return false;
    this.feedRest = this.cfg.duck.feedCooldown;
    ctx.events.emit('duck:fed', { player: p.index, ducks: n });
    ctx.events.emit('ui:toast', { key: 'critter.fed' });
    return true;
  }
}
