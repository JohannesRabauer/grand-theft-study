// Shop rules (story 10.1, AD-22), Phaser-free so the state actions, the screen and node checks share them.
// See data/shop.json for the item types.
export const TYPES = ['vehicle', 'snack', 'cosmetic', 'upgrade', 'ticket', 'activity'];

export const itemById = (cfg, id) => cfg.items.find(i => i.id === id) ?? null;
export const shopItems = (cfg, shopId) => (cfg.shops[shopId] ?? []).map(id => itemById(cfg, id)).filter(Boolean);

export const upgradeKey = item => `upgrade.${item.id}`;
export const ticketKey = day => `ticket.${day}`;
export const hasDayTicket = shared => !!shared.flags[ticketKey(shared.clock.day)];

// Extra slingshot rounds the family has bought.
export function ammoBonus(shared, cfg) {
  return cfg.items.filter(i => i.type === 'upgrade' && i.key === 'ammo' && shared.flags[upgradeKey(i)]).reduce((sum, i) => sum + i.bonus, 0);
}

// Where an item stands for one player: bought already (and worn), affordable, and the label status of its row.
export function itemStatus(cfg, data, player, item) {
  const { shared } = data;
  let owned = false;
  let worn = false;
  if (item.type === 'vehicle') owned = shared.ownedVehicles.includes(item.vehicle);
  else if (item.type === 'cosmetic') {
    const c = data.players[player].cosmetics;
    owned = c.owned.includes(item.id);
    worn = c.equipped[item.slot] === item.id;
  } else if (item.type === 'upgrade') owned = !!shared.flags[upgradeKey(item)];
  else if (item.type === 'ticket') owned = hasDayTicket(shared);
  return { owned, worn, affordable: shared.money >= item.price };
}

export function validateShop(cfg) {
  const problems = [];
  const ids = cfg.items.map(i => i.id);
  if (new Set(ids).size !== ids.length) problems.push('item ids must be unique');
  for (const i of cfg.items) {
    if (!TYPES.includes(i.type)) problems.push(`${i.id}: unknown type ${i.type}`);
    if (!Number.isInteger(i.price) || (i.type === 'activity' ? i.price !== 0 : i.price <= 0)) problems.push(`${i.id}: price must be a positive whole number of cents (0 for an activity)`);
    if (i.type === 'cosmetic' && !cfg.slots.includes(i.slot)) problems.push(`${i.id}: unknown slot ${i.slot}`);
    if (i.type === 'vehicle' && !i.vehicle) problems.push(`${i.id}: names no vehicle`);
    if (i.type === 'snack' && !(i.stamina > 0 && i.stamina <= 1)) problems.push(`${i.id}: stamina is 0..1`);
    if (i.type === 'upgrade' && !(i.key === 'ammo' && Number.isInteger(i.bonus) && i.bonus > 0)) problems.push(`${i.id}: unknown upgrade`);
  }
  for (const [shop, list] of Object.entries(cfg.shops)) {
    if (!list.length) problems.push(`shop ${shop} sells nothing`);
    for (const id of list) if (!ids.includes(id)) problems.push(`shop ${shop} sells unknown item ${id}`);
  }
  return problems;
}
