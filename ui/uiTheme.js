// Pure maths of the pixel UI kit (story 16.14): colour contrast, the rectangles of a panel and of a bar, the easing of an opening
// or closing screen. No Phaser, so scripts/check-uikit.mjs checks it in node. The painters live in ui/uiKit.js.
export const hexInt = hex => parseInt(hex.slice(1, 7), 16);

const channel = v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };

// Relative luminance (WCAG 2.x) of '#rrggbb'.
export function luminance(hex) {
  const n = hexInt(hex);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

// WCAG contrast ratio of two colours, 1 to 21.
export function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// '#rrggbb' laid over `under` with `alpha` (what a translucent HUD plate shows over a world pixel).
export function over(top, under, alpha) {
  const a = hexInt(top);
  const b = hexInt(under);
  const mix = shift => Math.round(((a >> shift) & 255) * alpha + ((b >> shift) & 255) * (1 - alpha));
  return `#${[16, 8, 0].map(s => mix(s).toString(16).padStart(2, '0')).join('')}`;
}

// A filled w x h shape with the four corner pixels missing, as three non-overlapping rectangles.
export function notched(x, y, w, h, color, alpha = 1) {
  return [[x + 1, y, w - 2, 1, color, alpha], [x, y + 1, w, h - 2, color, alpha], [x + 1, y + h - 1, w - 2, 1, color, alpha]];
}

// The tone of a button face: its bevel and shade derive from the face colour (a button is a small panel).
export function faceTone(face, edge, accent) {
  return { fill: face, light: over('#fff1c4', face, 0.3), high: over('#fff1c4', face, 0.55), dark: over(edge, face, 0.4), accent };
}

// The rectangles [x, y, w, h, colour, alpha] of a panel of w x h base pixels at (0, 0), in draw order and without overlaps (so a
// translucent plate stays clean): a 1 px outline with notched corners, the fill, a lit top and left bevel (corner pixel highest), a
// shaded bottom and right, and optionally a drop shadow to the bottom right and accent brackets in the corners.
export function panelRects(w, h, tone, edge, { shadow = true, accent = false, alpha = 1 } = {}) {
  const out = [];
  const add = (x, y, rw, rh, color, a = 1) => { if (rw > 0 && rh > 0) out.push([x, y, rw, rh, color, a]); };
  if (shadow) {
    add(3, 2, w - 2, 1, edge, 0.4);
    add(2, 3, w, h - 2, edge, 0.4);
    add(3, h + 1, w - 2, 1, edge, 0.4);
  }
  add(1, 0, w - 2, 1, edge);
  add(1, h - 1, w - 2, 1, edge);
  add(0, 1, 1, h - 2, edge);
  add(w - 1, 1, 1, h - 2, edge);
  add(1, 1, w - 2, h - 2, tone.fill, alpha);
  if (w >= 8 && h >= 8) {
    add(1, 1, 1, 1, tone.high);
    add(2, 1, w - 4, 1, tone.light);
    add(1, 2, 1, h - 4, tone.light);
    add(2, h - 2, w - 3, 1, tone.dark);
    add(w - 2, 2, 1, h - 4, tone.dark);
  }
  if (accent && w >= 24 && h >= 24) {
    const c = tone.accent;
    for (const [x, y, sx, sy] of [[3, 3, 1, 1], [w - 4, 3, -1, 1], [3, h - 4, 1, -1], [w - 4, h - 4, -1, -1]]) {
      add(sx > 0 ? x : x - 5, y, 6, 1, c);
      add(x, sy > 0 ? y + 1 : y - 5, 1, 5, c);
    }
  }
  return out;
}

// A bar of w x h base pixels (h >= 4): outline, track, the filled part with a light top row and a dark bottom row, optionally cut into
// `segments` steps by 1 px notches. `frac` 0..1; the fill width is whole pixels.
export function barRects(w, h, frac, color, trackColor, edge, segments = 0) {
  const out = [[0, 0, w, h, edge, 1], [1, 1, w - 2, h - 2, trackColor, 1]];
  const px = Math.max(0, Math.min(w - 2, Math.round((w - 2) * Math.max(0, Math.min(1, frac)))));
  if (px > 0) {
    out.push([1, 1, px, h - 2, color.base, 1]);
    out.push([1, 1, px, 1, color.light, 1]);
    if (h >= 5) out.push([1, h - 2, px, 1, color.dark, 1]);
    for (let s = 1; s < segments; s++) {
      const x = 1 + Math.round(((w - 2) * s) / segments);
      if (x < 1 + px) out.push([x, 1, 1, h - 2, trackColor, 1]);
    }
  }
  return out;
}

export const easeOutCubic = t => 1 - (1 - t) ** 3;
export const easeInQuad = t => t * t;
export const easeOutBack = t => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2;

// State of an opening (t 0..1) or closing (t 0..1 from open to gone) screen: alpha factor and the vertical offset in base pixels.
export function openFrame(t, rise) {
  const e = easeOutCubic(Math.max(0, Math.min(1, t)));
  return { alpha: e, dy: Math.round((1 - e) * rise) };
}

export function closeFrame(t, rise) {
  const e = easeInQuad(Math.max(0, Math.min(1, t)));
  return { alpha: 1 - e, dy: Math.round(e * rise * 0.5) };
}

// A pulse 0..1 for the focus ring: a slow triangle wave, steps of a quarter so the ring blinks in whole stages (never a strobe).
export function pulse(ms, period) {
  const p = (ms % period) / period;
  return Math.round((p < 0.5 ? p * 2 : 2 - p * 2) * 4) / 4;
}
