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
