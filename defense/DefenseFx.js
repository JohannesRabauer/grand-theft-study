// Visuals of the karate defense (story 6.3), all procedural and comic: the guard arc in front of a blocking kid, the "KIAI!" speech
// burst with a spiky star and the expanding shockwave rings of a Kiai (in the kid's jacket colours), and a quick flash for a parry.
// One Graphics and one Text per player, redrawn only while something is showing. Harmless by design: no hit or impact imagery.
const TAU = Math.PI * 2;
const SPIKES = 10;
const RAYS = 14;
const FALLBACK = '#f06a5c';

const easeOut = u => 1 - (1 - u) * (1 - u);
const clamp01 = u => Math.min(1, Math.max(0, u));

export class DefenseFx {
  constructor(scene, ctx, cfg) {
    this.ctx = ctx;
    this.cfg = cfg.fx;
    const res = Math.round(ctx.res.scale * 2);
    this.slots = [];
    for (let i = 0; i < ctx.maxPlayers; i++) {
      const g = scene.add.graphics().setDepth(9000);
      const text = scene.add.text(0, 0, '', {
        fontFamily: 'monospace', fontSize: '12px', fontStyle: 'bold', color: '#d9301f', stroke: '#16161e', strokeThickness: 3, resolution: res
      }).setOrigin(0.5, 0.5).setDepth(9501).setVisible(false);
      this.slots.push({ g, text, dirty: false, ringT: -1, shoutT: -1, flashT: -1, x: 0, y: 0, r: 0, color: 0xffffff });
    }
  }

  // The Kiai goes off at (x, y): rings out to `radius`, "KIAI!" over the kid's head.
  kiai(i, player, radius) {
    const s = this.slots[i];
    s.ringT = 0;
    s.shoutT = 0;
    s.x = player.x;
    s.y = player.y;
    s.r = radius;
    s.color = Phaser.Display.Color.HexStringToColor(player.character?.palette.jacketLight ?? FALLBACK).color;
    s.text.setText(this.ctx.t('defense.kiaiShout'));
  }

  // A perfectly timed block: a quick white flash at the guard.
  parry(i, player) {
    const s = this.slots[i];
    s.flashT = 0;
    s.x = player.x;
    s.y = player.y;
  }

  clear(i) {
    const s = this.slots[i];
    s.ringT = s.shoutT = s.flashT = -1;
    s.text.setVisible(false);
    if (s.dirty) { s.g.clear(); s.dirty = false; }
  }

  retext() {
    for (const s of this.slots) if (s.shoutT >= 0) s.text.setText(this.ctx.t('defense.kiaiShout'));
  }

  // `guard` is 0..1 of the block still holding (0 = not blocking).
  update(i, player, guard, dt) {
    const s = this.slots[i];
    const busy = guard > 0 || s.ringT >= 0 || s.shoutT >= 0 || s.flashT >= 0;
    if (!busy) {
      if (s.dirty) { s.g.clear(); s.dirty = false; }
      return;
    }
    const g = s.g.clear();
    s.dirty = true;
    if (guard > 0) this.drawGuard(g, player, guard);
    if (s.ringT >= 0) {
      s.ringT += dt;
      if (s.ringT >= this.cfg.ringSeconds) s.ringT = -1; else this.drawRings(g, s);
    }
    if (s.flashT >= 0) {
      s.flashT += dt;
      if (s.flashT >= 0.25) s.flashT = -1; else this.drawFlash(g, s);
    }
    if (s.shoutT >= 0) {
      s.shoutT += dt;
      if (s.shoutT >= this.cfg.shoutSeconds) { s.shoutT = -1; s.text.setVisible(false); } else this.drawShout(g, s, player);
    }
  }

  drawGuard(g, player, guard) {
    const a = player.move.heading;
    const cx = player.x + Math.cos(a) * 4;
    const cy = player.y - 6 + Math.sin(a) * 4;
    g.fillStyle(0x9fe0ff, 0.22 + 0.2 * guard).slice(cx, cy, 15, a - 1.05, a + 1.05, false).fillPath();
    g.lineStyle(2, 0xffffff, 0.35 + 0.55 * guard).beginPath().arc(cx, cy, 15, a - 1.05, a + 1.05).strokePath();
  }

  drawRings(g, s) {
    const dur = this.cfg.ringSeconds;
    for (let k = 0; k < 3; k++) {
      const u = clamp01((s.ringT - k * 0.07) / dur);
      if (u <= 0 || u >= 1) continue;
      const r = s.r * easeOut(u);
      const col = k === 1 ? 0xffffff : s.color;
      g.lineStyle(4 - k, col, (1 - u) * 0.9).strokeCircle(s.x, s.y, r);
      if (k === 0) {
        g.fillStyle(s.color, 0.16 * (1 - u)).fillCircle(s.x, s.y, r);
        g.lineStyle(2, 0xffffff, (1 - u) * 0.8);
        for (let n = 0; n < RAYS; n++) {
          const a = (n / RAYS) * TAU + 0.2;
          g.lineBetween(s.x + Math.cos(a) * r * 0.78, s.y + Math.sin(a) * r * 0.78, s.x + Math.cos(a) * r * 0.95, s.y + Math.sin(a) * r * 0.95);
        }
      }
    }
  }

  drawFlash(g, s) {
    const u = s.flashT / 0.25;
    g.lineStyle(3, 0xffffff, 1 - u).strokeCircle(s.x, s.y - 4, 8 + 14 * easeOut(u));
    g.fillStyle(0xffffff, 0.5 * (1 - u)).fillCircle(s.x, s.y - 4, 6 * (1 - u));
  }

  drawShout(g, s, player) {
    const u = s.shoutT / this.cfg.shoutSeconds;
    const pop = u < 0.2 ? 0.5 + 2.5 * u : 1 + 0.05 * Math.sin(s.shoutT * 30);
    const alpha = u > 0.7 ? 1 - (u - 0.7) / 0.3 : 1;
    const x = player.x;
    const y = player.y - 30;
    g.fillStyle(0xffe14d, alpha).lineStyle(1.5, 0x16161e, alpha).beginPath();
    for (let n = 0; n < SPIKES * 2; n++) {
      const a = (n / (SPIKES * 2)) * TAU - Math.PI / 2;
      const r = (n % 2 ? 11 : 19) * pop;
      const px = x + Math.cos(a) * r * 1.5;
      const py = y + Math.sin(a) * r;
      if (n === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.closePath().fillPath().strokePath();
    s.text.setPosition(x, y).setScale(pop).setAlpha(alpha).setVisible(true);
  }
}
