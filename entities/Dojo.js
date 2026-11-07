import { addCircle } from '../physics/bodies.js';
import { SpeechBubbles } from './SpeechBubbles.js';
import { drawInterior, drawRack } from '../scenes/DojoArt.js';

// The dojo (story 6.4, AD-24/AD-28): `dojo` map objects, each with a role. In the town the `building` is the dojo's facade (a texture
// over the wall tiles, with the sign board "Dojo Kleiner Drache" on it); the door in front of it is a normal `door` object that leads to
// the map `dojo`. In that interior the `sensei` spot is where the master stands, `mats` is the training area and `rack` the belt rack.
//
// The sensei is a friendly pooled pedestrian-category character (one slot, pool `sensei`, an NPC body that only stands in the way,
// nothing ever pushes or hurts him). He greets every kid who comes close with a warm, funny line about calm and respect
// (i18n dojo.sensei.greet.N), and interact next to him starts the training (the `karate` minigame): the kid who asked and, when the
// other kid stands close, the other one too, each on their own belt. A kid with no session left today only hears a gentle
// "come back tomorrow" (ctx.karate.canTrain). After a promotion he adds the line about what the new belt unlocks.
export class Dojo {
  constructor(scene, ctx, cfg) {
    this.scene = scene;
    this.ctx = ctx;
    this.cfg = cfg;
    this.sensei = new Sensei(scene, ctx, cfg.sensei);
    this.bubbles = new SpeechBubbles(scene, ctx, 2, 'dojoBubbles');
    this.near = new Uint8Array(ctx.maxPlayers);
    this.line = 0;
    this.cheered = false; // a promotion line was said after this training: it stays instead of the plain praise
    this.running = false; // a training is on, or its result screen was closed this very frame (the confirm press must not start the next one)
    this.roles = {};
    this.parts = [];
    this.facade = null;
    this.label = null;
    this.rack = null;
    this.loadMap();
    ctx.world.register(this);
    const { events } = ctx;
    ctx.pools.register('sensei', { live: () => (this.sensei.active ? 1 : 0), cap: 1 });
    events.on('karate:belt', () => this.drawRack());
    events.on('karate:celebrate', e => {
      this.cheered = true;
      if (this.sensei.active) this.say(ctx.t(`karate.unlock.${e.belt}`));
    });
    events.on('world:enter', () => { if (this.sensei.active) events.emit('ui:toast', { key: 'dojo.hint' }); });
    events.on('lang:changed', () => this.label?.setText(ctx.t('dojo.signboard')));
  }

  loadMap() {
    const { ctx, scene } = this;
    const ts = ctx.map.tileSize;
    this.roles = {};
    for (const o of ctx.map.objects) if (o.type === 'dojo') this.roles[o.role] = o;
    const { building, sensei, rack } = this.roles;
    if (building) this.drawFacade(building, ts);
    if (sensei) {
      this.sensei.activate((sensei.x + 0.5) * ts, (sensei.y + 0.5) * ts);
      const gfx = scene.add.graphics().setDepth(-0.4);
      drawInterior(gfx, ctx.map, this.roles);
      this.parts.push(gfx);
      if (rack) {
        this.rack = scene.add.graphics().setDepth(-0.35);
        this.parts.push(this.rack);
        this.drawRack();
      }
    }
  }

  drawFacade(o, ts) {
    const { ctx, scene } = this;
    const top = (o.y - 1) * ts;
    const depth = (o.y + o.h) * ts;
    this.facade = scene.add.image(o.x * ts, top, 'dojo-facade').setOrigin(0).setScale(ctx.res.inv).setDepth(depth);
    this.label = scene.add.text((o.x + o.w / 2) * ts, top + 25, ctx.t('dojo.signboard'), {
      fontFamily: 'monospace', fontSize: '8px', color: '#ffe9a8', resolution: Math.round(ctx.res.scale * 2)
    }).setOrigin(0.5).setScale(0.75).setDepth(depth + 0.1);
  }

  drawRack() {
    if (!this.rack) return;
    const { ctx, cfg } = this;
    const earned = Math.max(...ctx.state.players.map(p => cfg.belts.findIndex(b => b.id === p.karate.belt)));
    drawRack(this.rack, this.roles.rack, ctx.map.tileSize, cfg.belts, earned);
  }

  unloadMap() {
    this.facade?.destroy();
    this.label?.destroy();
    this.facade = this.label = this.rack = null;
    for (const part of this.parts) part.destroy();
    this.parts.length = 0;
    this.roles = {};
    this.sensei.deactivate();
    this.bubbles.clear();
    this.near.fill(0);
  }

  say(text) {
    this.bubbles.say(this.sensei, text, this.cfg.sensei.bubbleSeconds);
  }

  update(dt) {
    const { sensei, ctx, cfg } = this;
    if (!sensei.active) return;
    const { bubbleRadius, interactReach, lines } = cfg.sensei;
    for (const p of ctx.players) {
      const d = Math.hypot(p.x - sensei.x, p.y - sensei.y);
      if (d <= bubbleRadius && !this.near[p.index]) {
        this.near[p.index] = 1;
        this.say(ctx.t(`dojo.sensei.greet.${1 + (this.line++ % lines)}`));
      } else if (d > bubbleRadius * 1.3) this.near[p.index] = 0;
      if (d <= interactReach && ctx.input.intents[p.index].interact && !p.pinned && !this.running && !ctx.minigames.active) this.train(p.index);
    }
    this.bubbles.update(dt);
  }

  // The kid who asked trains, and the other kid when close by. Kids without a session left today are left out.
  train(asker) {
    const { ctx, cfg, sensei } = this;
    const group = ctx.players.filter(p => p.index === asker || Math.hypot(p.x - sensei.x, p.y - sensei.y) <= cfg.training.joinRadius).map(p => p.index);
    const ready = group.filter(i => ctx.karate.canTrain(i));
    if (!ready.length) {
      this.say(ctx.t(`dojo.sensei.closed.${1 + (this.line++ % 2)}`));
      return;
    }
    this.say(ctx.t('dojo.sensei.start'));
    this.running = true;
    this.cheered = false;
    ctx.minigames.start('karate', { players: ready, context: 'karate' }).then(result => {
      this.running = false;
      if (!result.quit && !this.cheered) this.say(ctx.t(`dojo.sensei.after.${1 + (this.line++ % 3)}`));
    }, err => {
      this.running = false;
      console.warn(err.message);
    });
  }
}

// The master: a sprite and a still NPC-category body that only stands in the way (the kids shove nothing, he does not move).
class Sensei {
  constructor(scene, ctx, cfg) {
    this.matter = scene.matter;
    this.world = scene.matter.world;
    this.sprite = scene.add.image(0, 0, 'sensei').setScale(ctx.res.inv).setOrigin(0.5, 0.88).setVisible(false);
    this.body = addCircle(scene, 0, 0, cfg.radius, 'NPC', { isStatic: true });
    this.world.remove(this.body);
    this.active = false;
    this.x = 0;
    this.y = 0;
  }

  activate(x, y) {
    this.x = x;
    this.y = y;
    this.matter.body.setPosition(this.body, { x, y });
    this.world.add(this.body);
    this.sprite.setPosition(x, y).setDepth(y).setVisible(true);
    this.active = true;
  }

  deactivate() {
    if (!this.active) return;
    this.active = false;
    this.sprite.setVisible(false);
    this.world.remove(this.body);
  }
}
