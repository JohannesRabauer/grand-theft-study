import { uiText } from '../../ui/uiKit.js';
import { noteY } from '../rhythmCore.js';

// One lane colour per move, left to right: dodge left, block high, Kiai, block low, dodge right.
const LANE_COLORS = [0x4dd0e1, 0xffd54f, 0xff6b9d, 0x9ccc65, 0xb39ddb];
const GRAY = 0x6c6a80;
const NOTE_H = 13;
const FLASH_MS = 130;
const JUDGE = { perfect: '#ffe14d', good: '#9be58f', miss: '#d9d5f0' };
const FONT = 'monospace';

// At most this many notes are on screen per player (scripts/check-karate.mjs proves the kata stay below it).
export const NOTE_POOL = 12;

// One player's dojo stage of the karate training: paper screens and a wooden floor, five lanes (one per move) with a glowing
// hit line, pad buttons with the move's arrow at the bottom (tap a lane anywhere to play it), the sensei's call of the next
// move, the Fokus meter with a breathing ring, and the combo. It draws a KarateSession and reports taps; all judging is the game's.
//   onTap(lane)   a lane was tapped or clicked
// The minigame calls render(now, session, phase) every frame.
export class KarateStage {
  constructor(scene, ctx, rect, { lanes, fallMs, depth = 14 }) {
    this.scene = scene;
    this.rect = rect;
    this.lanes = lanes;
    this.fallMs = fallMs;
    this.onTap = null;
    const { x, y, w, h } = rect;
    this.laneW = Math.min(60, Math.floor((w - 20) / lanes));
    this.x0 = x + (w - this.laneW * lanes) / 2;
    this.topY = y + 46;
    this.lineY = y + h - 52;
    const { add } = scene;
    const { x0, laneW, topY, lineY } = this;
    const span = laneW * lanes;
    this.cx = l => x0 + (l + 0.5) * laneW;
    add.rectangle(x, y, w, h, 0x2b2118).setOrigin(0).setDepth(depth);
    this.drawStatic(add.graphics().setDepth(depth + 1), x, y, w, h);
    this.glow = add.rectangle(x0, lineY - 5, span, 11, 0xffffff, 0.12).setOrigin(0).setDepth(depth + 2);
    add.rectangle(x0, lineY - 1, span, 3, 0xffffff, 0.9).setOrigin(0).setDepth(depth + 3);
    const arrows = add.graphics().setDepth(depth + 7);
    this.receptor = [];
    this.pad = [];
    this.flashUntil = new Float64Array(lanes);
    this.lit = new Array(lanes).fill(false);
    for (let l = 0; l < lanes; l++) {
      const col = LANE_COLORS[l % LANE_COLORS.length];
      this.receptor.push(add.rectangle(this.cx(l), lineY, laneW - 6, NOTE_H + 2, col, 0).setStrokeStyle(1.5, col, 0.9).setDepth(depth + 3));
      this.pad.push(add.rectangle(this.cx(l), lineY + 27, laneW - 4, 34, dim(col), 1).setStrokeStyle(2, col).setDepth(depth + 6));
      drawMove(arrows, l, lanes, this.cx(l), lineY + 27, 6, 0xffffff);
      uiText(scene, this.cx(l) - laneW / 2 + 5, lineY + 12, String(l + 1), { fontFamily: FONT, fontSize: '7px', color: '#ffffff' }).setOrigin(0, 0).setDepth(depth + 8).setAlpha(0.8);
      const zone = add.rectangle(x0 + l * laneW, topY, laneW, h - (topY - y), 0xffffff, 0.001).setOrigin(0).setDepth(depth + 9).setInteractive({ useHandCursor: true });
      zone.on('pointerdown', () => this.onTap?.(l));
    }
    this.notes = [];
    for (let i = 0; i < NOTE_POOL; i++) {
      const body = add.rectangle(0, 0, laneW - 10, NOTE_H, 0xffffff).setStrokeStyle(2, 0x2b2118);
      const icon = add.graphics();
      const box = add.container(0, 0, [body, icon]).setDepth(depth + 4).setVisible(false);
      this.notes.push({ box, body, icon, index: -1, state: -1 });
    }
    this.title = uiText(scene, x + w / 2, y + 2, '', { fontFamily: FONT, fontSize: '8px', color: '#ffe9a8', align: 'center' }).setOrigin(0.5, 0).setDepth(depth + 5);
    this.call = uiText(scene, x + w / 2, y + 13, '', { fontFamily: FONT, fontSize: '11px', fontStyle: 'bold', color: '#ffffff', stroke: '#000000', strokeThickness: 3, align: 'center' }).setOrigin(0.5, 0).setDepth(depth + 5);
    this.fokusBar = add.rectangle(x + 34, y + 33, w - 68, 4, 0x000000, 0.55).setOrigin(0, 0.5).setDepth(depth + 5);
    this.fokusFill = add.rectangle(x + 34, y + 33, 1, 4, 0x4dd0e1).setOrigin(0, 0.5).setDepth(depth + 6);
    this.fokusLabel = uiText(scene, x + 6, y + 33, '', { fontFamily: FONT, fontSize: '7px', color: '#9be7f0' }).setOrigin(0, 0.5).setDepth(depth + 5);
    this.ring = add.circle(x + w - 13, y + 33, 6).setStrokeStyle(2, 0xffffff).setDepth(depth + 5);
    this.comboText = uiText(scene, x + w / 2, topY + 4, '', { fontFamily: FONT, fontSize: '10px', fontStyle: 'bold', color: '#ffe14d', stroke: '#000000', strokeThickness: 3 }).setOrigin(0.5, 0).setDepth(depth + 5);
    this.judge = uiText(scene, x + w / 2, lineY - 30, '', { fontFamily: FONT, fontSize: '12px', fontStyle: 'bold', color: '#ffffff', stroke: '#000000', strokeThickness: 3 }).setOrigin(0.5).setDepth(depth + 7).setAlpha(0);
    this.banner = uiText(scene, x + w / 2, y + h / 2 - 10, '', { fontFamily: FONT, fontSize: '11px', fontStyle: 'bold', color: '#ffe14d', stroke: '#000000', strokeThickness: 4, align: 'center', wordWrap: { width: w - 24 } }).setOrigin(0.5).setDepth(depth + 12).setVisible(false);
    this.bannerBack = add.rectangle(x + w / 2, y + h / 2 - 10, w - 16, 64, 0x000000, 0.6).setDepth(depth + 11).setVisible(false);
  }

  drawStatic(gfx, x, y, w, h) {
    const { x0, laneW, topY, lineY, lanes } = this;
    // paper screens (shoji) on the back wall
    gfx.fillStyle(0xe9dcc0, 0.16).fillRect(x, y, w, topY - y - 2);
    gfx.fillStyle(0x4a3320, 0.9);
    for (let px = x + 8; px < x + w; px += 32) gfx.fillRect(px, y, 2, topY - y - 2);
    gfx.fillRect(x, y + 40, w, 2);
    gfx.fillStyle(0xc0392b, 1).fillRect(x, y, w, 2); // a red beam
    for (let l = 0; l < lanes; l++) {
      gfx.fillStyle(LANE_COLORS[l % LANE_COLORS.length], l % 2 ? 0.1 : 0.15).fillRect(x0 + l * laneW, topY, laneW, lineY - topY + 4);
      gfx.fillStyle(0xffffff, 0.12).fillRect(x0 + l * laneW, topY, 1, lineY - topY + 4);
    }
    gfx.fillStyle(0xffffff, 0.12).fillRect(x0 + laneW * lanes, topY, 1, lineY - topY + 4);
    // wooden dojo floor under the pads
    gfx.fillStyle(0x6b4a2b, 1).fillRect(x, lineY + 6, w, y + h - lineY - 6);
    gfx.fillStyle(0x4d341d, 1);
    for (let px = x + 12; px < x + w; px += 24) gfx.fillRect(px, lineY + 6, 1, y + h - lineY - 6);
    gfx.fillStyle(0xe8b04b, 1).fillRect(x, lineY + 6, w, 2);
  }

  retext(title) {
    this.title.setText(title);
  }

  setCall(text) {
    if (this.call.text !== text) this.call.setText(text);
  }

  setFokus(label) {
    this.fokusLabel.setText(label);
  }

  setCombo(text) {
    this.comboText.setText(text);
  }

  flash(lane, now) {
    this.flashUntil[lane] = now + FLASH_MS;
  }

  showJudge(grade, label) {
    const { judge, scene } = this;
    scene.tweens.killTweensOf(judge);
    judge.setText(label).setColor(JUDGE[grade]).setAlpha(1).setScale(1.3);
    scene.tweens.add({ targets: judge, scale: 1, alpha: 0, duration: 650, ease: 'Quad.easeOut' });
  }

  showBanner(text) {
    this.banner.setText(text).setVisible(true);
    this.bannerBack.setVisible(true);
  }

  // `phase` is 0..1 within the current step (the metronome ring), fokus 0..1 and calm come from the session.
  render(now, session, phase) {
    const { notes, topY, lineY, fallMs } = this;
    const { track } = session;
    track.range(now, fallMs, track.win.linger);
    for (const n of notes) n.used = false;
    for (let i = track.lo; i < track.hi; i++) {
      const st = track.state[i];
      if (st === 1 || st === 2) continue; // hit notes are gone
      const n = notes[i % NOTE_POOL];
      n.used = true;
      if (n.index !== i || n.state !== st) {
        const lane = track.lane[i];
        n.index = i;
        n.state = st;
        n.body.setFillStyle(st === 3 ? GRAY : LANE_COLORS[lane % LANE_COLORS.length]);
        n.icon.clear();
        drawMove(n.icon, lane, this.lanes, 0, 0, 4, 0x2b2118);
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
    const { fokus } = session;
    this.fokusFill.width = Math.max(1, (this.fokusBar.width) * fokus.value);
    this.fokusFill.setFillStyle(fokus.calm ? 0xffe14d : 0x4dd0e1);
    this.ring.setScale(1.5 - 0.5 * phase).setAlpha(fokus.calm ? 1 : 0.5 - 0.3 * phase);
    this.glow.setAlpha(0.28 - 0.2 * phase);
  }
}

// The picture of a move at (cx, cy): left / up / down / right arrows for the dodges and blocks, a burst for the Kiai.
function drawMove(gfx, lane, lanes, cx, cy, r, color) {
  gfx.fillStyle(color, 1);
  const mid = (lanes - 1) / 2;
  if (lane === mid) {
    gfx.fillRect(cx - 1, cy - r, 2, r * 2 - 3).fillRect(cx - 1, cy + r - 2, 2, 2); // an exclamation mark
  } else if (lane === 0) gfx.fillTriangle(cx - r, cy, cx + r - 1, cy - r, cx + r - 1, cy + r);
  else if (lane === lanes - 1) gfx.fillTriangle(cx + r, cy, cx - r + 1, cy - r, cx - r + 1, cy + r);
  else if (lane < mid) gfx.fillTriangle(cx, cy - r, cx - r, cy + r - 1, cx + r, cy + r - 1);
  else gfx.fillTriangle(cx, cy + r, cx - r, cy - r + 1, cx + r, cy - r + 1);
}

function dim(col) {
  const r = (col >> 16) & 255;
  const g = (col >> 8) & 255;
  const b = col & 255;
  return ((r * 0.45) << 16) | ((g * 0.45) << 8) | (b * 0.45);
}
