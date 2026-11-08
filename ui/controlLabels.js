// Names of the controls a player actually has, per device (story 11.5). Pure: no Phaser, so node checks drive it.
// Keyboard names come from data/input.json (the real bindings of that player), gamepad and touch from the fixed
// mappings in ui/inputBindings.js and data/input.json `buttons`. Every returned label is ready to drop into a
// sentence, so a hint says "press F" on a keyboard and "press Y" on a pad without anyone writing it twice.
export const HINT_ACTIONS = ['move', 'sprint', 'jump', 'interact', 'map', 'phone', 'pause', 'defend', 'kiai', 'manual', 'toolPrev', 'toolNext', 'toolUse'];

const KEY_NAMES = {
  Space: 'Space', Enter: 'Enter', ShiftLeft: 'Shift', ShiftRight: 'Right Shift', ControlLeft: 'Ctrl', ControlRight: 'Right Ctrl',
  Slash: '/', Comma: ',', Period: '.', Semicolon: ';', Quote: "'", Escape: 'Esc', Numpad0: 'Num 0'
};
const PAD_NAMES = { sprint: 'B', jump: 'A', interact: 'Y', defend: 'X', kiai: 'RS', manual: 'LT', toolUse: 'RT', toolPrev: 'LB', toolNext: 'RB', map: 'Back', phone: 'LS', pause: 'Start' };
const TOUCH_ACTIONS = new Set(['sprint', 'jump', 'interact', 'defend', 'kiai', 'manual', 'toolUse', 'toolNext', 'pause']);

export function keyName(code) {
  if (KEY_NAMES[code]) return KEY_NAMES[code];
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Arrow/.test(code)) return code.slice(5);
  return code;
}

// The label of `action` for player `index` on `device` ('keyboard' | 'gamepad' | 'touch'); `t` resolves the few
// words that are not key names (arrow keys, stick, touch buttons).
export function controlLabel(inputCfg, index, device, action, t) {
  const keys = inputCfg.players[index]?.keys ?? {};
  if (device === 'touch' && index === 0) {
    if (action === 'move') return t('hint.ctl.joystick');
    if (TOUCH_ACTIONS.has(action)) return t(`hint.ctl.touch.${action}`);
  } else if (device === 'gamepad') {
    if (action === 'move') return t('hint.ctl.stick');
    if (PAD_NAMES[action]) return PAD_NAMES[action];
  }
  if (action === 'move') {
    const arrows = ['up', 'down', 'left', 'right'].every(a => keys[a]?.[0]?.startsWith('Arrow'));
    return arrows ? t('hint.ctl.arrows') : ['up', 'left', 'down', 'right'].map(a => keyName(keys[a]?.[0] ?? '?')).join(' ');
  }
  // map / pause / weather belong to the first player; the second falls back to those keys
  const codes = keys[action]?.length ? keys[action] : inputCfg.players[0]?.keys?.[action] ?? [];
  return codes.map(keyName).join(' / ');
}

// Placeholder values for a hint text. `audience` is a list of player indices; with two readers the labels are
// joined ("F / Enter") so both players find their own control in the same sentence.
export function controlParams(inputCfg, audience, device, t) {
  const out = {};
  for (const action of HINT_ACTIONS) {
    const labels = [];
    for (const index of audience) {
      const label = controlLabel(inputCfg, index, index === 0 ? device : 'keyboard', action, t);
      if (label && !labels.includes(label)) labels.push(label);
    }
    out[action] = labels.join(' / ');
  }
  return out;
}
