import { uiText } from '../../ui/uiKit.js';
import { noteY } from '../rhythmCore.js';

const LANE_COLORS = [0xff6b9d, 0x4dd0e1, 0xffd54f, 0x9ccc65];
const GRAY = 0x6c6a80;
const NOTE_H = 12;
const FLASH_MS = 130;
const JUDGE = { perfect: '#ffe14d', good: '#9be58f', miss: '#b9b6d6' };

// Note slots: at most this many notes are on screen per player (scripts/check-musik.mjs proves the songs stay below it).
export const NOTE_POOL = 16;

// One player's stage of the Musik minigame: a small concert stage with curtains and spotlights, one lane per note
// colour, a glowing hit line, pad buttons with arrows at the bottom (tap a lane anywhere to play it) and a metronome
// ring in the corner for the beat. It draws the NoteTrack (rhythmCore.js) and reports taps; all judging is the game's.
//   onTap(lane)   a lane was tapped or clicked
// The minigame calls render(now, track, phase) every frame.
export class RhythmStage {
  constructor(scene, ctx, rect, { lanes, fallMs, lingerMs, depth = 14 }) {
    this.scene = scene;
    this.rect = rect;
    this.lanes = lanes;
    this.fallMs = fallMs;
    this.lingerMs = lingerMs;
    this.onTap = null;
    this.title = '';
    const { x, y, w, h } = rect;
    this.laneW = Math.min(58, Math.floor((w - 30) / lanes));
    this.x0 = x + (w - this.laneW * lanes) / 2;
    this.topY = y + 26;
    this.lineY = y + h - 54;
    const add = scene.add;
    const { x0, laneW, topY, lineY } = this;
    const span = laneW * lanes;
    add.rectangle(x, y, w, h, 0x1b1235).setOrigin(0).setDepth(depth);
    const gfx = add.graphics().setDepth(depth + 1);
    this.drawStatic(gfx, x, y, w, h);
    const arrows = add.graphics().setDepth(depth + 7); // over the pads
    this.cx = l => x0 + (l + 0.5) * laneW;
    this.glow = add.rectangle(x0, lineY - 5, span, 11, 0xffffff, 0.12).setOrigin(0).setDepth(depth + 2);
    add.rectangle(x0, lineY - 1, span, 3, 0xffffff, 0.9).setOrigin(0).setDepth(depth + 3);
    this.receptor = [];
    this.pad = [];
    this.flashUntil = new Float64Array(lanes);
    this.lit = new Array(lanes).fill(false);
    for (let l = 0; l < lanes; l++) {
      const col = LANE_COLORS[l % LANE_COLORS.length];
      this.receptor.push(add.rectangle(this.cx(l), lineY, laneW - 8, NOTE_H + 2, col, 0).setStrokeStyle(1.5, col, 0.9).setDepth(depth + 3));
      const pad = add.rectangle(this.cx(l), lineY + 10 + 17, laneW - 6, 34, dim(col), 1).setStrokeStyle(2, col).setDepth(depth + 6);
      this.pad.push(pad);
      this.drawArrow(arrows, l, this.cx(l), lineY + 27);
      uiText(scene, this.cx(l) - laneW / 2 + 6, lineY + 14, String(l + 1), { fontFamily: 'monospace', fontSize: '7px', color: '#ffffff' }).setOrigin(0, 0).setDepth(depth + 8).setAlpha(0.8);
      const zone = add.rectangle(x0 + l * laneW, topY, laneW, h - (topY - y), 0xffffff, 0.001).setOrigin(0).setDepth(depth + 9).setInteractive({ useHandCursor: true });
      zone.on('pointerdown', () => this.onTap?.(l));
    }
    this.notes = [];
    for (let i = 0; i < NOTE_POOL; i++) {
      const body = add.rectangle(0, 0, laneW - 12, NOTE_H, 0xffffff).setStrokeStyle(2, 0x1b1235);
      const shine = add.rectangle(0, -3, laneW - 20, 2, 0xffffff, 0.6);
      const box = add.container(0, 0, [body, shine]).setDepth(depth + 4).setVisible(false);
      this.notes.push({ box, body, index: -1, state: -1 });
    }
    this.ring = add.circle(x + w - 22, y + 13, 6).setStrokeStyle(2, 0xffffff).setDepth(depth + 5);
    add.circle(x + w - 22, y + 13, 2, 0xffe14d).setDepth(depth + 5);
    this.songText = uiText(scene, x + 18, y + 4, '', { fontFamily: 'monospace', fontSize: '8px', color: '#c9b8ff' }).setDepth(depth + 5);
    this.bonusText = uiText(scene, x + 18, y + 14, '', { fontFamily: 'monospace', fontSize: '7px', color: '#ffd54f' }).setDepth(depth + 5);
    this.comboText = uiText(scene, x + w / 2, y + 35, '', { fontFamily: 'monospace', fontSize: '11px', fontStyle: 'bold', color: '#ffe14d', stroke: '#000000', strokeThickness: 3 }).setOrigin(0.5).setDepth(depth + 5);
    this.judge = uiText(scene, x + w / 2, lineY - 30, '', { fontFamily: 'monospace', fontSize: '13px', fontStyle: 'bold', color: '#ffffff', stroke: '#000000', strokeThickness: 3 }).setOrigin(0.5).setDepth(depth + 7).setAlpha(0);
  }

  drawStatic(gfx, x, y, w, h) {
    const { x0, laneW, topY, lineY, lanes } = this;
    const span = laneW * lanes;
    // spotlight cones
    gfx.fillStyle(0xfff3b0, 0.07).fillTriangle(x + 20, y, x + w * 0.3, lineY, x + w * 0.7, lineY);
    gfx.fillStyle(0xb0e8ff, 0.06).fillTriangle(x + w - 20, y, x + w * 0.3, lineY, x + w * 0.7, lineY);
    // lane strips
    for (let l = 0; l < lanes; l++) {
      gfx.fillStyle(LANE_COLORS[l % LANE_COLORS.length], l % 2 ? 0.1 : 0.15).fillRect(x0 + l * laneW, topY, laneW, lineY - topY + 4);
      gfx.fillStyle(0xffffff, 0.12).fillRect(x0 + l * laneW, topY, 1, lineY - topY + 4);
    }
    gfx.fillStyle(0xffffff, 0.12).fillRect(x0 + span, topY, 1, lineY - topY + 4);
    // wooden stage floor under the pads
    gfx.fillStyle(0x4a3320, 1).fillRect(x, lineY + 6, w, y + h - lineY - 6);
    gfx.fillStyle(0x2f1f12, 1);
    for (let px = x + 12; px < x + w; px += 24) gfx.fillRect(px, lineY + 6, 1, y + h - lineY - 6);
    gfx.fillStyle(0xe8b04b, 1).fillRect(x, lineY + 6, w, 2);
    // curtains with folds and a gold valance
    gfx.fillStyle(0x8e1b3a, 1).fillRect(x, y, 14, h).fillRect(x + w - 14, y, 14, h).fillRect(x, y, w, 7);
    gfx.fillStyle(0x6d1230, 1);
    for (const cx of [x + 4, x + 9, x + w - 5, x + w - 10]) gfx.fillRect(cx, y + 7, 2, h - 7);
    gfx.fillStyle(0xe8b04b, 1).fillRect(x, y + 7, w, 1);
  }

  drawArrow(gfx, lane, cx, cy) {
    gfx.fillStyle(0xffffff, 1);
    const r = 7;
    if (lane === 0) gfx.fillTriangle(cx - r, cy, cx + r - 2, cy - r, cx + r - 2, cy + r);
    else if (lane === this.lanes - 1) gfx.fillTriangle(cx + r, cy, cx - r + 2, cy - r, cx - r + 2, cy + r);
    else if (lane === 1) gfx.fillTriangle(cx, cy + r, cx - r, cy - r + 2, cx + r, cy - r + 2);
    else gfx.fillTriangle(cx, cy - r, cx - r, cy + r - 2, cx + r, cy + r - 2);
  }

  retext(title, bonusLabel) {
    this.songText.setText(title);
    this.bonusText.setText(bonusLabel ?? '');
  }

  setCombo(text) {
    this.comboText.setText(text);
  }

  flash(lane, now) {
    this.flashUntil[lane] = now + FLASH_MS;
  }

  // "Perfect!" / "Good!" / a gentle miss label above the line.
  showJudge(grade, label) {
    const { judge, scene } = this;
    scene.tweens.killTweensOf(judge);
    judge.setText(label).setColor(JUDGE[grade]).setAlpha(1).setScale(1.3);
    scene.tweens.add({ targets: judge, scale: 1, alpha: 0, duration: 650, ease: 'Quad.easeOut' });
  }

  render(now, track, phase) {
    const { notes, topY, lineY, fallMs } = this;
    track.range(now, fallMs, this.lingerMs);
    for (const n of notes) n.used = false;
    for (let i = track.lo; i < track.hi; i++) {
      const st = track.state[i];
      if (st === 1 || st === 2) continue; // hit notes are gone
      const n = notes[i % NOTE_POOL];
      n.used = true;
      if (n.index !== i || n.state !== st) {
        n.index = i;
        n.state = st;
        n.body.setFillStyle(st === 3 ? GRAY : LANE_COLORS[track.lane[i] % LANE_COLORS.length]);
        n.box.setAlpha(st === 3 ? 0.45 : 1);
      }
      n.box.setPosition(this.cx(track.lane[i]), noteY(track.t[i], now, fallMs, topY, lineY)).setVisible(true);
    }
    for (const n of notes) if (!n.used && n.box.visible) n.box.setVisible(false);
    for (let l = 0; l < this.lanes; l++) {
      const on = now < this.flashUntil[l];
      if (on === this.lit[l]) continue;
      this.lit[l] = on;
      const col = LANE_COLORS[l % LANE_COLORS.length];
      this.pad[l].setScale(on ? 1.06 : 1).setFillStyle(on ? col : dim(col));
      this.receptor[l].setFillStyle(col, on ? 0.55 : 0);
    }
    this.ring.setScale(1.6 - 0.6 * phase).setAlpha(1 - 0.65 * phase);
    this.glow.setAlpha(0.28 - 0.2 * phase);
  }
}

function dim(col) {
  const r = (col >> 16) & 255;
  const g = (col >> 8) & 255;
  const b = col & 255;
  return ((r * 0.45) << 16) | ((g * 0.45) << 8) | (b * 0.45);
}
