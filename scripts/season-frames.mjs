// Frame sequences for the seasonal atmosphere (story 16.19): a headless run that steps the game frame by frame and writes pictures into
// docs/shots/overhaul/<label>/season/: a snowfall builds the cover, then spring melts it (biggest step of every layer per frame and biggest
// jump of the mean luminance over 15 frames), the afternoon shimmer and beams, and every per-tier switch. Prints the numbers.
//   node scripts/season-frames.mjs --label after-16-19 [--tier medium|low|high] [--renderer canvas]
// Needs Edge or Chrome, Node 22+. Same seeded, fixed-step setup as scripts/shots.mjs.
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser } from './lib/headless-browser.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i < 0 ? d : process.argv[i + 1]; };
const label = arg('label', '');
if (!/^[a-z0-9-]+$/.test(label)) { console.error('usage: node scripts/season-frames.mjs --label <name> [--tier medium|low|high] [--renderer canvas]'); process.exit(2); }
const tier = arg('tier', 'medium');
const renderer = arg('renderer', '');
const outDir = join(root, 'docs', 'shots', 'overhaul', label, 'season');
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

const browser = launchBrowser('seasonframes-', ['--window-size=960,540', '--disable-background-timer-throttling', '--disable-renderer-backgrounding']);
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
    game.sparkleOff = false;
    window.SCHULWEG_DEBUG = false;
    let clock = 0;
    const step = n => { for (let i = 0; i < n; i++) { clock += 1000 / 60; game.step(clock, 1000 / 60); } };
    game.scene.stop('Menu');
    game.scene.start('Game');
    step(4);
    const gs = game.scene.getScene('Game'), ctx = gs.ctx;
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
    const shot = async name => {
      const W = game.canvas.width, H = game.canvas.height;
      const off = document.createElement('canvas'); off.width = W; off.height = H;
      const oc = off.getContext('2d', { willReadFrequently: true });
      game.events.once('postrender', () => oc.drawImage(game.canvas, 0, 0));
      step(1);
      return { name, data: oc.getImageData(0, 0, W, H).data, png: off.toDataURL('image/png') };
    };
    const lumOf = f => { let s = 0; for (let i = 0; i < f.data.length; i += 16) s += f.data[i] * 0.299 + f.data[i + 1] * 0.587 + f.data[i + 2] * 0.114; return s / (f.data.length / 16) / 255; };
    const frames = [], numbers = {};
    const se = gs.season, post = gs.postFx;
    const ts = ctx.map.tileSize;
    const spot = ctx.map.objects.find(o => o.id === 'park-lamp-2');
    const place = (x, y) => { for (const p of ctx.players) p.teleport(x, y); gs.snapCamera(); };
    const nodes = ctx.map.objects.filter(o => o.district === 'road' && typeof o.x === 'number');
    const mx = nodes.reduce((a, o) => a + o.x, 0) / nodes.length, my = nodes.reduce((a, o) => a + o.y, 0) / nodes.length;
    const n0 = nodes.reduce((b, o) => Math.hypot(o.x - mx, o.y - my) < Math.hypot(b.x - mx, b.y - my) ? o : b);
    const road = { x: (n0.x + 0.5) * ts, y: (n0.y + 0.5) * ts };
    const park = { x: (spot.x + 0.5) * ts, y: (spot.y + 0.5) * ts };
    const layers = () => ({ ...se.L });
    const stepOf = (a, b) => Math.max(...Object.keys(a).map(k => Math.abs(a[k] - b[k])));
    const vis = list => list.filter(b => b.visible).length;
    // 1. a snowfall builds the cover and deepens the frost, then a spring afternoon melts it
    place(road.x, road.y); setTime(12 * 60, 'clear'); se.settle(); step(30);
    let prev = layers(), worstLayer = 0, prevLum = null, worstLum = 0;
    const run = () => { step(15); const l = layers(); worstLayer = Math.max(worstLayer, stepOf(prev, l) / 15); prev = l; };
    const sampleLum = async (tag, save) => { const f = await shot(tag); const l = lumOf(f); if (prevLum !== null) worstLum = Math.max(worstLum, Math.abs(l - prevLum)); prevLum = l; if (save) frames.push(f); };
    ctx.weather.state = 'snow';
    await sampleLum('snow-start', true);
    for (let i = 0; i < 100; i++) { run(); await sampleLum('snow-' + i, i === 50); }
    numbers.snowfall = { cover: +se.L.cover.toFixed(3), frost: +se.L.frost.toFixed(3), roofsShown: vis(se.bobs), crowns: vis(se.crownImgs), hedges: vis(se.hedgeImgs), glints: se.sparkLive };
    frames.push(await shot('snow-full'));
    setTime(14 * 60, 'clear');
    prevLum = null;
    for (let i = 0; i < 160; i++) { run(); await sampleLum('melt-' + i, i === 80); }
    frames.push(await shot('melt-late'));
    numbers.crossFade = { biggestLayerStepPerFrame: +worstLayer.toFixed(5), biggestMeanLuminanceStep15Frames: +worstLum.toFixed(4), after: layers() };
    numbers.crossFade.noPop = worstLum < 0.05 && worstLayer < 0.01;
    // 2. the afternoon: shimmer and beams
    setTime(16 * 60, 'clear'); place(road.x, road.y); se.settle(); step(60);
    frames.push(await shot('afternoon-road'));
    place(park.x, park.y); step(30);
    frames.push(await shot('afternoon-park'));
    numbers.afternoon = { heat: +se.L.heat.toFixed(2), rays: +se.L.rays.toFixed(2), beams: vis(se.beams), wisps: se.wispN, shader: post.atmosphereAllowed };
    // 3. every switch off per tier: nothing of that layer shows
    const off = {};
    const t = ctx.quality.tier.atmosphere;
    const saved = { ...t };
    const setFlags = o => Object.assign(t, saved, o);
    setTime(12 * 60, 'snow'); place(road.x, road.y); se.settle(); step(60);
    off.before = { roofs: vis(se.bobs), crowns: vis(se.crownImgs), hedges: vis(se.hedgeImgs) };
    setFlags({ snow: 0 }); step(3); off.snow = vis(se.bobs) + se.L.cover;
    setFlags({ crowns: 0 }); step(3); off.crowns = vis(se.crownImgs);
    setFlags({ hedges: 0 }); step(3); off.hedges = vis(se.hedgeImgs);
    setFlags({ frost: false }); step(500); off.frost = +se.L.frost.toFixed(3) + (se.frostImg?.visible ? 1 : 0);
    setFlags({ sparkle: 0 }); step(120); off.sparkle = vis(se.sparks);
    setFlags({}); setTime(16 * 60, 'clear'); se.settle(); step(5);
    setFlags({ rays: 0 }); step(400); off.rays = vis(se.beams) + se.L.rays;
    setFlags({ shimmer: 0 }); step(400); off.shimmer = vis(se.wisps) + se.L.heat;
    setFlags({}); se.settle();
    off.running = !gs.paused;
    numbers.switchesOff = off;
    numbers.switchesOff.ok = off.running && ['snow', 'crowns', 'hedges', 'frost', 'sparkle', 'rays', 'shimmer'].every(k => off[k] === 0) && off.before.roofs > 0;
    numbers.tier = { shader: post.atmosphereAllowed, renderer: game.renderer.type === Phaser.WEBGL ? 'webgl' : 'canvas', caps: saved };
    return { numbers, frames: frames.map(f => ({ name: f.name, png: f.png })) };
  })()`);
  mkdirSync(outDir, { recursive: true });
  for (const f of result.frames) writeFileSync(join(outDir, `${f.name}-${tier}${renderer ? '-' + renderer : ''}.png`), Buffer.from(f.png.split(',')[1], 'base64'));
  console.log(JSON.stringify(result.numbers, null, 1));
} finally {
  browser.close();
  server.close();
}
