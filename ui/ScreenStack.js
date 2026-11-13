// Stack of UI screens (AD-27). Only the top screen receives intents. A screen is any object with an `id`,
// create(), destroy() and handleIntent(intent); whether it freezes the world is read from data/screens.json
// by id, never decided by the screen. Freezes are counted, so nested screens restore the world only when
// the last freezing one is gone. The stack itself does not touch the world: it reports transitions through
// `onFreeze(bool)`. No Phaser here, so it is checked in node (scripts/check-ui.mjs).
export class ScreenStack {
  constructor(defs, onFreeze) {
    this.defs = defs;
    this.onFreeze = onFreeze;
    this.onOpen = null; // optional (story 16.14): UIScene eases a screen in after its create()
    this.screens = [];
    this.freezes = 0;
  }

  get size() { return this.screens.length; }

  get frozen() { return this.freezes > 0; }

  top() { return this.screens[this.screens.length - 1] ?? null; }

  push(screen) {
    const def = this.defs[screen.id];
    if (!def) throw new Error(`screen "${screen.id}" is not declared in data/screens.json`);
    screen.freezesWorld = def.freezesWorld === true;
    this.screens.push(screen);
    if (screen.freezesWorld && ++this.freezes === 1) this.onFreeze(true);
    screen.create();
    this.onOpen?.(screen);
    return screen;
  }

  pop() {
    const screen = this.screens.pop();
    if (!screen) return null;
    screen.destroy();
    if (screen.freezesWorld && --this.freezes === 0) this.onFreeze(false);
    return screen;
  }

  // Routes this frame's intent to the top screen only; returns false when no screen is open.
  route(intent) {
    const screen = this.top();
    if (!screen) return false;
    screen.handleIntent(intent);
    return true;
  }

  retext() {
    for (const s of this.screens) s.retext?.();
  }

  clear() {
    while (this.screens.length) this.pop();
  }
}
