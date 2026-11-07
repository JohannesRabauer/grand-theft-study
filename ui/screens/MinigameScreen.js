// The screen a running minigame holds on the stack (AD-20, AD-27). It draws nothing: it is what freezes the world
// for the minigame's whole run (data/screens.json), and as the top screen it receives P1's intents, of which only
// pause matters (the minigame scene itself reads every player's intents).
export class MinigameScreen {
  constructor(ctx) {
    this.id = 'minigame';
    this.ctx = ctx;
  }

  create() {}

  handleIntent(intent) {
    if (intent.pause) this.ctx.events.emit('ui:pause-toggle');
  }

  destroy() {}
}
