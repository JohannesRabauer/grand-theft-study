// Matter collision categories (AD-3). PROJECTILE masks only PROP | STATIC.
export const CAT = {
  PLAYER: 0x0001,
  BULLY: 0x0002,
  NPC: 0x0004,
  ANIMAL: 0x0008,
  PROP: 0x0010,
  STATIC: 0x0020,
  SENSOR: 0x0040,
  PROJECTILE: 0x0080
};

const ALL_SOLID = CAT.PLAYER | CAT.BULLY | CAT.NPC | CAT.ANIMAL | CAT.PROP | CAT.STATIC;

export const MASK = {
  PLAYER: CAT.NPC | CAT.PROP | CAT.STATIC | CAT.SENSOR, // rides through animals; NPC bodies are feather-light (data/npcs.json)
  BULLY: (ALL_SOLID & ~CAT.PLAYER & ~CAT.NPC & ~CAT.ANIMAL) | CAT.SENSOR, // contact with the player is a proximity check; bullies ignore pedestrians
  NPC: CAT.PLAYER | CAT.PROP | CAT.STATIC, // pedestrians pass each other, bullies and dogs
  ANIMAL: CAT.PROP | CAT.STATIC,
  PROP: ALL_SOLID | CAT.PROJECTILE,
  STATIC: ALL_SOLID | CAT.PROJECTILE,
  SENSOR: CAT.PLAYER | CAT.BULLY,
  PROJECTILE: CAT.PROP | CAT.STATIC
};
