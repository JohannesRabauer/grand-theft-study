import { Slingshot } from './Slingshot.js';

// One belt per player (player.toolbelt): holds the tools and cycles through them with that player's
// toolNext / toolPrev intents; emits `tool:changed` { player, id }. Only the slingshot exists so far.
export class ToolBelt {
  constructor(scene, ctx, cfg, player) {
    this.ctx = ctx;
    this.player = player;
    this.tools = [new Slingshot(scene, ctx, cfg, player)];
    this.index = 0;
    this.current.equip();
  }

  get current() { return this.tools[this.index]; }

  cycle(step) {
    const n = this.tools.length;
    if (n < 2) return;
    this.current.unequip();
    this.index = (this.index + step + n) % n;
    this.current.equip();
    this.ctx.events.emit('tool:changed', { player: this.player.index, id: this.current.id });
  }

  update(dt) {
    const i = this.ctx.input.intents[this.player.index];
    if (i.toolNext) this.cycle(1);
    if (i.toolPrev) this.cycle(-1);
    // every tool updates so shots in flight finish after a switch
    for (const t of this.tools) t.update(dt, i, t === this.current);
  }
}
