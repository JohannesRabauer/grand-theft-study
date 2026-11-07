import { uiText } from '../../ui/uiKit.js';
import { formatSec } from '../sportCore.js';

const WALL_W = 28;
const SIGHT = 0.68; // the runner stands this far down the view, so more of the course ahead shows
const SPRITE = 1.4;

// One player's lane of the Sport minigame: the gym seen from above and scrolling past the runner, who stays at a fixed
// spot of the view. The course (SportCore buildCourse) is laid out once in a container that only moves; textures come from
// sportArt.js, long floors are TileSprites. HUD: running time with the seconds of knocks, stamina bar, checkpoint pips,
// a message line. The game feeds it with render(runner) every frame and the knock / checkpoint events; the container is
// clipped by the opaque strips the game puts around the lanes.
export class SportTrack {
  constructor(scene, ctx, rect, { course, player, profile, jumpHeight, depth = 14 }) {
    this.scene = scene;
    this.rect = rect;
    this.course = course;
    const { x, y, w, h } = rect;
    const inv = ctx.res.inv;
    const laneW = course.laneW;
    const lx = this.lx = x + (w - laneW) / 2;
    this.anchorY = y + h * SIGHT;
    const reach = course.length + course.runOut;
    const top = reach + h;
    const world = this.world = scene.add.container(0, 0).setDepth(depth);
    const tile = (key, tx, ty, tw, th) => {
      const t = scene.add.tileSprite(tx, ty, tw, th, key).setOrigin(0).setTileScale(inv, inv);
      world.add(t);
      return t;
    };
    const image = (key, ix, d, oy = 0.5) => {
      const o = scene.add.image(ix, -d, key).setOrigin(0.5, oy).setScale(inv);
      world.add(o);
      return o;
    };

    tile('sport-floor', x, -top, w, top + h);
    tile('sport-bars', x, -top, WALL_W, top + h);
    tile('sport-bars', x + w - WALL_W, -top, WALL_W, top + h).setFlipX(true);
    tile('sport-track', lx, -reach, laneW, reach + 70);

    const lines = scene.add.graphics();
    world.add(lines);
    lines.fillStyle(0xf2f2f2, 0.9);
    lines.fillRect(lx, -reach, 2, reach + 70);
    lines.fillRect(lx + laneW - 2, -reach, 2, reach + 70);
    for (const s of course.sections) {
      if (s.type === 'hurdles') tile('sport-mat', lx + 2, -s.d1, laneW - 4, s.d1 - s.d0);
      if (s.type === 'beam') {
        tile('sport-mat', lx + 2, -s.d1, laneW - 4, s.d1 - s.d0);
        tile('sport-beam', lx + laneW / 2 - course.beam.w / 2, -s.d1, course.beam.w, s.d1 - s.d0);
      }
      if (s.type === 'slalom') {
        lines.fillStyle(0xffffff, 0.35);
        for (let d = s.d0 + 20; d < s.d1; d += 24) lines.fillRect(lx + laneW / 2 - 1, -d, 2, 10);
      }
      if (s.type === 'sprint') {
        lines.lineStyle(2, 0xffe0d0, 0.45);
        for (let d = s.d0 + 90; d < s.d1 - 40; d += 150) {
          lines.lineBetween(lx + laneW / 2 - 9, -d + 8, lx + laneW / 2, -d);
          lines.lineBetween(lx + laneW / 2 + 9, -d + 8, lx + laneW / 2, -d);
        }
      }
    }
    lines.fillStyle(0xffffff, 1);
    lines.fillRect(lx, 0, laneW, 3);

    this.flags = course.checkpoints.slice(0, -1).map(cp => [image('sport-flag', lx - 7, cp.d, 0.85), image('sport-flag', lx + laneW + 7, cp.d, 0.85)]);
    tile('sport-checker', lx, -course.length - 7, laneW, 14);
    for (const px of [lx - 5, lx + laneW + 1]) world.add(scene.add.rectangle(px, -course.length - 7, 4, 52, 0xd8d8e0).setOrigin(0, 1));
    world.add(scene.add.rectangle(lx - 5, -course.length - 52, laneW + 10, 12, 0xd33a3a).setOrigin(0));
    this.startLabel = uiText(scene, lx + laneW / 2, 10, '', { fontFamily: 'monospace', fontSize: '8px', color: '#ffffff' }).setOrigin(0.5, 0);
    this.finishLabel = uiText(scene, lx + laneW / 2, -course.length - 51, '', { fontFamily: 'monospace', fontSize: '8px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5, 0);
    world.add([this.startLabel, this.finishLabel]);

    this.cones = course.cones.map(c => image('sport-cone', lx + c.x, c.d, 0.85));
    this.hurdles = course.hurdles.map(hd => image('sport-hurdle', lx + laneW / 2, hd.d));

    this.shadow = scene.add.image(0, this.anchorY, 'sport-shadow').setScale(inv).setDepth(depth + 1);
    this.sprite = scene.add.image(0, this.anchorY, player.textureFor(profile)).setOrigin(0.5, 0.8).setScale(inv * SPRITE).setDepth(depth + 2);
    this.baseScale = inv * SPRITE;
    this.jumpHeight = jumpHeight;
    this.bob = 0;

    const hud = depth + 8;
    this.timeText = uiText(scene, x + 6, y + 4, '', { fontFamily: 'monospace', fontSize: '12px', fontStyle: 'bold', color: '#ffffff', stroke: '#000000', strokeThickness: 3 }).setDepth(hud);
    this.penText = uiText(scene, x + 6, y + 19, '', { fontFamily: 'monospace', fontSize: '8px', color: '#ffb347', stroke: '#000000', strokeThickness: 2 }).setDepth(hud);
    this.msg = uiText(scene, x + w / 2, y + 40, '', { fontFamily: 'monospace', fontSize: '9px', fontStyle: 'bold', color: '#ffe14d', align: 'center', stroke: '#000000', strokeThickness: 3, wordWrap: { width: w - 60 } }).setOrigin(0.5, 0).setDepth(hud).setVisible(false);
    this.staminaLabel = uiText(scene, x + 6, y + h - 22, '', { fontFamily: 'monospace', fontSize: '7px', color: '#ffffff', stroke: '#000000', strokeThickness: 2 }).setDepth(hud);
    this.barW = Math.min(90, w - 12);
    scene.add.rectangle(x + 6, y + h - 11, this.barW, 6, 0x000000, 0.6).setOrigin(0, 0.5).setStrokeStyle(1, 0xffffff, 0.8).setDepth(hud);
    this.stamina = scene.add.rectangle(x + 7, y + h - 11, this.barW - 2, 4, 0x6fe07a).setOrigin(0, 0.5).setDepth(hud + 1);
    this.pips = course.checkpoints.map((cp, i) => scene.add.circle(x + w - 8 - (course.checkpoints.length - 1 - i) * 9, y + 9, 3, 0x000000, 0.5).setStrokeStyle(1, 0xffffff, 0.8).setDepth(hud));
    this.timeShown = '';
    this.penShown = '';
    this.exhaustedShown = false;
  }

  retext(t) {
    this.startLabel.setText(t('minigame.sport.start'));
    this.finishLabel.setText(t('minigame.sport.finishLine'));
    this.staminaLabel.setText(t('minigame.sport.stamina'));
  }

  setMessage(text) {
    this.msg.setText(text).setVisible(text !== '');
  }

  knockCone(i) { this.cones[i].setTexture('sport-cone-down').setOrigin(0.5, 0.6).setAngle(i % 2 ? 8 : -8); }

  knockHurdle(i) { this.hurdles[i].setTexture('sport-hurdle-down'); }

  reachCheckpoint(i) {
    if (this.flags[i]) for (const f of this.flags[i]) f.setTexture('sport-flag-done');
    this.pips[i].setFillStyle(0x6fe07a, 1);
  }

  // Per frame: scroll the course to the runner, place and animate the sprite, update the HUD.
  render(runner, dtMs, nowMs) {
    this.world.y = this.anchorY + runner.d;
    const { sprite } = this;
    const speed = runner.ctrl.velSpeed;
    this.bob += speed * dtMs * 0.0004;
    const lift = Math.sin(Math.PI * runner.airPhase) * this.jumpHeight;
    const hop = runner.finished ? Math.abs(Math.sin(nowMs * 0.008)) * 3 : 0;
    const x = this.lx + runner.x;
    sprite.setPosition(x, this.anchorY - lift - hop - (speed > 5 ? Math.abs(Math.sin(this.bob)) * 1.5 : 0));
    sprite.setScale(this.baseScale, this.baseScale * (speed > 5 ? 1 + Math.sin(this.bob * 2) * 0.04 : 1));
    sprite.setAlpha(runner.stumbling && Math.floor(nowMs / 80) % 2 ? 0.55 : 1);
    sprite.setFlipX(runner.ctrl.vel.x < -8 ? true : runner.ctrl.vel.x > 8 ? false : sprite.flipX);
    this.shadow.setPosition(x, this.anchorY + 1).setScale((this.baseScale / SPRITE) * (1.2 - lift / 40));
    const time = formatSec((runner.finished ? runner.finishMs : runner.timeMs) / 1000);
    if (time !== this.timeShown) this.timeText.setText(this.timeShown = time);
    const pen = runner.penaltyMs > 0 ? `+${formatSec(runner.penaltyMs / 1000)}` : '';
    if (pen !== this.penShown) this.penText.setText(this.penShown = pen);
    this.stamina.width = Math.max(0, (this.barW - 2) * runner.ctrl.stamina);
    if (runner.tired !== this.exhaustedShown) {
      this.exhaustedShown = runner.tired;
      this.stamina.setFillStyle(runner.tired ? 0xffa940 : 0x6fe07a);
    }
  }
}
