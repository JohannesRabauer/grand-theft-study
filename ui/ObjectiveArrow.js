// GTA-style objective arrow for one player (or, with playerIndex null, for the camera centre of a co-op game): orbits it on screen and points at the school goal, with the
// distance in meters. While a bike is stolen (flag `stolenBike`, entities/BikeTheft.js) it points at the hideout instead,
// until the epic 9 quest runner takes the objective over. Drawn in UIScene space (480x270, whatever the render size); reads the game camera, never the world state mutably.
import { uiText } from './uiKit.js';

export class ObjectiveArrow {
  constructor(scene, ctx, game, playerIndex = 0) {
    this.ctx = ctx;
    this.playerIndex = playerIndex;
    this.game = game;
    this.cam = game.cameras.main;
    this.arrow = scene.add.image(0, 0, 'arrow').setScale(ctx.res.inv).setDepth(10);
    this.text = uiText(scene, 0, 0, '', { fontFamily: 'monospace', fontSize: '8px', color: '#ffe14d', stroke: '#000000', strokeThickness: 2 })
      .setOrigin(0.5).setDepth(10);
    this.questLine = uiText(scene, ctx.res.w / 2, 40, '', { fontFamily: 'monospace', fontSize: '9px', color: '#9be58f', stroke: '#000000', strokeThickness: 2, align: 'center' }).setOrigin(0.5).setDepth(10).setVisible(false);
    this.lastMeters = -1;
    this.done = false;
    const sw = ctx.res.w;
    this.msg = uiText(scene, sw / 2, 60, ctx.t('msg.arrived'), { fontFamily: 'monospace', fontSize: '14px', color: '#ffffff', stroke: '#000000', strokeThickness: 3 })
      .setOrigin(0.5).setDepth(10).setVisible(false);
    this.onReached = (ev) => {
      if ((this.playerIndex !== null && ev.player !== this.playerIndex) || this.done) return; // the shared arrow shows the arrival once
      this.done = true;
      this.arrow.setVisible(false);
      this.text.setVisible(false);
      this.msg.setVisible(true);
      scene.time.delayedCall(4000, () => this.msg.setVisible(false));
    };
    ctx.events.on('goal:reached', this.onReached);
    this.onWorld = () => this.retarget();
    ctx.events.on('world:enter', this.onWorld);
    this.onState = (ev) => { if (ev.path === 'shared.flags.stolenBike' || ev.path === 'shared.quests' || ev.path === 'shared.clock' || ev.path === '') this.retarget(); };
    ctx.events.on('state:changed', this.onState);
    this.retarget();
  }

  // Points at the hideout of a stolen bike on this map, else at the goal of the current map; a map without one (an interior) shows no arrow.
  retarget() {
    const { ctx } = this;
    const before = `${this.gx},${this.gy},${this.bike},${!!this.quest}`;
    this.ts = ctx.map.tileSize;
    this.mpt = ctx.map.metersPerTile;
    const goal = ctx.map.objects.find(o => o.type === 'goal');
    const bike = ctx.state.shared.flags.stolenBike;
    const quest = ctx.quests?.objective() ?? ctx.dayFlow?.objective() ?? null; // an open mission step takes the arrow over (story 9.1), after school it points home (8.5)
    this.quest = quest && quest.map === ctx.world.id ? quest : null;
    this.bike = !this.quest && !!bike && bike.map === ctx.world.id;
    this.hasGoal = !!this.quest || this.bike || !!goal;
    this.setQuestLine(quest);
    if (this.quest) {
      this.gx = (quest.x + 0.5) * this.ts;
      this.gy = (quest.y + 0.5) * this.ts;
    } else if (this.bike) {
      this.gx = bike.x;
      this.gy = bike.y;
    } else if (goal) {
      this.gx = (goal.x + goal.w / 2) * this.ts;
      this.gy = (goal.y + goal.h / 2) * this.ts;
    }
    const show = this.hasGoal && (this.bike || !!this.quest || !this.done);
    this.arrow.setVisible(show);
    this.text.setVisible(show);
    if (before !== `${this.gx},${this.gy},${this.bike},${!!this.quest}`) this.lastMeters = -1; // only a new goal needs the distance text again
  }

  // The mission line under the clock; a race adds its checkpoint and the seconds left. Only touches the text when it changed.
  setQuestLine(quest) {
    const line = quest ? `${quest.title ? `${quest.title}: ` : ''}${this.ctx.t(quest.text)}${quest.live ? ` (${quest.checkpoint}/${quest.total}, ${quest.timer}s)` : ''}` : '';
    this.questLine.setVisible(!!quest);
    if (line !== this.questLineText) { this.questLine.setText(line); this.questLineText = line; }
  }

  destroy() {
    this.ctx.events.off('goal:reached', this.onReached);
    this.ctx.events.off('world:enter', this.onWorld);
    this.arrow.destroy();
    this.text.destroy();
    this.msg.destroy();
    this.questLine.destroy();
    this.ctx.events.off('state:changed', this.onState);
  }

  update() {
    if (this.quest?.live) this.retarget(); // a race moves its goal and counts down every second
    if (!this.hasGoal || (this.done && !this.bike && !this.quest)) return;
    const player = this.playerIndex === null ? this.game.focus : this.ctx.players[this.playerIndex];
    const cam = this.cam;
    // player on screen in UI units: from the live scroll (worldView is only refreshed at render time)
    const { zoom } = cam;
    const k = 1 / this.ctx.res.scale;
    const sx = ((player.x - cam.scrollX - cam.width / 2) * zoom + cam.width / 2) * k;
    const sy = ((player.y - cam.scrollY - cam.height / 2) * zoom + cam.height / 2) * k;
    const dx = this.gx - player.x;
    const dy = this.gy - player.y;
    const dist = Math.hypot(dx, dy);
    const nx = dx / dist;
    const ny = dy / dist;
    const r = 30;
    this.arrow.setPosition(sx + nx * r, sy + ny * r).setRotation(Math.atan2(dy, dx));
    this.text.setPosition(Phaser.Math.Clamp(sx + nx * (r + 12), 36, 444), Phaser.Math.Clamp(sy + ny * (r + 12), 8, 262));
    const m = Math.round((dist / this.ts) * this.mpt / 5) * 5; // 5 m steps, so the text rarely changes
    if (m !== this.lastMeters) {
      this.lastMeters = m;
      this.text.setText(this.ctx.t(this.bike ? 'hud.bike' : this.quest ? 'hud.mission' : 'hud.goal', { m }));
    }
  }

  retext() {
    this.msg.setText(this.ctx.t('msg.arrived'));
    if (this.quest) { this.questLineText = null; this.setQuestLine(this.quest); }
    this.lastMeters = -1; // next update re-resolves the distance text
  }
}
