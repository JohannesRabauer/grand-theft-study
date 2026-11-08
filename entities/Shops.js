// The shops of the town (story 10.1, ctx.shops): the map objects `shop` (shopId) and `bakery` (sells `bakery`). Walking up on
// foot shows the prompt, interact opens ShopScreen for that player (the world freezes while it is open). `buy` is the one way
// to spend money in a shop: it dispatches the state action (money and purchase change together, AD-16), then applies what only
// the running world can: a snack refills stamina, the ammo upgrade widens every slingshot magazine, a day ticket is read by the
// tram. Emits `shop:bought` { player, id, type, price } and `shop:refused` { player, id, reason }.
import { ShopScreen } from '../ui/screens/ShopScreen.js';
import { ammoBonus, itemById, itemStatus, shopItems } from '../services/shopLogic.js';

export class Shops {
  constructor(scene, ctx, cfg, inputCfg) {
    this.scene = scene;
    this.ctx = ctx;
    this.cfg = cfg;
    this.inputCfg = inputCfg; // for the control names on the screen
    ctx.shops = this;
    this.labels = Array.from({ length: ctx.maxPlayers }, () => scene.add.text(0, 0, '', {
      fontFamily: 'monospace', fontSize: '8px', color: '#fff2a8', backgroundColor: '#243d46', resolution: ctx.res.scale
    }).setOrigin(0.5).setDepth(8100).setVisible(false));
    ctx.events.on('lang:changed', () => { for (const l of this.labels) l.shopText = null; });
  }

  get places() {
    return this.ctx.map.objects.filter(o => o.type === 'shop' || o.type === 'bakery').map(o => ({ o, id: o.shopId ?? (o.type === 'bakery' ? 'bakery' : null) })).filter(s => s.id && this.cfg.shops[s.id]);
  }

  rect(o) {
    const ts = this.ctx.map.tileSize;
    return { x0: o.x * ts - 12, y0: o.y * ts - 20, x1: (o.x + o.w) * ts + 12, y1: (o.y + o.h) * ts + 14 };
  }

  placeNear(p) {
    return this.places.find(({ o }) => { const r = this.rect(o); return p.x >= r.x0 && p.x <= r.x1 && p.y >= r.y0 && p.y <= r.y1; }) ?? null;
  }

  open(shopId, player) {
    const { ctx } = this;
    if (!ctx.screens || ctx.screens.top()) return null;
    return ctx.screens.push(new ShopScreen(this.scene.scene.get('UI'), ctx, ctx.screens, this, shopId, player));
  }

  items(shopId) { return shopItems(this.cfg, shopId); }

  who(index) { return this.ctx.players[index].character?.name ?? this.ctx.t('menu.slot.player', { n: index + 1 }); }

  // Returns { ok: true, item } or { ok: false, reason } (insufficient-funds, already-owned, ...).
  buy(id, player) {
    const { ctx } = this;
    const item = itemById(this.cfg, id);
    if (!item) return { ok: false, reason: 'not-for-sale' };
    const status = itemStatus(this.cfg, ctx.state.data, player, item);
    let reason = null;
    if (status.owned) reason = 'already-owned';
    else if (!status.affordable) reason = 'insufficient-funds';
    else if (!(item.type === 'vehicle' ? ctx.state.dispatch('shop.buyVehicle', { id: item.vehicle }) : ctx.state.dispatch('shop.buy', { id, player }))) reason = 'rejected';
    if (reason) {
      ctx.events.emit('shop:refused', { player, id, reason });
      return { ok: false, reason, item };
    }
    if (item.type === 'snack') ctx.players[player].move.stamina = Math.max(ctx.players[player].move.stamina, item.stamina);
    if (item.type === 'upgrade') this.applyUpgrades();
    ctx.events.emit('shop:bought', { player, id, type: item.type, price: item.price });
    return { ok: true, item };
  }

  equip(player, slot, id) { return this.ctx.state.dispatch('cosmetics.equip', { player, slot, id }); }

  // The slingshot magazines follow the family's upgrades.
  applyUpgrades() {
    const { ctx } = this;
    const bonus = ammoBonus(ctx.state.shared, this.cfg);
    for (const p of ctx.players) for (const tool of p.toolbelt?.tools ?? []) if (tool.id === 'slingshot') tool.max = tool.cfg.maxAmmo + bonus;
  }

  update() {
    const { ctx } = this;
    for (const p of ctx.players) {
      const place = !ctx.map.indoor && !ctx.screens?.top() && p.alive && !p.pinned && p.vehicle === 'foot' ? this.placeNear(p) : null;
      const label = this.labels[p.index];
      label.setVisible(!!place);
      if (!place) continue;
      if (ctx.input.intents[p.index].interact && !p.vehicleSwapped) {
        label.setVisible(false);
        this.open(place.id, p.index);
        continue;
      }
      label.setPosition(p.x, p.y - 24);
      const text = `${ctx.t(`world.interact.${ctx.input.type === 'keyboard' && p.index === 1 ? 'keyboardP2' : ctx.input.type}`)} ${ctx.t('shop.open', { name: ctx.t(`shop.${place.id}.name`) })}`;
      if (label.shopText !== text) { label.setText(text); label.shopText = text; }
    }
  }
}
