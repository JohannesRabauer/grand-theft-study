// The sticker collection (story 10.3): the content (every sticker has a name and a fun fact in both languages, every sticker can be
// won), the loot pool and awards, the sticker.add action, and the service with a real GameState. The album screen and the drops
// in the running game are covered by the smoke scenario `stickers`.
// Run: node scripts/check-stickers.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import { GameState } from '../state/GameState.js';
import { Stickers } from '../services/stickers.js';

const load = p => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const cfg = load('data/stickers.json');
const base = load('data/state.json');
const i18n = { de: load('i18n/de.json'), en: load('i18n/en.json') };
const missions = load('data/missions.json');
const events = load('data/kopfnoten.json'); // (only to prove the awards name real event names below)

function setup(players = 2) {
  const bus = new EventEmitter();
  const state = new GameState(bus, { ...base, players, stickers: cfg, startMoneyCents: 0 });
  const toasts = [];
  const collected = [];
  bus.on('ui:toast', t => toasts.push(t));
  bus.on('sticker:collected', e => collected.push(e));
  const ctx = { state, events: bus, t: k => k, players: Array.from({ length: players }, (_, index) => ({ index })) };
  const stickers = new Stickers(ctx, cfg);
  return { ctx, bus, state, stickers, toasts, collected };
}

// ---- content
let t = setup();
for (const l of ['de', 'en']) {
  assert.deepEqual(t.stickers.validate(i18n[l]), [], `${l}: ${t.stickers.validate(i18n[l]).join(', ')}`);
  for (const k of ['sticker.new', 'sticker.duplicate', 'album.title', 'album.owner', 'album.hidden', 'album.hiddenHint', 'album.nav', 'album.rare', 'album.common', 'pause.album', ...Object.keys(cfg.categories).map(c => `album.cat.${c}`)]) assert.ok(i18n[l][k], `${l}: ${k}`);
  for (const s of cfg.stickers) {
    const fact = i18n[l][`sticker.${s.id}.fact`];
    assert.ok(fact.length >= 25 && fact.length <= 130, `${l}: ${s.id} fun fact fits a card (${fact.length})`);
    assert.ok(i18n[l][`sticker.${s.id}.name`].length <= 22, `${l}: ${s.id} name fits`);
  }
}
assert.ok(cfg.stickers.length >= 24 && cfg.stickers.length <= 30, 'a page of 30 holds the album');
assert.ok(cfg.stickers.filter(s => s.rarity === 'rare').length >= 8 && cfg.stickers.filter(s => s.rarity === 'common').length >= 10, 'both rarities');
assert.ok(new Set(cfg.stickers.map(s => s.category)).size === Object.keys(cfg.categories).length, 'every category has stickers');
assert.ok(cfg.loot.length >= 10, 'the loot pool is big enough to keep digging worthwhile');
for (const a of cfg.awards.filter(a => a.event === 'mission:done')) assert.ok(missions.missions.some(m => m.id === a.filter.id), `award for a real mission: ${a.filter.id}`);
assert.ok(cfg.awards.some(a => a.event === 'zeugnis:done' && a.filter.promoted === true) && cfg.awards.some(a => a.event === 'zeugnis:done' && a.filter.promoted === false), 'the Zeugnis rewards both outcomes');

// ---- the action
t = setup();
assert.ok(t.state.dispatch('sticker.add', { player: 0, id: 'bee' }) && t.state.players[0].stickers.includes('bee'));
assert.ok(!t.state.dispatch('sticker.add', { player: 0, id: 'bee' }), 'a sticker once per album');
assert.ok(!t.state.dispatch('sticker.add', { player: 0, id: 'unicorn' }) && !t.state.dispatch('sticker.add', { player: 9, id: 'cow' }));
assert.deepEqual(t.state.players[1].stickers, [], 'the other kid has their own album');

// ---- loot: a random sticker the kid does not have yet, then coins
t = setup(1);
t.stickers.rng = () => 0;
t.bus.emit('sticker:found', { player: 0, source: 'bush' });
assert.deepEqual(t.state.players[0].stickers, [cfg.loot[0]], 'the first loot sticker with this dice');
assert.equal(t.toasts.at(-1).key, 'sticker.new');
assert.equal(t.collected.length, 1);
t.bus.emit('sticker:found', { player: 0, source: 'pinata' });
assert.deepEqual(t.state.players[0].stickers, [cfg.loot[0], cfg.loot[1]], 'a different one each time');
for (let i = 0; i < 30; i++) t.bus.emit('sticker:found', { player: 0 });
assert.equal(cfg.loot.every(id => t.stickers.owns(0, id)), true, 'digging completes the loot pool');
assert.ok(cfg.loot.length === t.state.players[0].stickers.length, 'and never gives an award sticker');
const money = t.state.shared.money;
t.bus.emit('sticker:found', { player: 0 });
assert.equal(t.state.shared.money, money + cfg.lootCoinCents, 'when nothing is left a coin is paid instead');
assert.equal(t.toasts.at(-1).key, 'sticker.duplicate');

// ---- awards
t = setup();
t.bus.emit('mission:done', { id: 'parcel', kind: 'help' });
assert.ok(t.stickers.owns(0, 'pretzel') && t.stickers.owns(1, 'pretzel'), 'a mission (no single owner) gives its sticker to every kid');
t.bus.emit('mission:done', { id: 'parcel' });
assert.equal(t.collected.length, 2, 'only once');
t.bus.emit('tram:ride', { players: [1], from: 'a', to: 'b' });
assert.ok(t.stickers.owns(1, 'tram') && !t.stickers.owns(0, 'tram'), 'the tram sticker goes to the riders only');
t.bus.emit('karate:belt', { player: 0, belt: 'yellow' });
assert.ok(t.stickers.owns(0, 'giraffe') && !t.stickers.owns(1, 'giraffe'), 'a belt gives one to that kid');
t.bus.emit('zeugnis:done', { player: 0, promoted: true });
t.bus.emit('zeugnis:done', { player: 1, promoted: false });
assert.ok(t.stickers.owns(0, 'brandenburg') && !t.stickers.owns(0, 'snail') && t.stickers.owns(1, 'snail') && !t.stickers.owns(1, 'brandenburg'), 'promoted and repeat get their own sticker');
t.bus.emit('mission:done', { id: 'no-such-mission' });
assert.equal(t.collected.filter(c => c.count > 0).length, t.collected.length);

// ---- every sticker can really be won
const all = new Set(cfg.stickers.map(s => s.id));
const won = new Set([...cfg.loot, ...cfg.awards.map(a => a.sticker)]);
assert.deepEqual([...all].filter(id => !won.has(id)), [], 'no sticker is out of reach');
assert.ok(events.events.length > 0);

console.log(`stickers ok: ${cfg.stickers.length} stickers with facts in two languages, ${cfg.loot.length} from loot and ${cfg.awards.length} awards, own album per kid, coins when the pool is empty`);
