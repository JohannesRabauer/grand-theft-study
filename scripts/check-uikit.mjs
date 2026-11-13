// Checks the pixel UI kit without Phaser (story 16.14, AD-27): the text contrast of every colour pair in data/ui.json (the ui-ux-pro-max rule: 4.5:1 for text, 3:1 for
// large text and the focus ring), the HUD plate over the worst world pixel, the panel and bar rectangles, the icon set, the easing, and an audit of the sources:
// every UI file takes its colours and texts from the kit (no raw screen text style left behind) and the UI scene never gets a post pass.
// Run: node scripts/check-uikit.mjs
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { barRects, closeFrame, contrast, easeOutBack, faceTone, hexInt, luminance, notched, openFrame, over, panelRects, pulse } from '../ui/uiTheme.js';
import { ICONS, ICON_COLORS, ICON_SIZE, iconAtlas, iconPixels } from '../ui/uiIcons.js';
import { backdropRects } from '../ui/menuBackdrop.js';

const url = p => new URL(`../${p}`, import.meta.url);
const read = p => readFileSync(url(p), 'utf8');
const cfg = JSON.parse(read('data/ui.json'));
const OUT = cfg.edge;
let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; };

// ---- contrast maths (WCAG): black on white is 21, a colour on itself 1
ok(Math.abs(contrast('#000000', '#ffffff') - 21) < 1e-9, 'contrast of black on white is 21');
ok(Math.abs(contrast('#4a5f7f', '#4a5f7f') - 1) < 1e-9, 'a colour on itself is 1');
ok(luminance('#ffffff') > 0.999 && luminance('#000000') === 0, 'luminance range');
ok(over('#ffffff', '#000000', 0.5) === '#808080', 'over mixes by alpha');

// ---- the art bible: no pure black or white anywhere in the kit's palette
const colours = JSON.stringify(cfg).match(/#[0-9a-fA-F]{6}\b/g);
ok(colours.length > 40, 'the palette is found');
for (const c of colours) ok(!/^#(000000|ffffff)$/i.test(c), `${c}: no pure black or white (art bible)`);
ok(cfg.edge === '#16161e', 'the outline colour is OUT');

// ---- every text colour reads on its tone (4.5:1), large text too
const min = cfg.minContrast;
const fillOf = { ink: cfg.tones.ink.fill, paper: cfg.tones.paper.fill };
for (const [key, color] of Object.entries(cfg.text.paper)) ok(contrast(color, cfg.tones.sheet.fill) >= min, `paper.${key} on the sheet: ${contrast(color, cfg.tones.sheet.fill).toFixed(2)}`);
for (const tone of ['ink', 'paper']) {
  for (const [key, color] of Object.entries(cfg.text[tone])) {
    ok(contrast(color, fillOf[tone]) >= min, `${tone}.${key} ${color} on ${fillOf[tone]}: ${contrast(color, fillOf[tone]).toFixed(2)} >= ${min}`);
    if (tone === 'ink') ok(contrast(color, cfg.tones.ink.inset) >= min, `ink.${key} on the inset field`);
  }
}
for (const key of Object.keys(cfg.text.ink)) ok(contrast(cfg.text.ink[key], cfg.tones.well.fill) >= min, `ink.${key} on the well`);
for (const [state, b] of Object.entries(cfg.button)) ok(contrast(b.text, b.face) >= min, `button ${state}: ${b.text} on ${b.face} ${contrast(b.text, b.face).toFixed(2)}`);
ok(contrast(cfg.button.focus.ring, OUT) >= cfg.minLargeContrast, 'the focus ring stands out from the outline (3:1)');
ok(contrast(cfg.button.focus.face, cfg.button.idle.face) >= cfg.minLargeContrast, 'the focused face stands out from the idle face (3:1)');
ok(contrast(cfg.button.focus.ring, cfg.tones.ink.fill) >= cfg.minLargeContrast, 'the ring stands out from the panel');
// the HUD plate: its text over the worst case, a white world pixel under the translucent plate
const plate = cfg.tones.plate;
for (const under of ['#fff1c4', '#f6efdc', '#e8f0ff']) {
  const worst = over(plate.fill, under, plate.alpha);
  for (const [key, color] of Object.entries(cfg.text.ink)) ok(contrast(color, worst) >= min, `plate text ${key} over a bright world (${under}): ${contrast(color, worst).toFixed(2)}`);
}
ok(plate.alpha >= 0.9, 'the plate is dense enough');
// the roles name colours that exist
for (const [role, r] of Object.entries(cfg.roles)) ok(r.size >= 8 && cfg.text.ink[r.color], `role ${role}: readable size and a real colour`);
ok(Math.min(...Object.values(cfg.roles).map(r => r.size)) >= 8, 'no text below 8 base pixels');
// the paper bar colours of the Lernbuch have a dark enough outline against the paper
ok(contrast(OUT, cfg.tones.paper.fill) > 10, 'bars on paper are outlined');

// ---- panels: whole pixels, inside the box (plus the 2 px shadow), the corners notched, no overlap in the plate
const rects = panelRects(60, 30, cfg.tones.ink, OUT, { accent: true });
for (const [x, y, w, h, c, a] of rects) {
  ok(Number.isInteger(x) && Number.isInteger(y) && Number.isInteger(w) && Number.isInteger(h) && w > 0 && h > 0, 'whole pixels');
  ok(x >= 0 && y >= 0 && x + w <= 62 && y + h <= 32, `inside the box and its shadow: ${[x, y, w, h]}`);
  ok(/^#[0-9a-f]{6}$/i.test(c) && a > 0 && a <= 1, 'colour and alpha');
}
const covers = (rs, px, py) => rs.filter(([x, y, w, h]) => px >= x && px < x + w && py >= y && py < y + h);
const solid = panelRects(60, 30, cfg.tones.ink, OUT, { shadow: false });
ok(covers(solid, 0, 0).length === 0 && covers(solid, 59, 0).length === 0 && covers(solid, 0, 29).length === 0 && covers(solid, 59, 29).length === 0, 'the four corner pixels are notched');
ok(covers(solid, 30, 0).at(-1)[4] === OUT && covers(solid, 0, 15).at(-1)[4] === OUT, 'the outline is the edge colour');
ok(covers(solid, 1, 1).at(-1)[4] === cfg.tones.ink.high && covers(solid, 30, 1).at(-1)[4] === cfg.tones.ink.light, 'lit top and left, the highest pixel in the corner');
ok(covers(solid, 30, 28).at(-1)[4] === cfg.tones.ink.dark && covers(solid, 58, 15).at(-1)[4] === cfg.tones.ink.dark, 'shaded bottom and right');
const plateRects = panelRects(60, 30, cfg.tones.plate, OUT, { shadow: false, alpha: plate.alpha });
let overlaps = 0;
for (let y = 0; y < 30; y++) for (let x = 0; x < 60; x++) if (covers(plateRects, x, y).filter(r => r[5] < 1).length > 1) overlaps++;
ok(overlaps === 0, `no pixel is covered by two translucent rectangles of a plate (${overlaps})`);
ok(panelRects(60, 30, cfg.tones.ink, OUT, { accent: true }).length > panelRects(60, 30, cfg.tones.ink, OUT).length, 'the accent brackets add rectangles');
ok(panelRects(6, 6, cfg.tones.ink, OUT, { shadow: false }).length === 5, 'a tiny panel has no bevel');
ok(notched(0, 0, 10, 8, '#16161e').length === 3, 'a notched shape is three rectangles');
const tone = faceTone('#3a4b68', OUT, '#c4915a');
ok(luminance(tone.light) > luminance(tone.fill) && luminance(tone.dark) < luminance(tone.fill), 'a button face lights its top and shades its bottom');

// ---- bars: whole pixels, never wider than the track, a dark bottom row on tall bars
for (const frac of [0, 0.01, 0.5, 1, 1.4, -1]) {
  const bar = barRects(40, 6, frac, cfg.bars.green, cfg.bars.track, OUT, 4);
  const fill = bar.find(r => r[4] === cfg.bars.green.base);
  const width = fill ? fill[2] : 0;
  ok(width >= 0 && width <= 38 && Number.isInteger(width), `bar fill ${frac} -> ${width}`);
  ok(frac >= 1 ? width === 38 : frac <= 0 ? width === 0 : width >= 0, 'full and empty bars');
}
ok(barRects(40, 6, 1, cfg.bars.green, cfg.bars.track, OUT).some(r => r[4] === cfg.bars.green.dark), 'a tall bar has its dark row');
ok(!barRects(40, 4, 1, cfg.bars.green, cfg.bars.track, OUT).some(r => r[4] === cfg.bars.green.dark), 'a thin bar has none');
for (const [name, c] of Object.entries(cfg.bars)) if (name !== 'track') ok(luminance(c.light) > luminance(c.base) && luminance(c.base) > luminance(c.dark), `bar colour ${name} is a ramp`);

// ---- icons: 9 x 9, every letter has a colour, frames do not overlap
const atlas = iconAtlas();
ok(atlas.names.length >= 16, `the icon set has ${atlas.names.length} icons`);
for (const name of ['coin', 'bolt', 'flame', 'book', 'mail', 'map', 'star', 'medal', 'shield', 'lock', 'autumn', 'winter', 'spring', 'summer']) ok(ICONS[name], `icon ${name}`);
for (const [name, rows] of Object.entries(ICONS)) {
  ok(rows.length === ICON_SIZE && rows.every(r => r.length === ICON_SIZE), `${name} is ${ICON_SIZE}x${ICON_SIZE}`);
  ok(iconPixels(name).length >= 14, `${name} has pixels`);
  for (const [, , letter] of iconPixels(name)) ok(ICON_COLORS[letter], `${name}: colour for ${letter}`);
  ok(iconPixels(name).some(([, , l]) => l === 'o' || name === 'winter'), `${name} is outlined`);
}
for (const season of ['autumn', 'winter', 'spring', 'summer']) ok(read('data/day.json').includes(`"season": "${season}"`), `${season} is a season of the day clock`);
const frames = Object.values(atlas.frames);
ok(frames.every((f, i) => i === 0 || f.x >= frames[i - 1].x + frames[i - 1].w), 'icon frames do not overlap');
ok(atlas.width === frames.at(-1).x + ICON_SIZE, 'the atlas is as wide as its frames');

// ---- easing and animation
ok(openFrame(0, 6).alpha === 0 && openFrame(0, 6).dy === 6 && openFrame(1, 6).alpha === 1 && openFrame(1, 6).dy === 0, 'an opening screen goes from hidden and 6 px low to settled');
ok(closeFrame(0, 6).alpha === 1 && closeFrame(1, 6).alpha === 0, 'a closing screen goes from settled to gone');
let last = -1;
for (let t = 0; t <= 1.0001; t += 0.05) { const a = openFrame(t, 6).alpha; ok(a >= last, 'opening is monotonic'); last = a; }
ok(Math.abs(easeOutBack(1) - 1) < 1e-9 && easeOutBack(0.5) > 0.5, 'easeOutBack ends at 1 and overshoots on the way');
ok(cfg.anim.open <= 250 && cfg.anim.open >= 100 && cfg.anim.close < cfg.anim.open, 'open 100-250 ms (ui-ux-pro-max: 150-300), closing is faster than opening');
const levels = new Set();
for (let ms = 0; ms < cfg.anim.pulse * 2; ms += 8) levels.add(pulse(ms, cfg.anim.pulse * 2));
ok([...levels].every(v => [0, 0.25, 0.5, 0.75, 1].includes(v)), 'the focus pulse moves in quarter steps');
ok(cfg.anim.pulse * 2 >= 1000 / 3, 'the pulse stays under 3 Hz');

// ---- the menu backdrop: seeded, whole pixels inside the view, a skyline with lit windows
const back = backdropRects(480, 270);
ok(JSON.stringify(back) === JSON.stringify(backdropRects(480, 270)), 'the backdrop is deterministic');
ok(back.length > 800 && back.length < 6000, `${back.length} backdrop rectangles`);
ok(back.every(([x, y, w, h]) => Number.isInteger(x) && Number.isInteger(y) && Number.isInteger(w) && Number.isInteger(h) && w > 0 && h > 0 && y >= 0 && y + h <= 270 + 1), 'backdrop rectangles are whole pixels in the view');
ok(back.some(r => r[4] === '#ffd36b') && back.some(r => r[4] === '#fff1c4'), 'lit windows and a sun');

// ---- source audit: one kit, no screen styles of its own
const walk = dir => readdirSync(url(dir), { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(`${dir}/${e.name}`) : e.name.endsWith('.js') ? [`${dir}/${e.name}`] : []);
const hudAndScreens = [...walk('ui/hud'), ...walk('ui/screens')].filter(f => !/DebugModule|FpsModule|TestScreen|RotateHint|CoopModule|TouchModule|MinimapModule/.test(f));
for (const f of hudAndScreens) {
  const src = read(f);
  ok(!/add\.rectangle\([^)]*setStrokeStyle\(2, 0xe2bb65\)/.test(src), `${f}: no private gold frame`);
  ok(!/fontFamily: 'monospace'/.test(src.replace(/\/\/.*$/gm, '')) || /StickerAlbum|MinigameResult/.test(f), `${f}: text styles come from the kit roles`);
  ok(!/setBackgroundColor\('#2b3446'|#2f6f4f|#243b44/.test(src), `${f}: no old button colours`);
}
for (const f of ['ui/ButtonMenu.js', 'ui/CharacterSelect.js', 'scenes/MenuScene.js']) ok(!/backgroundColor: '#2b2f3a'|COLORS\.focus|#d9a521/.test(read(f)), `${f}: the kit's buttons`);
ok(read('ui/hud/index.js').includes('ToastModule') && read('ui/hud/ToastModule.js').includes('SHOW_MS'), 'the toast is still timed (check-important-text)');
// the UI scene has its own camera: the world's light map and post passes never reach it (AD-31)
const post = read('render/PostFx.js') + read('render/LightMap.js');
ok(!/scene\.get\('UI'\)|getScene\('UI'\)/.test(post), 'the post passes and the light map never name the UI scene');
ok(/setupUiCamera/.test(read('scenes/UIScene.js')) && !/postPipeline|setPostPipeline|postFX/i.test(read('scenes/UIScene.js') + read('ui/uiKit.js')), 'the UI scene has no post pipeline of its own');
ok(/screens\.onOpen/.test(read('scenes/UIScene.js')), 'every screen eases in through the stack hook');
ok(!/Math\.random/.test(read('ui/uiKit.js').replace(/\/\/.*$/gm, '').replace(/const keep = Math\.random;|Math\.random = [^\n]*|Math\.random = keep/g, '')), 'the kit never draws from the game random sequence');
ok(read('scripts/smoke/env.js').includes('uiAnimOff'), 'the scripted runs switch the screen easing off');

// ---- i18n: the kit adds no text of its own
ok(!/ctx\.t\(|\.t\('/.test(read('ui/uiTheme.js') + read('ui/uiIcons.js') + read('ui/menuBackdrop.js')), 'the pure kit modules carry no text');

console.log(`ui kit ok: ${n} checks, ${atlas.names.length} icons, ${back.length} backdrop rectangles, ${hudAndScreens.length} HUD and screen files audited`);
