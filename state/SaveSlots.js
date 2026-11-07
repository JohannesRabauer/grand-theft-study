// Save slots in localStorage (AD-16): keys schulweg.save.1..N. Pure module; storage is injectable.
// Saves happen on `phase:ended` (autosave) and on explicit save(), never mid-phase.
import { STATE_VERSION, createDefaultState } from './GameState.js';
import { migrate } from './migrations.js';
import { validStreetRecords } from '../vehicles/streetLogic.js';

const KEY = (n) => `schulweg.save.${n}`;
const isObj = (o) => o !== null && typeof o === 'object';

export class SaveSlots {
  constructor(state, events, storage) {
    this.state = state;
    this.events = events;
    this.storage = storage;
    this.activeSlot = null; // null: in-memory game, autosave does nothing
    events.on('phase:ended', () => { if (this.activeSlot) this.save(this.activeSlot); });
  }

  get count() { return this.state.cfg.slots; }

  save(n) {
    this.#checkSlot(n);
    try {
      this.events.emit('state:saving', { slot: n });
      this.storage.setItem(KEY(n), JSON.stringify({ ...this.state.data, savedAt: Date.now() }));
    } catch (err) {
      console.warn('save failed', err);
      this.events.emit('state:save-failed', { slot: n });
      return false;
    }
    this.activeSlot = n;
    this.events.emit('state:saved', { slot: n });
    return true;
  }

  // Replaces the live state with the slot. Returns false for an empty or unreadable slot
  // (an unreadable one is first copied to `.bak` and removed, and `state:slot-corrupt` fires).
  load(n) {
    this.#checkSlot(n);
    const raw = this.storage.getItem(KEY(n));
    if (raw === null) return false;
    const parsed = this.#parse(raw);
    if (!parsed) {
      this.storage.setItem(`${KEY(n)}.bak`, raw);
      this.storage.removeItem(KEY(n));
      this.events.emit('state:slot-corrupt', { slot: n });
      return false;
    }
    const { savedAt, ...data } = parsed;
    this.state.replace(data);
    this.activeSlot = n;
    return true;
  }

  // Fresh game in slot n: replaces the live state with the defaults and writes it, binding the slot.
  startNew(n) {
    this.#checkSlot(n);
    this.state.replace(createDefaultState(this.state.cfg));
    return this.save(n);
  }

  hasBackup(n) {
    this.#checkSlot(n);
    return this.storage.getItem(`${KEY(n)}.bak`) !== null;
  }

  delete(n) {
    this.#checkSlot(n);
    this.storage.removeItem(KEY(n));
    if (this.activeSlot === n) this.activeSlot = null;
  }

  // Menu summaries, read-only: [{ slot, status: 'empty'|'ok'|'corrupt', savedAt, players, money, day }]
  list() {
    const out = [];
    for (let n = 1; n <= this.count; n++) {
      const raw = this.storage.getItem(KEY(n));
      const row = { slot: n, status: 'empty' };
      if (raw !== null) {
        const d = this.#parse(raw);
        if (!d) row.status = 'corrupt';
        else Object.assign(row, {
          status: 'ok',
          savedAt: d.savedAt ?? null,
          players: d.players.map(p => ({ character: p.character, level: p.level })),
          money: d.shared.money,
          day: d.shared.clock.day
        });
      }
      out.push(row);
    }
    return out;
  }

  #checkSlot(n) {
    if (!Number.isInteger(n) || n < 1 || n > this.count) throw new RangeError(`bad save slot ${n}`);
  }

  // The parsed save at the current version (with `savedAt`), or null when unreadable.
  #parse(raw) {
    try {
      const d = JSON.parse(raw);
      if (!isObj(d) || !Number.isInteger(d.v)) return null;
      const m = migrate(d, this.state.cfg, STATE_VERSION);
      const ok = isObj(m.shared) && isObj(m.shared.clock) && Array.isArray(m.players) && m.players.length > 0
        && m.players.every(isObj) && validStreetRecords(m.shared.streetRides, this.state.cfg, m.players.length);
      return ok ? m : null;
    } catch {
      return null;
    }
  }
}
