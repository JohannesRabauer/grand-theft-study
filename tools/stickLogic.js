// Pure rules of the throwing stick (story 6.1, AD-24): throw range with power, perk and wind, which contacts count
// (only PROP and STATIC, a high arc passes over everything but things perched up high), where a stick lands and who can
// pick it up. No Phaser; the tool in tools/ThrowingStick.js and scripts/check-tools.mjs use it.
import { CAT } from '../physics/categories.js';
import { flightPoint } from './Slingshot.js';

const lerp = (a, b, t) => a + (b - a) * t;

// Distance in px of a throw with `power` (0..1) and the thrower's `stickThrowRange` perk, in calm air.
export function throwRange(cfg, power, perk) {
  return lerp(cfg.minRange, cfg.maxRange, power) * perk;
}

// Flight of a throw: `out` gets life (s), speed (px/s along the direction) and the wind acceleration (wx, wy in px/s^2),
// so that flightPoint(..., out.speed, out.wx, out.wy, t) is the path (AD-7). A heavier stick feels less wind, drag takes a share of it.
export function throwParams(out, cfg, power, perk, wind) {
  out.life = lerp(cfg.lifeMin, cfg.lifeMax, power);
  out.speed = throwRange(cfg, power, perk) / out.life;
  const accel = (cfg.windPush * (1 - cfg.drag)) / cfg.mass;
  out.wx = wind.x * accel;
  out.wy = wind.y * accel;
  return out;
}

// Height above the ground (px) at `u` (0..1) of the flight: from the hand up into an arc and down again.
export function heightAt(cfg, u) {
  return cfg.startHeight * (1 - u) + cfg.arcHeight * Math.sin(Math.PI * u);
}

// Does a contact with a body of category `cat` count while the stick is `height` px up? Only PROP and STATIC exist for it
// at all (people and animals never do); high up it passes over walls and things lying on the ground, but not over props
// stuck up high (`perched`: a frisbee in a tree, a can on a fence).
export function contactCounts(cfg, height, cat, perched) {
  if (cat === CAT.PROP) return perched || height <= cfg.clearHeight;
  if (cat === CAT.STATIC) return height <= cfg.clearHeight;
  return false;
}

// Where the stick comes to rest after flying for `t` seconds along `path` ({ sx, sy, dx, dy, speed, wx, wy }): that point, or,
// when it is in a wall, water or a tree, the last free point before it (back along the flight).
export function settle(out, path, t, isFree, steps = 24) {
  for (let i = 0; i <= steps; i++) {
    flightPoint(out, path.sx, path.sy, path.dx, path.dy, path.speed, path.wx, path.wy, t * (1 - i / steps));
    if (isFree(out.x, out.y)) return out;
  }
  out.x = path.sx;
  out.y = path.sy;
  return out;
}

// A stick lying on the ground ('landed') is picked up by its owner walking over it.
export function canPickup(stick, player, cfg) {
  return stick.state === 'landed' && stick.owner === player.index && !player.pinned && Math.hypot(player.x - stick.x, player.y - stick.y) <= cfg.pickupRadius;
}

// HUD status of the stick: ready in the hand, in flight, lying on the ground, or carried by a dog.
export function stickStatus(stick) {
  return { held: 'ready', flying: 'flying', landed: 'ground', carried: 'dog' }[stick.state];
}
