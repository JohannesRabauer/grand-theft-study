// Frame sequence for the vegetation (story 16.6): a headless run that steps the game frame by frame and writes crops of one
// grove and one hedge into docs/shots/overhaul/<label>/frames/: calm and gusty frames (sway), and the same crown with and
// without a kid standing behind it (fade). Prints what changed between frames, so the sway and the fade are numbers too.
//   node scripts/veg-frames.mjs --label after-16-6 [--tier medium|low] [--renderer canvas]
// Needs Edge or Chrome, Node 22+. Same seeded, fixed-step setup as scripts/shots.mjs.
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser } from './lib/headless-browser.mjs';
import { computeLookMetrics } from './lib/look-metrics.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i < 0 ? d : process.argv[i + 1]; };
const label = arg('label', '');
if (!/^[a-z0-9-]+$/.test(label)) { console.error('usage: node scripts/veg-frames.mjs --label <name> [--tier medium|low] [--renderer canvas]'); process.exit(2); }
const tier = arg('tier', 'medium');
const renderer = arg('renderer', '');
const outDir = join(root, 'docs', 'shots', 'overhaul', label, 'frames');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' };
const server = createServer((req, res) => {
  const path = normalize(join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
  if (!path.startsWith(root) || !existsSync(path) || !extname(path)) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream' }).end(readFileSync(path));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const SEED = `(() => { let s = 1; Math.random = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })()`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const browser = launchBrowser('vegframes-', ['--window-size=960,540', '--disable-background-timer-throttling', '--disable-renderer-backgrounding']);
try {
  let ws;
  for (let i = 0; i < 50 && !ws; i++) {
    try {
      const page = (await (await fetch(`http://127.0.0.1:${browser.port}/json`)).json()).find(t => t.type === 'page');
      if (page) ws = new WebSocket(page.webSocketDebuggerUrl);
    } catch { await sleep(200); }
  }
  await new Promise(r => ws.addEventListener('open', r));
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const evalJs = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, timeout: 600000 });
    if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 1200));
    return r.result.result.value;
  };
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: SEED });
  await send('Page.navigate', { url: `${base}/index.html?debug&q=${tier}${renderer ? `&renderer=${renderer}` : ''}` });
  let ready = false;
  for (let i = 0; i < 100 && !ready; i++) {
    await sleep(300);
    try { ready = await evalJs('!!window.SCHULWEG_GAME && !!window.SCHULWEG_GAME.registry.get("app")'); } catch { /* loading */ }
  }
  if (!ready) throw new Error('game did not start');
  await sleep(500);
  const result = await evalJs(`(async () => {
    const game = SCHULWEG_GAME;
    game.loop.sleep();
    game.hintsOff = true;
    window.SCHULWEG_DEBUG = false; // before the game scene starts: no zone overlays
    let clock = 0;
    const step = n => { for (let i = 0; i < n; i++) { clock += 1000 / 60; game.step(clock, 1000 / 60); } };
    game.scene.stop('Menu');
    game.scene.start('Game');
    step(4);
    const gs = game.scene.getScene('Game'), ctx = gs.ctx, cam = gs.cameras.main, veg = gs.vegetation;
    ctx.input.update = () => {};
    game.scene.getScene('UI').scene.setVisible(false);
    gs.matter.world.drawDebug = false;
    gs.matter.world.debugGraphic?.clear().setVisible(false);
    const minute = 7 * 60, phase = ctx.day.cfg.phases.find(p => minute >= p.start && minute < p.end);
    ctx.state.dispatch('clock.set', { day: 1, minute, phase: phase.id });
    ctx.events.emit('clock:tick', ctx.day.snapshot());
    ctx.weather.set('clear');
    // the grove: the tree with the most crowns around it; the hedge: the run the park's hiding spot stands on
    const near = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const tree = veg.trees.reduce((b, t) => veg.trees.filter(o => near(o, t) < 40).length > veg.trees.filter(o => near(o, b) < 40).length ? t : b);
    const hid = ctx.map.objects.find(o => o.id === 'hedge-park');
    const computeLookMetrics = ${computeLookMetrics.toString()};
    const shot = async (name, cx, cy, w, h) => {
      const W = game.canvas.width, H = game.canvas.height, z = cam.zoom, v = cam.worldView;
      const off = document.createElement('canvas'); off.width = W; off.height = H;
      const oc = off.getContext('2d', { willReadFrequently: true });
      game.events.once('postrender', () => oc.drawImage(game.canvas, 0, 0));
      step(1);
      const x = Math.round((cx - w / 2 - v.x) * z), y = Math.round((cy - h / 2 - v.y) * z), cw = Math.round(w * z), ch = Math.round(h * z);
      const crop = document.createElement('canvas'); crop.width = cw; crop.height = ch;
      crop.getContext('2d').drawImage(off, x, y, cw, ch, 0, 0, cw, ch);
      return { name, w: cw, h: ch, z, data: oc.getImageData(x, y, cw, ch).data, png: crop.toDataURL('image/png') };
    };
    const diff = (a, b) => { let n = 0; for (let i = 0; i < a.data.length; i += 4) if (a.data[i] !== b.data[i] || a.data[i + 1] !== b.data[i + 1] || a.data[i + 2] !== b.data[i + 2]) n++; return n; };
    const place = (x, y) => { for (const p of ctx.players) p.teleport(x, y); gs.snapCamera(); };
    const wind = (strength, x) => { ctx.wind.update = () => {}; ctx.wind.strength = strength; ctx.wind.vector.x = x; ctx.wind.vector.y = 0; };
    const frames = [], numbers = {};
    // sway: calm, then four gust phases; the kid stands in front of the trunk, out of the way
    place(tree.x + 40, tree.y + 30);
    step(30);
    wind(0, 0);
    veg.time = 0; step(1);
    frames.push(await shot('sway-calm', tree.cx, tree.cy + 4, 80, 64));
    wind(0.9, 0.9);
    for (let k = 0; k < 4; k++) { veg.time = 0.6 * k + 0.4; step(1); frames.push(await shot('sway-gust-' + k, tree.cx, tree.cy + 4, 80, 64)); }
    numbers.swayDiffPixels = frames.slice(1).map(f => diff(frames[0], f));
    numbers.swayFrameDiffPixels = frames.slice(2).map((f, i) => diff(frames[i + 1], f));
    // fade: the same crown, with a kid standing behind its trunk
    wind(0, 0); veg.time = 0; step(1);
    place(tree.x - 40, tree.y + 30); step(20);
    const clear = await shot('fade-clear', tree.cx, tree.cy + 4, 80, 64);
    const sprite = veg.trees.find(t => t.x === tree.x && t.y === tree.y);
    numbers.alphaBefore = sprite.sprite.alpha;
    place(tree.cx, tree.y - 22); step(45);
    const under = await shot('fade-under', tree.cx, tree.cy + 4, 80, 64);
    numbers.alphaUnder = sprite.sprite.alpha;
    numbers.fadeDiffPixels = diff(clear, under);
    place(tree.x - 40, tree.y + 30); step(60);
    numbers.alphaAfter = sprite.sprite.alpha;
    frames.push(clear, under);
    // hedge: calm and gusty
    place((hid.x + 1) * 16, (hid.y + 4) * 16); step(30);
    wind(0, 0); veg.time = 0; step(1);
    const hc = await shot('hedge-calm', (hid.x + 1) * 16, (hid.y + 1) * 16, 96, 64);
    wind(0.9, 0.9); veg.time = 1.1; step(1);
    const hg = await shot('hedge-gust', (hid.x + 1) * 16, (hid.y + 1) * 16, 96, 64);
    numbers.hedgeDiffPixels = diff(hc, hg);
    frames.push(hc, hg);
    // the look metrics of art bible 7 on the grove and hedge crops alone: no flat field or long seam left in the vegetation
    // (computeLookMetrics scales by w / 480, a crop is smaller than the frame, so its numbers are converted back to base pixels)
    const lm = f => { const m = computeLookMetrics(f.data, f.w, f.h, []), k = f.w / 480 / f.z; return { flat: Math.round(m.largestFlatAreaPx * k * k), seam: Math.round(m.longestSeamPx * k) }; };
    const g = lm(clear), hg2 = lm(hc);
    numbers.groveFlatPx = g.flat; numbers.groveSeamPx = g.seam; numbers.hedgeFlatPx = hg2.flat; numbers.hedgeSeamPx = hg2.seam;
    numbers.renderer = game.renderer.type === Phaser.WEBGL ? 'webgl' : 'canvas';
    numbers.shader = veg.shader;
    numbers.crowns = veg.trees.length;
    numbers.hedgeSprites = veg.hedges.length;
    return { numbers, frames: frames.map(f => ({ name: f.name, png: f.png })) };
  })()`);
  mkdirSync(outDir, { recursive: true });
  for (const f of result.frames) writeFileSync(join(outDir, `${f.name}-${tier}${renderer ? '-' + renderer : ''}.png`), Buffer.from(f.png.split(',')[1], 'base64'));
  console.log(JSON.stringify(result.numbers, null, 1));
} finally {
  browser.close();
  server.close();
}
