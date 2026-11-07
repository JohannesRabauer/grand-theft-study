// Input intent snapshots (AD-10, AD-18). The only module that reads keyboard, mouse and gamepad;
// touch pointers are read by UIScene's touch controls, which hand over a state object
// through the `input:touch-bind` event. Gameplay reads ctx.input.intents[i] (player i) only;
// ctx.input.intent aliases intents[0]. Bindings come from data/input.json, the device -> intent
// mapping itself is the Phaser-free ui/inputBindings.js.
import { NO_TOUCH, bindingFor, clearIntent, createIntent, createSlot, createTouchState, mapIntent, padFor, padOwner, PAD } from './inputBindings.js';

// Keys the browser would otherwise scroll or act on (captured by Phaser so the page stays still).
const CAPTURE = 'W,A,S,D,UP,LEFT,DOWN,RIGHT,SHIFT,SPACE,F,C,Q,E,M,T,ESC,ENTER,COMMA,PERIOD,FORWARD_SLASH,NUMPAD_ZERO,R,V,SEMICOLON,QUOTES';

export class Input {
  // `players` is the live ctx.players array: its length is the number of active players.
  constructor(scene, events, cfg, players) {
    this.scene = scene;
    this.events = events;
    this.cfg = cfg;
    this.players = players;
    this.type = isTouchDevice() ? 'touch' : 'keyboard';
    // Portrait on a touch device: the rotate hint is up and input is ignored.
    this.blocked = false;
    this.touch = createTouchState();
    this.intents = cfg.players.map(createIntent);
    this.slots = cfg.players.map(createSlot);
    this.aimPoints = cfg.players.map(() => ({ x: 0, y: 0 }));
    this.binds = [];
    this.bindCount = 0;
    this.src = { down: new Set(), pad: null, touch: null, mouseDown: false };
    this.mouse = new Phaser.Math.Vector2();
    this.mouseSeen = false;

    const kb = scene.input.keyboard;
    kb.addCapture(CAPTURE);
    kb.on('keydown', e => { this.src.down.add(e.code); this.setType('keyboard'); });
    kb.on('keyup', e => this.src.down.delete(e.code));
    const releaseKeys = () => this.src.down.clear();
    window.addEventListener('blur', releaseKeys);
    scene.events.once('shutdown', () => window.removeEventListener('blur', releaseKeys));
    events.on('input:touch-bind', state => { this.touch = state; });
    scene.input.on('pointerdown', p => this.onPointer(p));
    scene.input.on('pointermove', p => this.onPointer(p));
    // A pad that drives a player and drops out: that player keeps going on the keyboard bindings, a toast says so.
    scene.input.gamepad?.on('disconnected', pad => {
      const player = padOwner(pad.index, Math.max(1, Math.min(this.players.length, this.intents.length)));
      if (player < 0) return;
      events.emit('pad:disconnected', { player });
      events.emit('ui:toast', { key: 'toast.padLost' });
    });
  }

  get intent() { return this.intents[0]; }

  setType(type) {
    if (type === this.type) return;
    this.type = type;
    this.events.emit('input:type', type);
  }

  onPointer(p) {
    if (p.wasTouch || p.event?.sourceCapabilities?.firesTouchEvents) {
      this.setType('touch');
    } else {
      this.mouseSeen = true;
      this.setType('keyboard');
    }
  }

  getPad(index, count) {
    const k = padFor(index, count);
    const gp = this.scene.input.gamepad;
    return k >= 0 && gp ? gp.gamepads[k] ?? null : null;
  }

  // Any pad activity makes the pad the active device (prompts and touch UI follow).
  padActive(pad) {
    if (Math.abs(pad.leftStick.x) > 0.5 || Math.abs(pad.leftStick.y) > 0.5) return true;
    for (let b = 0; b <= PAD.START; b++) if (pad.buttons[b]?.pressed) return true;
    return false;
  }

  update() {
    const count = Math.max(1, Math.min(this.players.length, this.intents.length));
    if (count !== this.bindCount) {
      this.bindCount = count;
      this.binds = this.cfg.players.map((_, i) => bindingFor(this.cfg, i, count));
    }
    this.blocked = this.type === 'touch' && window.innerHeight > window.innerWidth;
    for (let i = 0; i < this.intents.length; i++) {
      if (i >= count || this.blocked) { clearIntent(this.intents[i], this.slots[i]); continue; }
      this.updatePlayer(i, count);
    }
  }

  updatePlayer(i, count) {
    const bind = this.binds[i];
    const src = this.src;
    const pad = this.getPad(i, count);
    if (pad && this.padActive(pad)) this.setType('gamepad');
    const mouse = this.scene.input.activePointer;
    src.pad = pad;
    src.touch = bind.touch ? this.touch : NO_TOUCH;
    src.mouseDown = bind.aim === 'mouse' && !mouse.wasTouch && mouse.leftButtonDown();
    mapIntent(this.intents[i], this.slots[i], bind, src, this.cfg.deadzone);
    this.updateAim(i, bind, mouse);
  }

  // Aim is a world point. Touch drag and the right stick aim relative to the camera centre for P1
  // (which follows the player) and relative to the player for the others; the mouse aims at the
  // point under the cursor. No aim = the tool uses the walking direction.
  updateAim(i, bind, mouse) {
    const intent = this.intents[i];
    const slot = this.slots[i];
    const cam = this.scene.cameras.main;
    const reach = this.cfg.aimReach;
    const a = this.aimPoints[i];
    const t = this.touch;
    const owner = this.players[i];
    const cx = i === 0 || !owner ? cam.midPoint.x : owner.x;
    const cy = i === 0 || !owner ? cam.midPoint.y : owner.y;
    if (bind.touch && t.aiming) {
      a.x = cx + t.aimDir.x * reach;
      a.y = cy + t.aimDir.y * reach;
      intent.aim = a;
    } else if (slot.stickX || slot.stickY) {
      a.x = cx + slot.stickX * reach;
      a.y = cy + slot.stickY * reach;
      intent.aim = a;
    } else if (bind.aim === 'mouse' && this.mouseSeen && this.type === 'keyboard') {
      mouse.positionToCamera(cam, this.mouse);
      a.x = this.mouse.x;
      a.y = this.mouse.y;
      intent.aim = a;
    } else {
      intent.aim = null;
    }
  }
}

function isTouchDevice() {
  return window.matchMedia('(pointer: coarse)').matches; // primary pointer is a finger
}
