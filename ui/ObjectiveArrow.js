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
    this.onState = (ev) => { if (ev.path === 'shared.flags.stolenBike' || ev.path === '') this.retarget(); };
    ctx.events.on('state:changed', this.onState);
    this.retarget();
  }

  // Points at the hideout of a stolen bike on this map, else at the goal of the current map; a map without one (an interior) shows no arrow.
  retarget() {
    const { ctx } = this;
    this.ts = ctx.map.tileSize;
    this.mpt = ctx.map.metersPerTile;
    const goal = ctx.map.objects.find(o => o.type === 'goal');
    const bike = ctx.state.shared.flags.stolenBike;
    this.bike = !!bike && bike.map === ctx.world.id;
    this.hasGoal = this.bike || !!goal;
    if (this.bike) {
      this.gx = bike.x;
      this.gy = bike.y;
    } else if (goal) {
      this.gx = (goal.x + goal.w / 2) * this.ts;
      this.gy = (goal.y + goal.h / 2) * this.ts;
    }
    const show = this.hasGoal && (this.bike || !this.done);
    this.arrow.setVisible(show);
    this.text.setVisible(show);
    this.lastMeters = -1;
  }

  destroy() {
    this.ctx.events.off('goal:reached', this.onReached);
    this.ctx.events.off('world:enter', this.onWorld);
    this.arrow.destroy();
    this.text.destroy();
    this.msg.destroy();
  }

  update() {
    if (!this.hasGoal || (this.done && !this.bike)) return;
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
      this.text.setText(this.ctx.t(this.bike ? 'hud.bike' : 'hud.goal', { m }));
    }
  }

  retext() {
    this.msg.setText(this.ctx.t('msg.arrived'));
    this.lastMeters = -1; // next update re-resolves the distance text
  }
}
