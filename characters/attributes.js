// Attribute maths for the playable characters (CAP-12). Pure: no Phaser, no state; the node check
// (scripts/check-characters.mjs) runs it directly. Numbers come from data/characters.json.

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// What the UI shows: attributes are stored fractionally, displayed as whole points.
export const displayValue = (v) => Math.round(v);

// The new attribute value after gaining `amount`: never past `cap` and never lowered (a value already above the cap stays).
export function grown(current, amount, cap, max) {
  return Math.max(current, Math.min(current + amount, cap, max));
}

// Fills `out` (reused, no allocation) with the gameplay numbers of a player's attributes (a `{wissen..zielen}` object)
// and perks. speed/accel/staminaSize/staminaRegen are multipliers (1 at the pivot), spread scales the slingshot
// scatter (aimPrecision perk cuts it further), assist scales the aim-assist cone.
export function computeMods(out, attrs, perks, cfg) {
  const m = cfg.modifiers;
  const d = (name) => (attrs[name] ?? m.pivot) - m.pivot;
  out.speed = 1 + m.tempo.speed * d('tempo');
  out.accel = 1 + m.tempo.accel * d('tempo');
  out.staminaSize = Math.max(0.2, 1 + m.ausdauer.staminaSize * d('ausdauer'));
  out.staminaRegen = Math.max(0.2, 1 + m.ausdauer.staminaRegen * d('ausdauer'));
  out.spread = Math.max(m.minSpread, 1 + m.zielen.spread * d('zielen')) * (1 - clamp(perks.aimPrecision ?? 0, 0, 1));
  out.assist = Math.max(0, 1 + m.zielen.assist * d('zielen'));
  return out;
}

// Perks with the defaults of data/characters.json filled in.
export function resolvePerks(def, cfg) {
  return { ...cfg.perkDefaults, ...(def?.perks ?? {}) };
}

// Bully target choice: the nearest player wins, but a player with a higher bullyTargetWeight counts as closer
// (distance divided by the weight), so Helena is picked more often. Smaller score = preferred target.
export const targetScore = (distSq, weight) => distSq / (weight * weight);

// The start vehicle a character really gets: ids without a player profile (or not listed in `playerVehicles`)
// fall back to foot.
export function resolveStartVehicle(id, cfg, profiles) {
  return cfg.playerVehicles.includes(id) && profiles[id] ? id : 'foot';
}

// The growth rule (if any) for an event payload, matching `filter` fields and `minDist`.
export function ruleMatches(rule, payload) {
  if (rule.filter) for (const k in rule.filter) if (payload[k] !== rule.filter[k]) return false;
  return rule.minDist === undefined || (payload.dist ?? 0) >= rule.minDist;
}

export const HAIR_STYLES = ['short', 'shoulder', 'wild'];

// Problems in the characters data (empty list when fine); used by the check script and cheap enough to keep honest.
export function validateCharacters(cfg) {
  const errors = [];
  const order = cfg.attributeOrder;
  for (const c of cfg.characters) {
    for (const a of order) {
      const v = c.attributes[a];
      if (!Number.isInteger(v) || v < 0 || v > cfg.attrMax) errors.push(`${c.id}: attribute ${a} must be an integer 0..${cfg.attrMax}`);
    }
    for (const a of Object.keys(c.attributes)) if (!order.includes(a)) errors.push(`${c.id}: unknown attribute ${a}`);
    for (const p of Object.keys(c.perks)) if (!(p in cfg.perkDefaults)) errors.push(`${c.id}: unknown perk ${p}`);
    for (const p of ['jacket', 'jacketDark', 'jacketLight', 'pants', 'hair', 'hairLight', 'frame', 'frameDark', 'backdrop']) {
      if (!c.palette[p]) errors.push(`${c.id}: palette.${p} missing`);
    }
    const l = c.look;
    if (!l || !HAIR_STYLES.includes(l.hairStyle) || typeof l.glasses !== 'boolean' || typeof l.freckles !== 'boolean' || !/^#[0-9a-f]{6}$/i.test(l.eyes ?? '')) errors.push(`${c.id}: look needs hairStyle (${HAIR_STYLES}), glasses, freckles and an eyes colour`);
    if (!(c.spriteScale > 0 && c.spriteScale <= 1.2)) errors.push(`${c.id}: spriteScale`);
  }
  return errors;
}
