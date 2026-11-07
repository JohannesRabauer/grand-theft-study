// The one owner of saved data (AD-16). Pure module: no Phaser, so node checks can run it.
// Data is deep-frozen; the only way to change it is dispatch(), which runs a registered
// action on a copy, freezes the result and emits `state:changed` with the changed path.
import { ACTIONS } from './actions.js';
import { emptyGrades, defaultKopfnoten } from '../grading/gradeCore.js';

export const STATE_VERSION = 5;

// Belt progress (story 6.4): points = training points earned in all sessions, sessions = sessions ever started, trainDay /
// trainedToday = the game day of the last session and how many sessions that day had (the daily limit), lastExamDay = the
// day of the last promotion (one belt per day).
export const createKarate = cfg => ({ belt: cfg.startBelt, points: 0, sessions: 0, lastExamDay: 0, trainDay: 0, trainedToday: 0 });

// A character that starts with a higher belt (data/characters.json startBelt, as cfg.characterBelts: id -> { belt, points }):
// raises the belt and its points of `player` (a mutable player object); never lowers what the kid already earned.
export function grantStartBelt(player, cfg) {
  const grant = cfg.characterBelts?.[player.character];
  const order = cfg.karateBelts;
  if (!grant || !order || order.indexOf(grant.belt) <= order.indexOf(player.karate.belt)) return;
  player.karate.belt = grant.belt;
  player.karate.points = Math.max(player.karate.points, grant.points);
}

export function createPlayer(cfg) {
  return {
    character: null,
    attributes: { ...cfg.attributes },
    xp: 0,
    level: 1,
    grades: emptyGrades(),
    kopfnoten: cfg.kopfnoten ? defaultKopfnoten(cfg.kopfnoten) : {}, // cfg.kopfnoten is data/kopfnoten.json, merged in at boot
    learning: {},
    karate: createKarate(cfg),
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
