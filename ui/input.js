// Input intent snapshot (AD-10). Keyboard only for now; the object is reused each frame.
export class Input {
  constructor(scene) {
    this.keys = scene.input.keyboard.addKeys('W,A,S,D,UP,LEFT,DOWN,RIGHT,SHIFT,SPACE,E,TAB,P');
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
      pause: false
    };
  }

  update() {
    const k = this.keys;
    const i = this.intent;
    let x = (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0);
    let y = (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0);
    if (x && y) { x *= Math.SQRT1_2; y *= Math.SQRT1_2; }
    i.move.x = x;
    i.move.y = y;
    i.sprint = k.SHIFT.isDown;
    i.jump = k.SPACE.isDown;
    i.interact = k.E.isDown;
    i.map = k.TAB.isDown;
    i.pause = k.P.isDown;
  }
}
