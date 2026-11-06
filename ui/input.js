// Input intent snapshot (AD-10). The only module that reads keyboard, mouse and gamepad;
// touch pointers are read by UIScene's touch controls, which hand over a state object
// through the `input:touch-bind` event. Gameplay reads ctx.input.intent only.
//
// Level intents (held): move, aim, sprint, jump, toolUse.
// Edge intents (true for exactly one frame per press): interact, toolNext, toolPrev, map, weather, pause.
const KEYS = 'W,A,S,D,UP,LEFT,DOWN,RIGHT,SHIFT,SPACE,F,Q,E,M,T,ESC';
const EDGES = ['interact', 'toolNext', 'toolPrev', 'map', 'weather', 'pause'];
// Standard gamepad mapping: A, B, X, Y, LB, RB, LT, RT, Back, Start, d-pad.
const PAD = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };

export function createTouchState() {
  return {
    move: { x: 0, y: 0 },
    aimDir: { x: 0, y: 0 },
    aiming: false,
    btn: { jump: false, toolUse: false, sprint: false, interact: false, toolNext: false, pause: false }
  };
}

export class Input {
  constructor(scene, events, cfg) {
    this.scene = scene;
    this.events = events;
    this.cfg = cfg;
    this.keys = scene.input.keyboard.addKeys(KEYS);
    this.type = isTouchDevice() ? 'touch' : 'keyboard';
    // Portrait on a touch device: the rotate hint is up and input is ignored.
    this.blocked = false;
    this.touch = createTouchState();
    this.intent = {
      move: { x: 0, y: 0 },
      aim: null,
      sprint: false,
      jump: false,
      interact: false,
      toolUse: false,
      toolNext: false,
      toolPrev: false,
      map: false,
      weather: false,
      pause: false
    };
    this.aimPoint = { x: 0, y: 0 };
    this.mouse = new Phaser.Math.Vector2();
    this.mouseSeen = false;
    this.prev = {};
    for (const e of EDGES) this.prev[e] = false;

    events.on('input:touch-bind', state => { this.touch = state; });
    scene.input.keyboard.on('keydown', () => this.setType('keyboard'));
    scene.input.on('pointerdown', p => this.onPointer(p));
    scene.input.on('pointermove', p => this.onPointer(p));
  }

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

  getPad() {
    const gp = this.scene.input.gamepad;
    return gp && gp.total > 0 ? gp.pad1 : null;
  }

  // Any pad activity makes the pad the active device (prompts and touch UI follow).
  padActive(pad) {
    if (Math.abs(pad.leftStick.x) > 0.5 || Math.abs(pad.leftStick.y) > 0.5) return true;
    for (let b = 0; b <= PAD.START; b++) if (pad.buttons[b]?.pressed) return true;
    return false;
  }

  update() {
    const i = this.intent;
    const k = this.keys;
    const pad = this.getPad();
    if (pad && this.padActive(pad)) this.setType('gamepad');

    this.blocked = this.type === 'touch' && window.innerHeight > window.innerWidth;
    if (this.blocked) {
      this.clear();
      return;
    }

    const t = this.touch;
    const btn = t.btn;
    const down = b => pad?.buttons[b]?.pressed === true;

    let x = (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0);
    let y = (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0);
    x += t.move.x;
    y += t.move.y;
    let rx = 0;
    let ry = 0;
    if (pad) {
      const dz = this.cfg.deadzone;
      x += (down(PAD.RIGHT) ? 1 : 0) - (down(PAD.LEFT) ? 1 : 0) + deadzone(pad.leftStick.x, pad.leftStick.y, dz, 0);
      y += (down(PAD.DOWN) ? 1 : 0) - (down(PAD.UP) ? 1 : 0) + deadzone(pad.leftStick.x, pad.leftStick.y, dz, 1);
      rx = deadzone(pad.rightStick.x, pad.rightStick.y, dz, 0);
      ry = deadzone(pad.rightStick.x, pad.rightStick.y, dz, 1);
    }
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    i.move.x = x;
    i.move.y = y;

    const mouse = this.scene.input.activePointer;
    const mouseDown = !mouse.wasTouch && mouse.leftButtonDown();
    i.sprint = k.SHIFT.isDown || btn.sprint || down(PAD.B);
    i.jump = k.SPACE.isDown || btn.jump || down(PAD.A);
    i.toolUse = mouseDown || btn.toolUse || down(PAD.X) || down(PAD.RT);

    this.edge('interact', k.F.isDown || btn.interact || down(PAD.Y));
    this.edge('toolNext', k.E.isDown || btn.toolNext || down(PAD.RB));
    this.edge('toolPrev', k.Q.isDown || down(PAD.LB));
    this.edge('map', k.M.isDown || down(PAD.BACK));
    this.edge('weather', k.T.isDown);
    this.edge('pause', k.ESC.isDown || btn.pause || down(PAD.START));

    this.updateAim(rx, ry, mouse);
  }

  // Aim is a world point. Touch drag and right stick aim relative to the camera centre
  // (which follows the player); the mouse aims at the point under the cursor.
  updateAim(rx, ry, mouse) {
    const i = this.intent;
    const cam = this.scene.cameras.main;
    const reach = this.cfg.aimReach;
    const a = this.aimPoint;
    const t = this.touch;
    if (t.aiming) {
      a.x = cam.midPoint.x + t.aimDir.x * reach;
      a.y = cam.midPoint.y + t.aimDir.y * reach;
      i.aim = a;
    } else if (rx || ry) {
      a.x = cam.midPoint.x + rx * reach;
      a.y = cam.midPoint.y + ry * reach;
      i.aim = a;
    } else if (this.mouseSeen && this.type === 'keyboard') {
      mouse.positionToCamera(cam, this.mouse);
      a.x = this.mouse.x;
      a.y = this.mouse.y;
      i.aim = a;
    } else {
      i.aim = null;
    }
  }

  edge(name, level) {
    this.intent[name] = level && !this.prev[name];
    this.prev[name] = level;
  }

  clear() {
    const i = this.intent;
    i.move.x = 0;
    i.move.y = 0;
    i.aim = null;
    i.sprint = i.jump = i.toolUse = false;
    for (const e of EDGES) {
      i[e] = false;
      this.prev[e] = true; // a button held through the pause must not fire on resume
    }
  }
}

// Radial deadzone with rescale; axis 0 returns x, axis 1 returns y.
function deadzone(x, y, dz, axis) {
  const m = Math.hypot(x, y);
  if (m <= dz) return 0;
  const s = (Math.min(m, 1) - dz) / (1 - dz) / m;
  return (axis === 0 ? x : y) * s;
}

function isTouchDevice() {
  return window.matchMedia('(pointer: coarse)').matches; // primary pointer is a finger
}
