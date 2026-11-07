import { Slingshot } from './Slingshot.js';

const IDLE = { move: { x: 0, y: 0 }, aim: null, toolUse: false, toolNext: false, toolPrev: false };

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
    // a pinned player (caught frame) drops the charge without firing; shots in flight finish
    if (this.player.pinned) this.current.unequip();
    const i = this.player.pinned ? IDLE : this.ctx.input.intents[this.player.index];
    if (i.toolNext) this.cycle(1);
    if (i.toolPrev) this.cycle(-1);
    // every tool updates so shots in flight finish after a switch
    for (const t of this.tools) t.update(dt, i, t === this.current);
  }
}
