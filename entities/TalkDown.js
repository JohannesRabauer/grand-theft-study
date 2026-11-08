// Charme talk-down and question back-off (story 7.5, ctx.talkdown). Caught.trigger asks `intercept(player)` first. At Aerger levels 1-2 the
// kid gets a chance before being caught: the Charme check (data chase.talk.charm, from the kid's Charme attribute) may talk the bully down;
// if it fails a question from the learning engine (context bully) opens, and a right answer makes him back off. Either success ends the chase.
// A wrong answer is gentle: nobody is caught this time and the bully keeps coming after a short grace. Emits `talkdown:result`
// { player, how: 'charm' | 'question' | 'gentle', ok }. From level 3 the touch catches as before.
import { charmChance, talksAt } from '../services/talkLogic.js';

export class TalkDown {
  constructor(scene, ctx) {
    this.scene = scene;
    this.ctx = ctx;
    this.grace = 0; // seconds a touch is swallowed after a talk (counts while the world runs)
    this.rng = Math.random; // tests replace it
    this.pending = null;
    ctx.talkdown = this;
    ctx.events.on('activity:done', e => { if (e.id === 'talk') this.answered(e); });
  }

  get cfg() { return this.ctx.chase.cfg.talk; }

  // Returns true when the touch was handled here (talked down, a question opened, or swallowed in the grace) and must not catch.
  intercept(index) {
    const { ctx } = this;
    if (window.SCHULWEG_GAME?.talkOff) return false;
    if (this.grace > 0) return talksAt(this.cfg, ctx.chase.level);
    if (!talksAt(this.cfg, ctx.chase.level) || ctx.screens?.top()) return false;
    const p = ctx.players[index];
    if (this.rng() < charmChance(this.cfg, p.attrs.charme)) { this.succeed(index, 'charm'); return true; }
    this.grace = this.cfg.graceSeconds;
    this.pending = index;
    if (!ctx.activities.start('talk', index)) { this.pending = null; return true; }
    return true;
  }

  succeed(index, how) {
    const { ctx } = this;
    this.grace = this.cfg.graceSeconds;
    ctx.chase.lvl.clear('talkdown');
    ctx.events.emit('talkdown:result', { player: index, how, ok: true });
    ctx.events.emit('ui:toast', { key: `talk.${how}.ok` });
  }

  answered(e) {
    const index = this.pending ?? e.player;
    this.pending = null;
    if (e.correct >= 1) { this.succeed(index, 'question'); return; }
    this.grace = this.cfg.graceSeconds;
    this.ctx.events.emit('talkdown:result', { player: index, how: 'gentle', ok: false });
    this.ctx.events.emit('ui:toast', { key: 'talk.gentle' });
  }

  update(dt) { if (this.grace > 0) this.grace -= dt; }
}
