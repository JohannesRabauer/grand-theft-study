// The sticker collection (story 10.3, ctx.stickers), Phaser-free. Each kid has their own album (state players[i].stickers, written by the
// sticker.add action only). Stickers come from two kinds of source (data/stickers.json):
// - `loot`: a sticker:found from digging, bushes or the pinata gives a random sticker from the loot pool that the kid does not
//   have yet; when none is left a few coins are paid instead;
// - `awards`: a given event (a mission, the tram, a belt, the Zeugnis ...) gives a fixed sticker to the kids it names.
// Emits `sticker:collected` { player, id, count } and a toast with the name; the fun fact is in the album.
export class Stickers {
  constructor(ctx, cfg) {
    this.ctx = ctx;
    this.cfg = cfg;
    this.byId = new Map(cfg.stickers.map(s => [s.id, s]));
    this.rng = Math.random; // tests replace it
    ctx.stickers = this;
    ctx.events.on('sticker:found', e => this.found(e ?? {}));
    for (const event of new Set(cfg.awards.map(a => a.event))) ctx.events.on(event, payload => this.award(event, payload ?? {}));
  }

  list(player) { return this.ctx.state.players[player]?.stickers ?? []; }

  owns(player, id) { return this.list(player).includes(id); }

  count(player) { return this.list(player).length; }

  get total() { return this.cfg.stickers.length; }

  // A random loot sticker this kid does not have, or null when the pool is used up.
  pick(player) {
    const open = this.cfg.loot.filter(id => !this.owns(player, id));
    return open.length ? open[Math.floor(this.rng() * open.length)] : null;
  }

  give(player, id) {
    const { ctx } = this;
    if (!this.byId.has(id) || !ctx.state.dispatch('sticker.add', { player, id })) return false;
    ctx.events.emit('sticker:collected', { player, id, count: this.count(player) });
    ctx.events.emit('ui:toast', { key: 'sticker.new', params: { name: ctx.t(`sticker.${id}.name`) } });
    return true;
  }

  found(payload) {
    const player = payload.player ?? 0;
    if (!this.ctx.state.players[player]) return;
    const id = this.pick(player);
    if (id) { this.give(player, id); return; }
    this.ctx.state.dispatch('wallet.earn', { cents: this.cfg.lootCoinCents, reason: 'sticker-duplicate' });
    this.ctx.events.emit('ui:toast', { key: 'sticker.duplicate' });
  }

  // The kids an event is about: payload.players, else payload.player, else everybody (a mission has no single owner).
  kidsOf(payload) {
    if (Array.isArray(payload.players)) return payload.players;
    if (Number.isInteger(payload.player)) return [payload.player];
    return this.ctx.players.map(p => p.index);
  }

  award(event, payload) {
    for (const a of this.cfg.awards) {
      if (a.event !== event || (a.filter && Object.entries(a.filter).some(([k, v]) => payload[k] !== v))) continue;
      for (const player of this.kidsOf(payload)) if (this.ctx.state.players[player] && !this.owns(player, a.sticker)) this.give(player, a.sticker);
    }
  }

  validate(i18n) {
    const problems = [];
    const ids = new Set(this.byId.keys());
    if (ids.size !== this.cfg.stickers.length) problems.push('sticker ids must be unique');
    for (const s of this.cfg.stickers) {
      if (!this.cfg.categories[s.category]) problems.push(`${s.id}: unknown category`);
      if (!['common', 'rare'].includes(s.rarity)) problems.push(`${s.id}: unknown rarity`);
      for (const part of ['name', 'fact']) if (!i18n[`sticker.${s.id}.${part}`]) problems.push(`${s.id}: missing ${part}`);
    }
    for (const id of this.cfg.loot) if (!ids.has(id)) problems.push(`loot names unknown sticker ${id}`);
    for (const a of this.cfg.awards) if (!ids.has(a.sticker)) problems.push(`award names unknown sticker ${a.sticker}`);
    const reachable = new Set([...this.cfg.loot, ...this.cfg.awards.map(a => a.sticker)]);
    for (const id of ids) if (!reachable.has(id)) problems.push(`${id} cannot be won anywhere`);
    return problems;
  }
}
