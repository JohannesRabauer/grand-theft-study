// The pixel UI kit (AD-14, AD-27, story 16.14). UI layout stays in the 480x270 base space; on Medium and High the canvas is
// 960x540, so the UI camera zooms by the render scale and text is rendered at that resolution: layout numbers are unchanged and every
// glyph is crisp. Everything here is drawn from code in base pixels (rectangles on whole coordinates stay hard-edged under the zoom):
// panels with an outline, bevel and drop shadow, bars, buttons, icons and the eased open and close of a screen. Colours and
// timings are data (data/ui.json); the maths is pure (ui/uiTheme.js). The UI scene has its own camera and is never touched by the
// light map or the post passes of the world camera (AD-31).
import { hexInt, panelRects, barRects, notched, faceTone, over, openFrame, closeFrame, pulse } from './uiTheme.js';
import { ICON_SIZE, ICON_COLORS, iconAtlas, iconPixels } from './uiIcons.js';

export function setupUiCamera(scene, res) {
  scene.cameras.main.setOrigin(0, 0).setZoom(res.scale);
}

export const uiCfg = scene => scene.cache.json.get('ui');

// A small seeded random generator for the looks of the UI (confetti): the UI never draws from the game's `Math.random`.
export function uiRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A Phaser text takes a random texture key. A HUD module that makes its text while the game runs (the phone badge) must leave the
// game's random sequence (the seeded smoke runs) alone: the swap is local and restores `Math.random` at once. The plain `uiText`
// below does not swap: the screens and the HUD are made at the same moments as before this kit, so the sequences of the seeded
// scenarios stay what they were.
let uiSeed = 0x9e3779b9; // one sequence for the whole UI: Phaser's texture keys must stay unique, so it keeps running from call to call
export function withSeededRandom(make) {
  const keep = Math.random;
  Math.random = () => ((uiSeed = (Math.imul(uiSeed, 1664525) + 1013904223) >>> 0) / 4294967296);
  try { return make(); } finally { Math.random = keep; }
}

export function uiText(scene, x, y, str, style) {
  return scene.add.text(x, y, str, { ...style, resolution: scene.registry.get('app').res.scale });
}

// The style of a text role (data/ui.json `roles`) on a tone: size, colour from `text[tone]`, and for light text on dark a hard 1 px
// shadow in the outline colour instead of a blurred stroke. `over` overrides any field; `color` may be a colour key or '#rrggbb'.
export function textStyle(scene, role, tone = 'ink', over = {}) {
  const cfg = uiCfg(scene);
  const r = cfg.roles[role];
  const key = over.color ?? r.color;
  const color = key.startsWith('#') ? key : cfg.text[tone][key];
  const style = { fontFamily: 'monospace', fontSize: `${over.size ?? r.size}px`, color, ...over };
  delete style.size;
  style.color = color;
  if (tone === 'ink' && over.shadow !== false) style.shadow = { offsetX: 1, offsetY: 1, color: cfg.edge, blur: 0, fill: true };
  else delete style.shadow;
  return style;
}

export function uiLabel(scene, x, y, str, role, tone = 'ink', over = {}) {
  return uiText(scene, x, y, str, textStyle(scene, role, tone, over));
}

// Paints rectangles [x, y, w, h, colour, alpha] into a Graphics at an offset.
export function paintRects(g, rects, ox = 0, oy = 0) {
  for (const [x, y, w, h, color, a] of rects) g.fillStyle(hexInt(color), a).fillRect(ox + x, oy + y, w, h);
  return g;
}

// A panel of w x h base pixels at (x, y): the 9-slice look (corners, edges and body of one bevelled frame) built from the size, so it
// fits any rectangle. Returns the Graphics; drawn once.
export function uiPanel(scene, x, y, w, h, { tone = 'ink', accent = false, shadow = true, depth = 0 } = {}) {
  const cfg = uiCfg(scene);
  const t = cfg.tones[tone];
  const g = scene.add.graphics().setPosition(x, y).setDepth(depth);
  return paintRects(g, panelRects(w, h, t, cfg.edge, { accent, shadow: shadow && t.alpha === undefined, alpha: t.alpha ?? 1 }));
}

// A full-screen dim that swallows clicks (the world is frozen behind a screen) and the panel on it: the frame of every screen.
export function uiScreenFrame(scene, ctx, { x, y, w, h, tone = 'ink', dimAlpha = 0.9, accent = true, depth = 40 } = {}) {
  const { w: sw, h: sh } = ctx.res;
  const dim = scene.add.rectangle(0, 0, sw, sh, hexInt(uiCfg(scene).edge), dimAlpha).setOrigin(0).setDepth(depth).setInteractive();
  const panel = uiPanel(scene, x ?? 12, y ?? 10, w ?? sw - 24, h ?? sh - 20, { tone, accent, depth: depth + 0.5 });
  return { dim, panel };
}

// A bar of w x h into a Graphics (`color` a key of data/ui.json `bars`, or a ready { base, light, dark }).
export function drawBar(scene, g, x, y, w, h, frac, color = 'green', segments = 0) {
  const cfg = uiCfg(scene);
  return paintRects(g, barRects(w, h, frac, typeof color === 'string' ? cfg.bars[color] : color, cfg.bars.track, cfg.edge, segments), x, y);
}

// A small HUD plate behind some text. It is an image of its own canvas texture (made once, at the largest size it may need, repainted and cropped
// by `fit` only when the rectangle changes), so the HUD's many plates batch with its texts instead of each breaking the batch like a Graphics
// would, and no texture is made while the game runs. The plate is created first (so it sits under what is created after it). `g` is the display
// object (setVisible, setDepth, destroy); destroying it frees the texture.
let plateIds = 0;

export class HudPlate {
  constructor(scene, tone = 'plate', maxW = 200, maxH = 40) {
    const res = scene.registry.get('app').res;
    this.scene = scene;
    this.tone = tone;
    this.res = res;
    this.maxW = maxW;
    this.maxH = maxH;
    this.texKey = `ui-plate-${++plateIds}`;
    this.canvas = scene.textures.createCanvas(this.texKey, maxW * res.scale, maxH * res.scale);
    this.g = scene.add.image(0, 0, this.texKey).setOrigin(0).setScale(res.inv).setVisible(false);
    this.g.once('destroy', () => { if (scene.textures.exists(this.texKey)) scene.textures.remove(this.texKey); }); // however the image goes (a module's destroy), the texture goes with it
    this.key = '';
    this.visible = true;
  }

  fit(x, y, w, h) {
    const key = `${x},${y},${w},${h}`;
    if (key === this.key) return;
    this.key = key;
    const { res, canvas } = this;
    const cw = Math.min(w, this.maxW);
    const ch = Math.min(h, this.maxH);
    const cfg = uiCfg(this.scene);
    const t = cfg.tones[this.tone];
    const c = canvas.getContext();
    c.clearRect(0, 0, canvas.width, canvas.height);
    for (const [rx, ry, rw, rh, color, a] of panelRects(cw, ch, t, cfg.edge, { shadow: false, alpha: t.alpha ?? 1 })) {
      c.globalAlpha = a;
      c.fillStyle = color;
      c.fillRect(rx * res.scale, ry * res.scale, rw * res.scale, rh * res.scale);
    }
    c.globalAlpha = 1;
    canvas.refresh();
    this.g.setCrop(0, 0, cw * res.scale, ch * res.scale).setPosition(x, y);
    if (this.visible) this.g.setVisible(true);
  }

  setVisible(on) { this.visible = on; this.g.setVisible(on && this.key !== ''); return this; }

  destroy() { this.g.destroy(); }
}

// ---- icons: one canvas texture, painted once per game and render scale

export function ensureUiIcons(scene, res) {
  const key = `ui-icons-${res.scale}`;
  const tex = scene.textures;
  if (tex.exists(key)) return key;
  const atlas = iconAtlas();
  const s = res.scale;
  const canvas = tex.createCanvas(key, atlas.width * s, atlas.height * s);
  const c = canvas.getContext();
  for (const name of atlas.names) {
    const f = atlas.frames[name];
    for (const [x, y, letter] of iconPixels(name)) {
      c.fillStyle = ICON_COLORS[letter];
      c.fillRect((f.x + x) * s, (f.y + y) * s, s, s);
    }
    canvas.add(name, 0, f.x * s, f.y * s, f.w * s, f.h * s);
  }
  canvas.refresh();
  return key;
}

// An icon image at its top-left (x, y) in base pixels.
export function uiIcon(scene, x, y, name) {
  const res = scene.registry.get('app').res;
  return scene.add.image(x, y, ensureUiIcons(scene, res), name).setOrigin(0).setScale(res.inv);
}

export const ICON = ICON_SIZE;

// ---- buttons: a face (a small panel in the idle, selected or focused colours) with a 2 px focus ring

// The rectangles of a button face of w x h at (0, 0): `state` is idle, selected or focus; the focus state adds the ring (which
// reaches 3 px outside) and `glow` 0..1 lightens it a little (the slow pulse).
export function buttonRects(cfg, w, h, state, glow = 0, ring = true) {
  const b = cfg.button[state];
  const out = [];
  if (state === 'focus' && ring) {
    out.push(...notched(-3, -3, w + 6, h + 6, cfg.edge));
    out.push(...notched(-2, -2, w + 4, h + 4, over(cfg.tones.ink.accent, b.ring, glow * 0.8)));
  }
  out.push(...panelRects(w, h, faceTone(b.face, cfg.edge, cfg.tones.ink.accent), cfg.edge, { shadow: !(state === 'focus' && ring) }));
  return out;
}

export function paintButton(scene, g, w, h, state, glow = 0, ring = true) {
  g.clear();
  return paintRects(g, buttonRects(uiCfg(scene), w, h, state, glow, ring));
}

// A pixel face under a Text that serves as a button (list screens keep their Text and its pointer events): `sync(state, enabled)` sizes
// the face to the text, paints it (idle, selected, focus without the outer ring, wrong) and sets the text colour. Create it after the text.
export function uiFace(scene, text) {
  const g = scene.add.graphics().setDepth(text.depth - 0.5);
  g.sync = (state = 'idle', enabled = true) => {
    const p = text.getTopLeft();
    g.setPosition(Math.round(p.x), Math.round(p.y)).setAlpha(text.alpha).setVisible(text.visible);
    text.setColor(enabled || state === 'focus' ? buttonTextColor(scene, state) : uiCfg(scene).text.ink.muted);
    paintButton(scene, g, Math.round(text.width), Math.round(text.height), state, 0, false);
    return g;
  };
  return g;
}

export const buttonTextColor = (scene, state) => uiCfg(scene).button[state].text;

// Slow pulse of the focus ring in quarter steps (never a strobe); 0 under reducedMotion or in a scripted run.
export function ringGlow(scene, ctx) {
  if (animOff(scene, ctx)) return 0;
  return pulse(scene.time.now, uiCfg(scene).anim.pulse * 2);
}

// ---- eased open and close of a screen (UIScene calls these through the ScreenStack hooks; reducedMotion and game.uiAnimOff skip them)

export function animOff(scene, ctx) {
  return !!scene.game.uiAnimOff || !!ctx?.motion?.reduced || !!ctx?.state?.shared?.flags?.reducedMotion;
}

export function uiOpen(scene, ctx, objects) {
  if (animOff(scene, ctx) || !objects.length) return;
  const { open, rise } = uiCfg(scene).anim;
  const base = objects.map(o => o.alpha);
  const set = base.slice();
  let last = 0;
  const apply = t => {
    const f = openFrame(t, rise);
    objects.forEach((o, i) => {
      if (!o.scene) return;
      if (o.alpha !== set[i]) base[i] = o.alpha; // the screen set its own alpha meanwhile: keep it
      set[i] = base[i] * f.alpha;
      o.setAlpha(set[i]);
    });
    for (const o of objects) if (o.scene) o.y += f.dy - last;
    last = f.dy;
  };
  apply(0);
  scene.tweens.addCounter({ from: 0, to: 1, duration: open, onUpdate: tw => apply(tw.getValue()), onComplete: () => apply(1) });
}

// Fades the objects out and destroys them; without animation (or without a scene) they are destroyed at once.
export function uiLeave(scene, ctx, objects) {
  const list = objects.filter(o => o.scene);
  objects.length = 0;
  if (!list.length) return;
  if (animOff(scene, ctx) || !scene.sys.isActive()) { for (const o of list) o.destroy(); return; }
  const { close, rise } = uiCfg(scene).anim;
  const base = list.map(o => o.alpha);
  let last = 0;
  for (const o of list) o.disableInteractive?.();
  const done = () => { scene.events.off('shutdown', done); for (const o of list) o.destroy(); };
  scene.tweens.addCounter({
    from: 0, to: 1, duration: close,
    onUpdate: tw => {
      const f = closeFrame(tw.getValue(), rise);
      list.forEach((o, i) => { if (o.scene) { o.setAlpha(base[i] * f.alpha); o.y += f.dy - last; } });
      last = f.dy;
    },
    onComplete: done
  });
  scene.events.once('shutdown', done); // a scene that ends first takes the objects with it (destroy is safe twice)
}

// Short "restart needed" banner while the page reloads for a render-resolution change (quality.js).
export function bindRestartNote(scene, events, t, res) {
  const note = uiLabel(scene, res.w / 2, res.h - 40, '', 'body', 'ink', { color: '#16161e', backgroundColor: '#ffd36b', padding: { x: 10, y: 6 }, shadow: false })
    .setOrigin(0.5).setDepth(100).setVisible(false);
  const show = () => note.setText(t('quality.restart')).setVisible(true);
  events.on('quality:restart', show);
  scene.events.once('shutdown', () => events.off('quality:restart', show));
}
