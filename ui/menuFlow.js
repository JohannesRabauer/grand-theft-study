// New-game menu flow (AD-18) without Phaser: which mode was chosen, who picks which character, which keys and
// pads steer each pick, and the store actions that start the game. MenuScene draws it, scripts/check-menu.mjs drives it.
import { padFor } from './inputBindings.js';

export const MODES = ['solo', 'coop'];

// Co-op needs a second input device: a keyboard or a gamepad. A touch-only device (finger primary, no pad) has neither.
export function coopAvailable({ coarse, pads }) {
  return !coarse || pads > 0;
}

// Keys (KeyboardEvent.code) that steer a character pick. In co-op each picker has its own keys (P1 WASD + Space,
// P2 arrows + Enter, as in data/input.json); alone, either set works.
const NAV = [
  { left: ['KeyA'], right: ['KeyD'], confirm: ['Space', 'KeyF'] },
  { left: ['ArrowLeft'], right: ['ArrowRight'], confirm: ['Enter', 'ControlRight', 'Numpad0'] }
];

export function navAction(player, coop, code) {
  for (const set of coop ? [NAV[player]] : NAV) {
    for (const a of ['left', 'right', 'confirm']) if (set[a].includes(code)) return a;
  }
  return null;
}

// Pad indices (into the connected pads) that steer a pick: the pads' own player assignment in co-op (inputBindings
// padFor with two players), any pad when playing alone.
export function menuPads(player, coop, total) {
  if (!coop) return Array.from({ length: total }, (_, i) => i);
  const k = padFor(player, 2);
  return k >= 0 && k < total ? [k] : [];
}

// One pad poll: 'left' | 'right' | 'confirm' on the frame a direction (d-pad or stick) or A goes down, else null.
// `prev` is the caller's per-pad memory; the first poll only records, so a button held from the screen before is ignored.
export function padAction(pad, prev, pressA = 0, left = 14, right = 15) {
  const now = {
    left: pad.buttons[left]?.pressed === true || pad.leftStick.x < -0.5,
    right: pad.buttons[right]?.pressed === true || pad.leftStick.x > 0.5,
    confirm: pad.buttons[pressA]?.pressed === true
  };
  const fresh = prev.seen !== true;
  let out = null;
  if (!fresh) for (const a of ['confirm', 'left', 'right']) if (now[a] && !prev[a]) { out = a; break; }
  Object.assign(prev, now, { seen: true });
  return out;
}

// "Press A to join": a pad is connected and no second player exists yet.
export function padJoinHint({ pads, coopAllowed }) {
  return coopAllowed && pads > 0;
}

// Mode -> picks. Steps: 'mode' -> 'pick' (player 0, then 1 in co-op) -> 'done'.
export class NewGameFlow {
  constructor(characterIds, { coopAllowed = true } = {}) {
    this.ids = characterIds;
    this.coopAllowed = coopAllowed;
    this.step = 'mode';
    this.coop = false;
    this.picks = [];
  }

  get picker() { return this.picks.length; }

  chooseMode(mode) {
    if (this.step !== 'mode' || !MODES.includes(mode) || (mode === 'coop' && !this.coopAllowed)) return false;
    this.coop = mode === 'coop';
    this.step = 'pick';
    return true;
  }

  // Players may pick the same character (co-op); an unknown id is refused.
  pick(id) {
    if (this.step !== 'pick' || !this.ids.includes(id)) return false;
    this.picks.push(id);
    if (this.picks.length === (this.coop ? 2 : 1)) this.step = 'done';
    return true;
  }

  // One step back. Returns the step to show ('mode' or 'pick'), or 'exit' to leave the flow.
  back() {
    if (this.step === 'mode') return 'exit';
    if (this.picks.length) {
      this.picks.pop();
      this.step = 'pick';
      return 'pick';
    }
    this.step = 'mode';
    return 'mode';
  }

  get result() {
    return this.step === 'done' ? { coop: this.coop, characters: [...this.picks] } : null;
  }
}

// The state actions that start the chosen game on a fresh state: co-op first (it creates the second player), then the characters.
export function startActions({ coop, characters }) {
  const out = [];
  if (coop) out.push({ action: 'coop.set', payload: { on: true } });
  characters.forEach((character, player) => out.push({ action: 'player.setCharacter', payload: { player, character } }));
  return out;
}

// Pause menu line: "Allein: Lena" / "Zu zweit: Lena + Jonas".
export function modeSummary(names, t) {
  return t(names.length > 1 ? 'pause.mode.coop' : 'pause.mode.solo', { who: names.join(' + ') });
}
