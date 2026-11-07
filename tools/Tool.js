// Tool interface (AD-3): the ToolBelt owns the list, equips one at a time and calls update every
// frame with the input intent. A tool may only act on props and static things, never on people
// or animals (its bodies use categories that do not collide with them).
export class Tool {
  constructor(id) { this.id = id; }
  equip() {}
  unequip() {}
  update(dt, intent, equipped) {}
  use(...args) {}
}

// Aim at the pointer / stick point; without one, face the way the player last walked. Updates the unit vector `dir`.
export function updateAimDir(dir, player, intent) {
  const ax = intent.aim ? intent.aim.x - player.x : intent.move.x;
  const ay = intent.aim ? intent.aim.y - player.y : intent.move.y;
  const m = Math.hypot(ax, ay);
  if (m > (intent.aim ? 4 : 0.2)) {
    dir.x = ax / m;
    dir.y = ay / m;
  }
}
