import { Tool, updateAimDir } from './Tool.js';
import { swingZone, swingHits, makeHits } from './swingLogic.js';

// The stick (story 6.2, CAP-17, AD-24): a close-range tool, third on the belt. toolUse (hold it for a swing every 0.35 s, tap it
// for one) swings it in an arc in the aim direction, with a visible swoosh. What it can hit is decided by a query of OBJECTS only
// (tools/swingLogic.js: props, bushes, doorbells and the pinata; people and animals are never candidates: no list of them is ever
// passed in and the query refuses any body that is not PROP or STATIC). Targets:
//   props    knock() with the stick's damage and push: crates and boxes smash (debris, maybe coins), cones and cans fly;
//   bushes   shake, leaves, once per day a loot drop (entities/Bushes.js);
//   doorbells ring: Ding-Dong and the ding-dong-run (entities/Doorbells.js);
//   pinata   whack by whack until it bursts (entities/Pinata.js).
// One instance per player. Events: `tool:swing` { player, x, y, dx, dy, hits } on every swing, `stick:hit` { player, kind, id } per target.
// The stick has no ammo; the HUD shows it as ready.
export class Stick extends Tool {
  constructor(scene, ctx, cfg, player) {
    super('stick');
    this.ctx = ctx;
    this.player = player;
    this.cfg = cfg.stick;
    this.max = 1;
    this.charging = false; // the HUD reads it for the wind arrow: a swing is never aimed with wind
    this.cool = 0;
    this.swing = 0; // seconds into the swoosh, 0 = not swinging
    this.dir = { x: 1, y: 0 };
    this.from = 0;
    this.zone = { x: 0, y: 0, dx: 1, dy: 0, reach: 0, cos: 0 };
    this.hits = makeHits(this.cfg.maxHits);
    this.shotInfo = { source: 'stick', player: player.index, dist: 0, damage: this.cfg.damage, knockMul: this.cfg.knockMul };
    this.fx = scene.add.graphics().setDepth(8900);
    this.fxOn = false;
    this.locateProp = (p, pt) => {
      if (!p.alive || !p.awake || p.body.isStatic) return false; // only what lies on the ground, never a prop perched up high
      pt.x = p.body.position.x;
      pt.y = p.body.position.y;
      pt.r = p.k.shape === 'circle' ? p.k.size : p.k.size * 0.5;
      return true;
    };
  }

  get ammo() { return 1; }

  get status() { return 'ready'; }

  equip() { this.ctx.events.emit('tool:ammo', { player: this.player.index, ammo: 1, max: 1 }); }

  unequip() { this.clearFx(); }

  update(dt, intent, equipped) {
    if (this.swing > 0) {
      this.swing += dt;
      if (this.swing >= this.cfg.swingSeconds) this.swing = 0;
      this.drawSwoosh();
    } else if (this.fxOn) this.clearFx();
    if (!equipped) return;
    this.cool -= dt;
    updateAimDir(this.dir, this.player, intent);
    if (intent.toolUse && this.cool <= 0) this.use();
  }

  // One swing along the current aim. Returns the number of targets hit.
  use() {
    const { player, cfg, ctx, zone, hits, dir } = this;
    this.cool = cfg.cooldown;
    this.swing = 1e-4;
    this.from = Math.atan2(dir.y, dir.x);
    swingZone(zone, cfg, player.x, player.y, dir.x, dir.y);
    hits.n = 0;
    swingHits(hits, zone, 'prop', ctx.props.props, this.locateProp);
    for (const kind of ['bush', 'doorbell', 'pinata']) {
      const t = ctx.swingTargets[kind];
      if (t) swingHits(hits, zone, kind, t.items, (it, pt) => t.locate(it, pt));
    }
    for (let i = 0; i < hits.n; i++) this.apply(hits.kinds[i], hits.items[i], hits.dist[i]);
    ctx.events.emit('tool:swing', { player: player.index, x: player.x, y: player.y, dx: dir.x, dy: dir.y, hits: hits.n });
    return hits.n;
  }

  apply(kind, item, dist) {
    const { ctx, player } = this;
    if (kind === 'prop') {
      // pushed away from the player, not along the swing: a crate beside the aim line still flies off sideways
      const x = item.body.position.x - player.x;
      const y = item.body.position.y - player.y;
      const m = Math.hypot(x, y) || 1;
      this.shotInfo.dist = dist;
      ctx.props.knock(item, x / m, y / m, this.shotInfo);
    } else if (kind === 'bush') ctx.swingTargets.bush.whack(item, player);
    else if (kind === 'doorbell') ctx.swingTargets.doorbell.ring(item, player);
    else ctx.swingTargets.pinata.whack(item, player);
    ctx.events.emit('stick:hit', { player: player.index, kind, id: item.id });
  }

  // The swoosh: a bright arc trailing the stick's tip as it sweeps across the zone.
  drawSwoosh() {
    const { cfg, player, zone } = this;
    const u = this.swing / cfg.swingSeconds;
    const half = Math.acos(zone.cos);
    const tip = this.from - half + 2 * half * u;
    const g = this.fx.clear();
    this.fxOn = true;
    g.lineStyle(cfg.swoosh, 0xffffff, 0.75 * (1 - u * 0.6));
    g.beginPath().arc(player.x, player.y, zone.reach * 0.85, Math.max(this.from - half, tip - half * 0.9), tip).strokePath();
    g.lineStyle(2, 0xb9854a, 1);
    g.lineBetween(player.x + Math.cos(tip) * 5, player.y + Math.sin(tip) * 5, player.x + Math.cos(tip) * zone.reach, player.y + Math.sin(tip) * zone.reach);
  }

  clearFx() {
    this.fx.clear();
    this.fxOn = false;
    this.swing = 0;
  }
}
