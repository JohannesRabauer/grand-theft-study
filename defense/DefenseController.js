// The karate defense service (story 6.3, AD-24, CAP-19): ctx.defense.forPlayer(i) (also player.defense) is one kid's defense slot.
// Non-violent by design: a kid blocks, rolls out of the way or shouts a Kiai; bullies STUMBLE back (a scripted step, ai/BullyFSM.js,
// no force and no damage), pedestrians and animals only gasp, props are untouched. The rules are defense/defenseCore.js, the numbers
// data/karate.json (belt stats are a table; the kid's belt is state.players[i].karate.belt), the pictures defense/DefenseFx.js and
// scenes/DefenseArt.js.
//
// Intents: `defend` held = block (the guard drops after the belt's blockWindow or when Mut runs out), `defend` pressed while walking =
// dodge roll (invulnerable for the roll, cooldown), `kiai` pressed = shout stance. States IDLE, BLOCK, DODGE, KIAI, RECOVER (`slot.state`);
// `slot.mut` is the 0..1 courage pool, `slot.kiaiCd` / `slot.dodgeCd` the cooldowns left.
//  - Contact: the chase director asks `contact(player, bully)` before it catches. A dodge lets the bully pass; a block or parry (first
//    150 ms) bounces it back with a "Hmpf!" (`defense:blocked` { player, bully, perfect }, a parry also `defense:parry` and a little XP);
//    the Kiai stance sends it back too. Anything else is a normal catch.
//  - Kiai: every bully within the belt's kiaiRadius (times the kid's kiaiPower perk) that is after somebody stumbles (`bully:stumble` { bully, x, y, reason }); if at least
//    one did, the Ärger level drops by the belt's aergerReduction (boosted the same way, defense/beltCore.js boostedKiai) through ctx.chase.defend (only while the level is within
//    chase.json level.defendMaxLevel; level 0 stays 0). Emits `defense:kiai` { player, radius, affected: [bully ids] }. Pedestrians,
//    dogs and the like within the radius say "Oha!" and nothing else. The Kiai of either kid reaches bullies chasing either kid.
// Other events: `defense:state` { player, state } on every change, `defense:dodge` { player, x, y }, `defense:guard-down` { player }.
import { SpeechBubbles } from '../entities/SpeechBubbles.js';
import { ST, EV, beltStats, contactResult, createSlot, kiaiReach, resetSlot, tickSlot, walkMult } from './defenseCore.js';
import { DefenseFx } from './DefenseFx.js';
import { boostedKiai } from './beltCore.js';

const POSES = { BLOCK: 'block', DODGE: 'dodge', KIAI: 'kiai' };
const TAU = Math.PI * 2;

export class DefenseController {
  constructor(scene, ctx, cfg) {
    this.scene = scene;
    this.ctx = ctx;
    this.cfg = cfg;
    this.slots = Array.from({ length: ctx.maxPlayers }, () => createSlot());
    this.shown = Array.from({ length: ctx.maxPlayers }, () => ST.IDLE); // last state announced per player
    this.posed = Array.from({ length: ctx.maxPlayers }, () => '');
    this.inp = { defend: false, kiai: false, mx: 0, my: 0 };
    this.reach = { affected: [], gasp: [] };
    this.shout = { radius: 0, aerger: 0 };
    this.gaspLists = [];
    this.voices = [];
    this.stumbleOpts = { duration: 0, step: cfg.stumble.step, distance: 0, wobbleHz: cfg.stumble.wobbleHz, wobbleRad: cfg.stumble.wobbleRad };
    this.rand = Math.random;
    this.bubbles = new SpeechBubbles(scene, ctx, cfg.fx.maxBubbles, 'defenseBubbles');
    this.fx = new DefenseFx(scene, ctx, cfg);
    const { events } = ctx;
    events.on('player:caught', e => this.reset(e.player));
    events.on('player:vehicle', e => { this.posed[e.player] = null; }); // the new vehicle has its own texture: re-evaluate the pose
    events.on('chase:level', e => { if (e.level > 0) this.hint(); });
    events.on('lang:changed', () => this.fx.retext());
    ctx.defense = this;
    ctx.world.register(this);
  }

  forPlayer(index) { return this.slots[index]; }

  // The belt table row of a kid (state.players[i].karate.belt).
  stats(index) { return beltStats(this.cfg, this.ctx.state.players[index]?.karate?.belt); }

  loadMap() {}

  unloadMap() {
    for (let i = 0; i < this.slots.length; i++) this.reset(i);
    this.bubbles.clear();
  }

  reset(index) {
    resetSlot(this.slots[index]);
    this.shown[index] = ST.IDLE;
    const p = this.ctx.players[index];
    if (p) p.move.defenseMult = 1;
    this.setPose(index, p, '');
    this.fx.clear(index);
  }

  // The tip pops up the first time trouble starts (once per save: shared flag).
  hint() {
    const { ctx, cfg } = this;
    if (ctx.state.shared.flags[cfg.hint.flag]) return;
    ctx.state.dispatch('flags.set', { key: cfg.hint.flag });
    const type = ctx.input.type;
    ctx.events.emit('ui:toast', { key: type === 'touch' ? 'toast.defenseHintTouch' : type === 'gamepad' ? 'toast.defenseHintPad' : 'toast.defenseHint' });
  }

  update(dt) {
    const { ctx, cfg } = this;
    const { players } = ctx;
    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      const slot = this.slots[i];
      if (p.alive === false || p.pinned || p.grabbing) {
        if (slot.state !== ST.IDLE) this.reset(i);
        continue;
      }
      const intent = ctx.input.intents[i];
      const inp = this.inp;
      inp.defend = intent.defend;
      inp.kiai = intent.kiai;
      inp.mx = intent.move.x;
      inp.my = intent.move.y;
      const stats = this.stats(i);
      const ev = tickSlot(slot, stats, cfg, inp, dt);
      if (ev) this.started(i, p, ev, stats);
      if (slot.state !== this.shown[i]) {
        this.shown[i] = slot.state;
        ctx.events.emit('defense:state', { player: i, state: slot.state });
      }
      p.move.defenseMult = walkMult(slot, cfg);
      if (slot.state === ST.DODGE) this.roll(p, slot, stats);
      this.setPose(i, p, POSES[slot.state] ?? '');
      if (slot.state === ST.DODGE && this.posed[i] === 'dodge' && p.vehicle === 'foot') p.sprite.setRotation((slot.t / cfg.timing.dodgeTime) * TAU * cfg.fx.dodgeSpin * (slot.dirX < 0 ? -1 : 1));
      this.fx.update(i, p, slot.state === ST.BLOCK ? 1 - slot.t / stats.blockWindow : 0, dt);
    }
    this.dizzy(dt);
    this.bubbles.update(dt);
  }

  started(i, p, ev, stats) {
    const { ctx } = this;
    if (ev === EV.DODGE) {
      ctx.particles.emit('dust', p.x, p.y, { count: 6 });
      ctx.events.emit('defense:dodge', { player: i, x: p.x, y: p.y });
    } else if (ev === EV.KIAI) this.kiai(i, p, stats);
    else if (ev === EV.GUARD_DOWN) ctx.events.emit('defense:guard-down', { player: i });
  }

  // The roll moves the kid itself (its own body, like walking): fast at first, covering dodgeDistance over dodgeTime.
  roll(p, slot, stats) {
    const tm = this.cfg.timing;
    const speed = (2 * stats.dodgeDistance / tm.dodgeTime) * Math.max(0, 1 - slot.t / tm.dodgeTime);
    const v = p.move.matterVel;
    v.x = (slot.dirX * speed) / 60;
    v.y = (slot.dirY * speed) / 60;
    p.matter.body.setVelocity(p.body, v);
    p.move.speed = 0;
  }

  // Block and Kiai look: the kid's pose texture while on foot (on wheels the guard arc and the shout carry it).
  setPose(i, p, pose) {
    if (!p || this.posed[i] === pose) return;
    this.posed[i] = pose;
    if (!pose) {
      p.refreshLook();
      p.sprite.setRotation(0);
    } else if (p.vehicle === 'foot') p.sprite.setTexture(`player-${p.character?.id ?? 'kid'}-${pose}`);
  }

  // What a kid's speech bubble hangs on (the bubble pool wants x, y and `active`; a Player is not an active-flagged pooled thing).
  voice(p) {
    return this.voices[p.index] ??= { active: true, get x() { return p.x; }, get y() { return p.y - 8; } };
  }

  say(owner, key) { this.bubbles.say(owner, this.ctx.t(key), this.cfg.fx.bubbleSeconds); }

  // The Kiai's effect. Only bullies can stumble; everything else in range gasps.
  kiai(i, p, stats) {
    const { ctx, cfg, reach, shout } = this;
    boostedKiai(stats, p.perks.kiaiPower ?? 1, shout);
    const lists = this.gaspLists;
    lists.length = 0;
    if (ctx.crowd) lists.push(ctx.crowd.list, ctx.crowd.dogs);
    if (ctx.dogs) lists.push(ctx.dogs.list);
    kiaiReach(p.x, p.y, shout.radius, ctx.chase.bullies, lists, reach);
    const ids = [];
    for (const b of reach.affected) {
      if (!this.stumble(b, p, stats.stumbleDuration, cfg.stumble.kiaiDistance, 'kiai')) continue;
      ids.push(b.id);
      this.say(b, `defense.bullyKiai.${1 + ((this.rand() * 3) | 0)}`);
    }
    for (const o of reach.gasp) this.say(o, 'defense.gasp');
    this.fx.kiai(i, p, shout.radius);
    ctx.events.emit('defense:kiai', { player: i, radius: shout.radius, affected: ids });
    if (ids.length) ctx.chase.defend('kiai', shout.aerger);
  }

  stumble(b, p, duration, distance, reason) {
    const o = this.stumbleOpts;
    o.duration = duration;
    o.distance = distance;
    if (!this.ctx.chase.stumble(b, p.x, p.y, o, reason)) return false;
    this.ctx.particles.emit('stars', b.x, b.y - 10);
    b.starIn = this.cfg.stumble.starInterval;
    return true;
  }

  // The chase director's question when `bully` reaches player `index`: true when the contact was answered (block, parry, dodge, shout stance).
  contact(index, b) {
    const slot = this.slots[index];
    const res = slot ? contactResult(slot, this.cfg) : null;
    if (!res) return false;
    if (res === 'dodge') return true;
    const p = this.ctx.players[index];
    const { cfg, ctx } = this;
    const duration = this.stats(index).stumbleDuration;
    if (res === 'kiai') this.stumble(b, p, duration, cfg.stumble.kiaiDistance, 'kiai');
    else {
      const perfect = res === 'parry';
      this.stumble(b, p, duration * cfg.stumble.bounceScale, cfg.stumble.bounceDistance, res);
      this.say(b, 'defense.bully.block');
      this.say(this.voice(p), perfect ? 'defense.parry' : 'defense.block');
      ctx.events.emit('defense:blocked', { player: index, bully: b.id, perfect });
      if (perfect) {
        this.fx.parry(index, p);
        ctx.particles.emit('spark', p.x, p.y - 6);
        ctx.state.dispatch('xp.add', { player: index, amount: cfg.timing.parryXp });
        ctx.events.emit('defense:parry', { player: index, bully: b.id });
      }
    }
    return true;
  }

  // Dizzy stars circle above stumbling bullies.
  dizzy(dt) {
    const { ctx, cfg } = this;
    const chase = ctx.chase;
    for (const b of chase.bullies) {
      if (!b.active || b.state !== 'STUMBLE') continue;
      b.starIn -= dt;
      if (b.starIn > 0 || !chase.onScreen(b.x, b.y, 16)) continue;
      b.starIn = cfg.stumble.starInterval / ctx.quality.tier.particleMul;
      ctx.particles.emit('stars', b.x, b.y - 10, { count: 1 });
    }
  }
}
