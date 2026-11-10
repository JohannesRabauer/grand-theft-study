// Frame sequences for the water (story 16.8): a headless run that steps the game frame by frame and writes crops of the pond, a canal
// bridge and the night reflections into docs/shots/overhaul/<label>/frames/: the water at four moments (animation), rain on the pond and a
// duck's rings. Prints what changed between frames, so the animation, the rings and the reflections are numbers too.
//   node scripts/water-frames.mjs --label after-16-8 [--tier medium|low] [--renderer canvas]
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
if (!/^[a-z0-9-]+$/.test(label)) { console.error('usage: node scripts/water-frames.mjs --label <name> [--tier medium|low] [--renderer canvas]'); process.exit(2); }
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

const browser = launchBrowser('waterframes-', ['--window-size=960,540', '--disable-background-timer-throttling', '--disable-renderer-backgrounding']);
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
    window.SCHULWEG_DEBUG = false;
    let clock = 0;
    const step = n => { for (let i = 0; i < n; i++) { clock += 1000 / 60; game.step(clock, 1000 / 60); } };
    game.scene.stop('Menu');
    game.scene.start('Game');
    step(4);
    const gs = game.scene.getScene('Game'), ctx = gs.ctx, cam = gs.cameras.main, water = gs.water;
    ctx.input.update = () => {};
    game.scene.getScene('UI').scene.setVisible(false);
    gs.matter.world.drawDebug = false;
    gs.matter.world.debugGraphic?.clear().setVisible(false);
    const setTime = (minute, weather) => {
      const phase = ctx.day.cfg.phases.find(p => minute >= p.start && minute < p.end);
      ctx.state.dispatch('clock.set', { day: 1, minute, phase: phase.id });
      ctx.events.emit('clock:tick', ctx.day.snapshot());
      ctx.weather.set(weather);
    };
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
    const lit = (f) => { let n = 0; for (let i = 0; i < f.data.length; i += 4) if (f.data[i] + f.data[i + 1] + f.data[i + 2] > 600) n++; return n; };
    const frames = [], numbers = {};
    const ts = 16;
    const pondC = { x: 29 * ts, y: 41 * ts }, bridgeC = { x: 15 * ts, y: 29.5 * ts };
    // the pond by day: four moments 0.4 s apart (the animation), and the canal bridge
    setTime(12 * 60, 'clear');
    place(pondC.x, pondC.y + 40); step(90);
    const pond = [];
    for (let k = 0; k < 4; k++) { pond.push(await shot('pond-day-' + k, pondC.x, pondC.y, 224, 160)); step(23); }
    frames.push(...pond);
    numbers.animationDiffPixels = pond.slice(1).map(f => diff(pond[0], f));
    place(bridgeC.x, bridgeC.y + 40); step(60);
    frames.push(await shot('canal-bridge-day', bridgeC.x, bridgeC.y, 192, 96));
    // the pond at night with the lamps and lit windows reflecting
    setTime(21 * 60 + 30, 'clear');
    place(pondC.x, pondC.y + 40); step(120);
    const night = await shot('pond-night', pondC.x, pondC.y, 224, 160);
    frames.push(night);
    numbers.nightBrightPixels = lit(night);
    numbers.lightsOnNight = ctx.lights.count;
    place(bridgeC.x, bridgeC.y + 40); step(120);
    frames.push(await shot('canal-bridge-night', bridgeC.x, bridgeC.y, 192, 96));
    // the one street lamp beside water: the river at the top of the east canal, lit at night, with its reflection
    place(133 * ts, 19 * ts); step(120);
    const lamp = await shot('river-lamp-night', 133 * ts, 18 * ts, 128, 96);
    frames.push(lamp);
    numbers.riverLampBrightPixels = lit(lamp);
    // rain on the pond: rings appear over the water
    setTime(12 * 60, 'rain');
    place(pondC.x, pondC.y + 40); step(180);
    const rip = ctx.particles.emitters.ripple.emitter;
    numbers.rainRingsAlive = [];
    for (let k = 0; k < 3; k++) { frames.push(await shot('pond-rain-' + k, pondC.x, pondC.y, 224, 160)); numbers.rainRingsAlive.push(rip.getAliveParticleCount()); step(17); }
    // a duck's rings: stand beside the first duck on the pond
    setTime(12 * 60, 'clear');
    const duck = ctx.critters.list.find(c => c.kind === 'duck');
    if (duck) {
      place(duck.x, duck.y + 50); step(60);
      numbers.duckRingsAlive = [];
      for (let k = 0; k < 3; k++) { frames.push(await shot('duck-' + k, duck.x, duck.y, 96, 64)); numbers.duckRingsAlive.push(rip.getAliveParticleCount()); step(17); }
    }
    // look metrics on the day pond crop: no seam or flat field beyond the art bible limits
    const lm = f => { const m = computeLookMetrics(f.data, f.w, f.h, []), k = f.w / 480 / f.z; return { flat: Math.round(m.largestFlatAreaPx * k * k), seam: Math.round(m.longestSeamPx * k) }; };
    const m = lm(pond[0]);
    numbers.pondFlatPx = m.flat; numbers.pondSeamPx = m.seam;
    numbers.renderer = game.renderer.type === Phaser.WEBGL ? 'webgl' : 'canvas';
    numbers.shader = water.shader;
    numbers.bodies = water.bodies.length;
    return { numbers, frames: frames.map(f => ({ name: f.name, png: f.png })) };
  })()`);
  mkdirSync(outDir, { recursive: true });
  for (const f of result.frames) writeFileSync(join(outDir, `${f.name}-${tier}${renderer ? '-' + renderer : ''}.png`), Buffer.from(f.png.split(',')[1], 'base64'));
  console.log(JSON.stringify(result.numbers, null, 1));
} finally {
  browser.close();
  server.close();
}
