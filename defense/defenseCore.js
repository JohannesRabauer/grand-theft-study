// Pure rules of the karate defense (story 6.3, AD-24), no Phaser: the per-player state machine IDLE / BLOCK / DODGE / KIAI /
// RECOVER with Mut (courage) costs and cooldowns, how a bully contact is answered, whom a Kiai reaches, and the scripted
// step back of a stumbling bully. Numbers come from data/karate.json; scripts/check-defense.mjs drives all of it.
// Nothing here moves a body: a stumble is a distance over time that the bully applies as a plain position change (no force).
export const ST = { IDLE: 'IDLE', BLOCK: 'BLOCK', DODGE: 'DODGE', KIAI: 'KIAI', RECOVER: 'RECOVER' };

// What tickSlot reports for the frame (strings are constants, nothing is allocated).
export const EV = { BLOCK: 'block', DODGE: 'dodge', KIAI: 'kiai', GUARD_DOWN: 'guard-down' };

// Bully states a Kiai can reach: those that are on their way to the player. CAUGHT and GIVE_UP bullies are left alone.
const REACHABLE = new Set(['IDLE', 'CHASE', 'SEARCH', 'DISTRACTED']);

export function beltStats(cfg, id) {
  return cfg.belts.find(b => b.id === id) ?? cfg.belts.find(b => b.id === cfg.defaultBelt) ?? cfg.belts[0];
}

export function createSlot() {
  return { state: ST.IDLE, t: 0, mut: 1, regenIn: 0, kiaiCd: 0, dodgeCd: 0, invuln: 0, recoverFor: 0, dirX: 1, dirY: 0, prevDefend: false, prevKiai: false };
}

export function resetSlot(slot) {
  Object.assign(slot, createSlot());
}

function enter(slot, state, recoverFor = 0) {
  slot.state = state;
  slot.t = 0;
  slot.recoverFor = recoverFor;
}

function spend(slot, cfg, amount) {
  slot.mut = Math.max(0, slot.mut - amount);
  slot.regenIn = cfg.mut.regenDelay;
}

export function canKiai(slot, stats, cfg) {
  return slot.kiaiCd <= 0 && slot.mut >= cfg.mut.kiaiCost;
}

// One frame for one player. `inp` = { defend (held), kiai (pressed this frame), mx, my (walking direction) }; `slot` is mutated.
// A defend press while walking is a dodge roll (when it is ready), otherwise holding defend is a block. Returns an EV name when something started.
export function tickSlot(slot, stats, cfg, inp, dt) {
  const pressDefend = inp.defend && !slot.prevDefend;
  const pressKiai = inp.kiai && !slot.prevKiai;
  slot.prevDefend = inp.defend;
  slot.prevKiai = inp.kiai;
  slot.t += dt;
  slot.kiaiCd = Math.max(0, slot.kiaiCd - dt);
  slot.dodgeCd = Math.max(0, slot.dodgeCd - dt);
  slot.invuln = Math.max(0, slot.invuln - dt);
  slot.regenIn -= dt;
  if (slot.state !== ST.BLOCK && slot.regenIn <= 0) slot.mut = Math.min(1, slot.mut + cfg.mut.regen * dt);
  const tm = cfg.timing;

  if ((slot.state === ST.IDLE || slot.state === ST.BLOCK) && pressKiai && canKiai(slot, stats, cfg)) {
    spend(slot, cfg, cfg.mut.kiaiCost);
    slot.kiaiCd = stats.kiaiCooldown;
    enter(slot, ST.KIAI, tm.recoverTime);
    return EV.KIAI;
  }
  switch (slot.state) {
    case ST.IDLE: {
      if (!pressDefend) return null;
      const m = Math.hypot(inp.mx, inp.my);
      if (m >= tm.dodgeMinMove && slot.dodgeCd <= 0 && slot.mut >= cfg.mut.dodgeCost) {
        slot.dirX = inp.mx / m;
        slot.dirY = inp.my / m;
        spend(slot, cfg, cfg.mut.dodgeCost);
        slot.dodgeCd = stats.dodgeCooldown;
        slot.invuln = tm.dodgeTime + tm.dodgeGrace;
        enter(slot, ST.DODGE, tm.recoverTime);
        return EV.DODGE;
      }
      if (slot.mut >= cfg.mut.blockStartMin) {
        enter(slot, ST.BLOCK, tm.recoverTime);
        return EV.BLOCK;
      }
      return null;
    }
    case ST.BLOCK:
      slot.mut = Math.max(0, slot.mut - cfg.mut.blockDrain * dt);
      slot.regenIn = cfg.mut.regenDelay;
      if (!inp.defend) enter(slot, ST.RECOVER, tm.recoverTime);
      else if (slot.t >= stats.blockWindow || slot.mut <= 0) {
        enter(slot, ST.RECOVER, tm.guardDownRecover);
        return EV.GUARD_DOWN;
      }
      return null;
    case ST.DODGE:
      if (slot.t >= tm.dodgeTime) enter(slot, ST.RECOVER, slot.recoverFor);
      return null;
    case ST.KIAI:
      if (slot.t >= tm.kiaiTime) enter(slot, ST.RECOVER, slot.recoverFor);
      return null;
    default: // RECOVER
      if (slot.t >= slot.recoverFor) enter(slot, ST.IDLE);
      return null;
  }
}

// How the player answers a bully reaching them: 'dodge' (invulnerable roll, the bully passes), 'parry' (block in its first
// moments, free), 'block' (costs Mut), 'kiai' (the shout stance sends it back) or null (nothing: the bully catches). Spends Mut.
// A perfect parry gives the kid's Mut back by the belt's parryMut (story 6.5). Returns the new Mut.
export function parryRefund(slot, stats) {
  slot.mut = Math.min(1, slot.mut + (stats.parryMut ?? 0));
  return slot.mut;
}

export function contactResult(slot, cfg) {
  if (slot.invuln > 0) return 'dodge';
  if (slot.state === ST.KIAI) return 'kiai';
  if (slot.state !== ST.BLOCK || slot.mut < cfg.mut.blockCost) return null;
  if (slot.t <= cfg.timing.parryWindow) return 'parry';
  spend(slot, cfg, cfg.mut.blockCost);
  return 'block';
}

export const walkMult = (slot, cfg) => cfg.moveMult[slot.state] ?? 1;

// The Kiai's reach. `bullies` are the only candidates for a stumble (state must be one that is after the player; a bully
// object needs x, y, active, state, id); `gaspers` (arrays of pedestrians and animals with x, y, active) can only gasp.
// Fills out.affected (bully objects) and out.gasp (the others) and returns out.
export function kiaiReach(px, py, radius, bullies, gaspers, out) {
  out.affected.length = 0;
  out.gasp.length = 0;
  const r2 = radius * radius;
  for (let i = 0; i < bullies.length; i++) {
    const b = bullies[i];
    if (b.active && REACHABLE.has(b.state) && (b.x - px) * (b.x - px) + (b.y - py) * (b.y - py) <= r2) out.affected.push(b);
  }
  for (let k = 0; k < gaspers.length; k++) {
    const list = gaspers[k];
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      if (o.active && (o.x - px) * (o.x - px) + (o.y - py) * (o.y - py) <= r2) out.gasp.push(o);
    }
  }
  return out;
}

// Distance covered by a stumble `t` seconds in: it slows down over `step` seconds (ease out) and stays put afterwards.
export function stumbleOffset(t, step, dist) {
  const u = Math.min(1, Math.max(0, t / step));
  return dist * (1 - (1 - u) * (1 - u));
}

// How far to move during the frame [t, t + dt] (all of dist summed over the stumble).
export function stumbleDelta(t, dt, step, dist) {
  return stumbleOffset(t + dt, step, dist) - stumbleOffset(t, step, dist);
}

// The sprite's sway in radians: fades out over the whole stumble.
export function stumbleWobble(t, duration, hz, rad) {
  return Math.sin(t * hz * 2 * Math.PI) * rad * Math.max(0, 1 - t / duration);
}
