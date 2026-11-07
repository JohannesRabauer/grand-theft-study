// ctx.characters (CAP-12): dresses each Player with its character from the saved state and keeps the
// attribute-derived modifiers current. Phaser-free (it only sets fields on the players), so the node check
// drives it with plain objects.
//   apply(player)  reads state.players[i].character, sets player.character / perks / look / bullyWeight,
//                  scales the sprite (spriteScale), computes the modifiers and sets player.startVehicle ('foot', 'bike', 'skateboard' or 'skates'; GameScene mounts it).
//   refresh(player) recomputes player.mods after attributes changed and pushes them into the MovementController.
// player.mods is { speed, accel, staminaSize, staminaRegen, spread, assist }; player.attrs is the live
// (fractional) attribute object from the state.
import { computeMods, displayValue, resolvePerks, resolveStartVehicle } from './attributes.js';
import { AttrGrowth } from './AttrGrowth.js';

export class Characters {
  constructor(ctx, cfg, growthTable, profiles) {
    this.ctx = ctx;
    this.cfg = cfg;
    this.profiles = profiles;
    this.byId = Object.fromEntries(cfg.characters.map(c => [c.id, c]));
    this.growth = new AttrGrowth(ctx.events, ctx.state, growthTable, cfg.attrMax);
    ctx.events.on('state:changed', ev => {
      const m = /^players\.(\d+)\.attributes/.exec(ev.path);
      if (m && ctx.players[m[1]]) this.refresh(ctx.players[m[1]]);
    });
  }

  def(index) { return this.byId[this.ctx.state.players[index]?.character] ?? null; }

  apply(player) {
    const def = this.def(player.index);
    player.character = def;
    player.perks = resolvePerks(def, this.cfg);
    player.bullyWeight = player.perks.bullyTargetWeight;
    player.look = def ? { walk: `player-${def.id}`, bike: `player-${def.id}-bike`, skate: `player-${def.id}-skate`, skates: `player-${def.id}-skates`, scooter: `player-${def.id}-scooter`, rollerblades: `player-${def.id}-rollerblades` } : null;
    player.refreshLook();
    player.sprite.setScale(this.ctx.res.inv * (def?.spriteScale ?? 1)); // the younger kid is a bit smaller
    this.refresh(player);
    player.startVehicle = resolveStartVehicle(def?.startVehicle, this.cfg, this.profiles);
  }

  refresh(player) {
    const m = computeMods(player.mods, player.attrs, player.perks, this.cfg);
    const mv = player.move;
    mv.speedMult = m.speed;
    mv.accelMult = m.accel;
    mv.staminaSize = m.staminaSize;
    mv.staminaRegen = m.staminaRegen;
  }

  // Whole-point attributes for the UI.
  display(player) {
    const out = {};
    for (const a of this.cfg.attributeOrder) out[a] = displayValue(player.attrs[a]);
    return out;
  }
}
