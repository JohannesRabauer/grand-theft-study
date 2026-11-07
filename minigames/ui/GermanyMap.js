import { makeLayout, pickAt } from '../geoCore.js';
import { darken } from '../../scenes/HiResArt.js';
import { uiText } from '../../ui/uiKit.js';

const hex = c => parseInt(c.slice(1), 16);
const MARKS = { focus: 0xffe14d, good: 0x51cf66, soft: 0xffa94d };
const RIVER = 0x3b82c4;

// The stylised pastel map of Germany (story 4.4), drawn with Phaser graphics from data/maps-geo/germany.json: states with
// their outlines, the three city-states as small blobs, capital dots, rivers, a compass rose, seas labelled. The geometry
// lives in geoCore.js; this class draws a layout into a screen rectangle and keeps the answer overlay (highlights, the
// cursor, a capital, a river). It serves the Erdkunde minigame and the later tram map quiz (9.4).
//
//   layout(rect)            fit the map into rect { x, y, w, h } (call again to move or resize it)
//   setTargets(what)        what pick() and the cursor can reach: 'states' | 'rivers' | 'seas'
//   setHighlight(id, style) mark a state, river or sea ('focus' | 'good' | 'soft'); id null clears all marks
//   setHover(id)            the cursor's target (outlined and ringed); null hides it
//   pick(x, y)              id at a screen point for the current targets, or null
//   drawCapital(id, on)     the capital dot and name of state id on or off
//   drawRiver(id, on)       a river emphasised on or off
//   anchors()               cursor anchors { id, x, y } of the current targets (for geoCore.stepTarget)
// With onTap set, a tap or click on the map calls onTap(id) (id may be null).
export class GermanyMap {
  constructor(scene, geo, { depth = 5 } = {}) {
    this.scene = scene;
    this.geo = geo;
    this.what = 'states';
    this.marks = new Map();
    this.rivers = new Set();
    this.capitals = new Set();
    this.hover = null;
    this.l = null;
    this.polys = {};
    this.onTap = null;
    this.rect = null;
    this.base = scene.add.graphics().setDepth(depth);
    this.over = scene.add.graphics().setDepth(depth + 1);
    const label = (size, color) => uiText(scene, 0, 0, '', { fontFamily: 'monospace', fontSize: `${size}px`, color, stroke: '#000000', strokeThickness: 2 }).setDepth(depth + 2);
    this.seaLabels = geo.seas.map(s => label(7, '#dff1ff').setText(s.name).setOrigin(0.5));
    this.north = label(8, '#ffffff').setText('N').setOrigin(0.5);
    this.capitalLabels = [label(8, '#ffffff'), label(8, '#ffffff')];
    this.hit = scene.add.rectangle(0, 0, 1, 1, 0xffffff, 0).setOrigin(0).setDepth(depth + 3).setInteractive({ useHandCursor: true });
    this.hit.on('pointerdown', (pointer, lx, ly) => this.onTap?.(this.pick(this.rect.x + lx, this.rect.y + ly)));
    this.objects = [this.base, this.over, this.north, this.hit, ...this.seaLabels, ...this.capitalLabels];
  }

  layout(rect) {
    this.rect = rect;
    this.l = makeLayout(this.geo, rect);
    const { l } = this;
    const poly = pts => new Phaser.Geom.Polygon(pts);
    this.polys = { outline: poly(l.outline) };
    for (const e of [...l.areas, ...l.rivers, ...l.seas]) this.polys[e.id] = poly(e.pts);
    this.hit.setPosition(rect.x, rect.y).setSize(rect.w, rect.h);
    this.seaLabels.forEach((t, i) => t.setPosition(l.seas[i].ax, l.seas[i].ay));
    const r = this.compassRadius();
    this.north.setPosition(rect.x + r + 5, rect.y + rect.h - 2 * r - 11);
    this.drawBase();
    this.drawOver();
  }

  compassRadius() { return Math.max(5, Math.min(10, Math.min(this.rect.w, this.rect.h) * 0.06)); }

  setTargets(what) { this.what = what; }

  setHighlight(id, style = 'focus') {
    if (id === null) this.marks.clear(); else this.marks.set(id, style);
    this.drawOver();
  }

  setHover(id) {
    if (id === this.hover) return;
    this.hover = id;
    this.drawOver();
  }

  drawCapital(id, on = true) {
    if (on) this.capitals.add(id); else this.capitals.delete(id);
    this.drawOver();
  }

  drawRiver(id, on = true) {
    if (on) this.rivers.add(id); else this.rivers.delete(id);
    this.drawOver();
  }

  // Clears every overlay at once (marks, cursor, capitals, rivers).
  clear() {
    this.marks.clear();
    this.rivers.clear();
    this.capitals.clear();
    this.hover = null;
    this.drawOver();
  }

  pick(x, y) { return this.l ? pickAt(this.l, x, y, this.what, this.what === 'rivers' ? 4 : 3) : null; }

  anchors() { return this.l.anchors(this.what); }

  anchorOf(id) { return this.l.at[id]; }

  setVisible(on) {
    for (const o of this.objects) o.setVisible(on);
    this.hit.input.enabled = on && !!this.onTap;
    if (on) this.drawOver();
  }

  fill(g, id, color, alpha) {
    g.fillStyle(color, alpha).fillPoints(this.polys[id].points, true);
  }

  drawBase() {
    const { base: g, l, rect, geo } = this;
    const water = hex(geo.water);
    g.clear();
    g.fillStyle(water).fillRect(rect.x, rect.y, rect.w, rect.h);
    g.lineStyle(1, hex(darken(geo.water, 0.35))).strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);
    // a soft shadow under the land, then the states
    g.save().translateCanvas(1.2, 1.5);
    this.fill(g, 'outline', hex(darken(geo.water, 0.3)), 0.7);
    g.restore();
    for (const a of l.areas) {
      const color = geo.palette[a.tone];
      this.fill(g, a.id, hex(color), 1);
    }
    for (const a of l.areas) {
      const edge = hex(darken(geo.palette[a.tone], a.kind === 'city' ? 0.62 : 0.5));
      g.lineStyle(a.kind === 'city' ? 1 : 0.8, edge).strokePoints(this.polys[a.id].points, true, true);
    }
    g.lineStyle(1.4, hex(darken(geo.palette[0], 0.7))).strokePoints(this.polys.outline.points, true, true);
    g.lineStyle(Math.max(1, l.scale * 0.07), RIVER, 0.95);
    for (const r of l.rivers) g.strokePoints(this.polys[r.id].points, false, false);
    g.fillStyle(0x3a2a2a);
    const dot = Math.max(0.9, l.scale * 0.05);
    for (const a of l.areas) g.fillCircle(a.capital.x, a.capital.y, dot);
    this.drawCompass(g);
  }

  // A small compass rose in the lower left corner (France side), north up.
  drawCompass(g) {
    const r = this.compassRadius();
    const cx = this.rect.x + r + 5;
    const cy = this.rect.y + this.rect.h - r - 5;
    g.fillStyle(0xffffff, 0.35).fillCircle(cx, cy, r + 1.5);
    g.lineStyle(1, 0x2b2f3a).strokeCircle(cx, cy, r);
    g.fillStyle(0xd9434a).fillTriangle(cx, cy - r, cx - r * 0.35, cy, cx + r * 0.35, cy);
    g.fillStyle(0x2b2f3a).fillTriangle(cx, cy + r, cx - r * 0.35, cy, cx + r * 0.35, cy);
    g.fillStyle(0x2b2f3a).fillTriangle(cx - r, cy, cx, cy - r * 0.3, cx, cy + r * 0.3);
    g.fillStyle(0x2b2f3a).fillTriangle(cx + r, cy, cx, cy - r * 0.3, cx, cy + r * 0.3);
  }

  mark(g, id, color, alpha, width) {
    const e = this.l.at[id];
    if (!e) return;
    if (e.kind === 'river') {
      g.lineStyle(width, color, alpha).strokePoints(this.polys[id].points, false, false);
      return;
    }
    this.fill(g, id, color, alpha);
    g.lineStyle(width, color, 1).strokePoints(this.polys[id].points, true, true);
    if (e.kind === 'city') g.lineStyle(1.5, color).strokeCircle(e.ax, e.ay, 5);
  }

  drawOver() {
    const { over: g, l } = this;
    if (!l) return;
    g.clear();
    for (const [id, style] of this.marks) this.mark(g, id, MARKS[style], style === 'focus' ? 0.5 : 0.8, 2);
    for (const id of this.rivers) this.mark(g, id, 0x1a4f8a, 1, Math.max(2, l.scale * 0.14));
    if (this.hover) {
      const e = l.at[this.hover];
      if (e) {
        if (e.kind === 'river') g.lineStyle(Math.max(2.5, l.scale * 0.16), 0xffffff, 0.9).strokePoints(this.polys[e.id].points, false, false);
        else g.lineStyle(2, 0xffffff).strokePoints(this.polys[e.id].points, true, true);
        g.lineStyle(1.5, 0x2b2f3a).strokeCircle(e.ax, e.ay, 4.5);
        g.fillStyle(0xffe14d).fillCircle(e.ax, e.ay, 2.2);
      }
    }
    let i = 0;
    for (const t of this.capitalLabels) t.setVisible(false);
    for (const id of this.capitals) {
      const c = l.at[id]?.capital;
      if (!c) continue;
      g.fillStyle(0xd9434a).fillCircle(c.x, c.y, 2.6).lineStyle(1, 0xffffff).strokeCircle(c.x, c.y, 2.6);
      const t = this.capitalLabels[i++];
      if (!t) continue;
      t.setText(c.name).setVisible(true);
      const right = c.x + 5 + t.width <= this.rect.x + this.rect.w;
      t.setOrigin(right ? 0 : 1, 0.5).setPosition(c.x + (right ? 5 : -5), c.y - 4);
    }
  }

  destroy() {
    for (const o of this.objects) o.destroy();
    this.objects.length = 0;
  }
}
