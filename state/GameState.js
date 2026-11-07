// The one owner of saved data (AD-16). Pure module: no Phaser, so node checks can run it.
// Data is deep-frozen; the only way to change it is dispatch(), which runs a registered
// action on a copy, freezes the result and emits `state:changed` with the changed path.
import { ACTIONS } from './actions.js';

export const STATE_VERSION = 2;

export function createPlayer(cfg) {
  return {
    character: null,
    attributes: { ...cfg.attributes },
    xp: 0,
    level: 1,
    grades: {},
    learning: {},
    karate: { belt: cfg.startBelt },
    cosmetics: { owned: [], equipped: {} },
    stickers: [],
    bag: []
  };
}

export function createShared(cfg) {
  return {
    money: cfg.startMoneyCents,
    familienfrieden: cfg.startFamilienfrieden,
    ownedVehicles: [...cfg.startVehicles],
    quests: { active: [], done: [] },
    clock: { day: 1, minute: 0, phase: null }, // DayClock moves a fresh clock to the start of the day
    flags: {}
  };
}

export function createDefaultState(cfg) {
  return {
    v: STATE_VERSION,
    shared: createShared(cfg),
    players: Array.from({ length: cfg.players }, () => createPlayer(cfg))
  };
}

export function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const k of Object.keys(o)) deepFreeze(o[k]);
  }
  return o;
}

export class GameState {
  constructor(events, cfg, data = createDefaultState(cfg)) {
    this.events = events;
    this.cfg = cfg;
    this.data = deepFreeze(data);
  }

  get shared() { return this.data.shared; }
  get players() { return this.data.players; }

  // Runs a named action. Returns true when it changed state, false when it was rejected
  // (rejections emit `state:rejected` with the reason and leave the state untouched).
  dispatch(name, payload = {}) {
    const action = ACTIONS[name];
    if (!action) { console.warn(`state: unknown action ${name}`); return false; }
    const draft = structuredClone(this.data);
    const result = action(draft, payload, this.cfg);
    if (result.reject) {
      this.events.emit('state:rejected', { action: name, reason: result.reject, payload });
      return false;
    }
    this.data = deepFreeze(draft);
    for (const path of [].concat(result.path)) this.events.emit('state:changed', { path, action: name, payload });
    return true;
  }

  // Swaps the whole data tree (loading a slot, starting a new game).
  replace(data) {
    this.data = deepFreeze(data);
    this.events.emit('state:changed', { path: '', action: 'replace' });
  }
}
