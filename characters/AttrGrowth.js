// Attribute growth hooks (CAP-12): subscribes to the events listed in data/attr-growth.json and turns each
// match into an `attr.grow` action (the only writer of attributes, AD-16). Phaser-free. Emits `attr:up`
// { player, attr, value } whenever the displayed (rounded) value of an attribute goes up.
import { displayValue, grown, ruleMatches } from './attributes.js';

export class AttrGrowth {
  constructor(events, state, table, attrMax) {
    this.events = events;
    this.state = state;
    this.attrMax = attrMax;
    for (const event of new Set(table.rules.map(r => r.event))) {
      const rules = table.rules.filter(r => r.event === event);
      events.on(event, payload => { for (const r of rules) this.apply(r, payload ?? {}); });
    }
  }

  apply(rule, payload) {
    const player = payload.player ?? 0;
    const p = this.state.players[player];
    if (!p || !ruleMatches(rule, payload)) return;
    const before = p.attributes[rule.attr];
    const amount = grown(before, rule.amount, rule.cap, this.attrMax) - before;
    if (amount <= 0) return;
    if (this.grow(player, rule.attr, amount, rule.reason)) {
      const value = displayValue(this.state.players[player].attributes[rule.attr]);
      if (value > displayValue(before)) this.events.emit('attr:up', { player, attr: rule.attr, value });
    }
  }

  grow(player, attr, amount, reason) {
    return this.state.dispatch('attr.grow', { player, attr, amount, reason });
  }
}
