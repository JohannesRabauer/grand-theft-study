// Frame sequences for the atmosphere (story 16.12): a headless run that steps the game frame by frame and writes crops into
// docs/shots/overhaul/<label>/atmosphere/: clear -> rain -> fog -> clear cross-fades (one picture every half second, plus the biggest
// jump of the mean luminance between two frames), the haze world-locked check (the same fog after the camera moved), wet ground with
// reflections and ripples at night, and every per-tier switch. Prints the numbers.
//   node scripts/atmosphere-frames.mjs --label after-16-12 [--tier medium|low|high] [--renderer canvas]
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
if (!/^[a-z0-9-]+$/.test(label)) { console.error('usage: node scripts/atmosphere-frames.mjs --label <name> [--tier medium|low] [--renderer canvas]'); process.exit(2); }
const tier = arg('tier', 'medium');
const renderer = arg('renderer', '');
const outDir = join(root, 'docs', 'shots', 'overhaul', label, 'atmosphere');
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

const browser = launchBrowser('atmoframes-', ['--window-size=960,540', '--disable-background-timer-throttling', '--disable-renderer-backgrounding']);
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
    const gs = game.scene.getScene('Game'), ctx = gs.ctx, cam = gs.cameras.main;
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
    const lumOf = f => { let s = 0; for (let i = 0; i < f.data.length; i += 4) s += f.data[i] * 0.299 + f.data[i + 1] * 0.587 + f.data[i + 2] * 0.114; return s / (f.data.length / 4) / 255; };
    const frames = [], numbers = {};
    const atm = gs.atmosphere, postFx = gs.postFx;
    const ts = ctx.map.tileSize;
    const spot = ctx.map.objects.find(o => o.id === 'park-lamp-2');
    const home = { x: (spot.x + 0.5) * ts, y: (spot.y + 0.5) * ts };
    const road = (() => { const cx = home.x, cy = home.y; let best = null, bd = 1e9;
      for (let ty = 2; ty < ctx.surfaces.rowCount - 2; ty++) for (let tx = 2; tx < ctx.surfaces.cols - 2; tx++) {
        if (ctx.surfaces.base(tx, ty) !== 'asphalt') continue;
        const d = Math.hypot(tx * ts - cx, ty * ts - cy); if (d < bd) { best = { x: (tx + 0.5) * ts, y: (ty + 0.5) * ts }; bd = d; } }
      return best; })();
    const view = () => ({ w: cam.worldView.width, h: cam.worldView.height });
    const full = (name) => shot(name, cam.midPoint.x, cam.midPoint.y, view().w, view().h);
    // 1. world lock: the fog after the camera moved 16 units down shifts by 32 image px upwards (not downwards)
    setTime(12 * 60, 'fog'); place(road.x, road.y); atm.settle(); step(2);
    const A = await full('lock-a');
    place(road.x, road.y + 16); step(1);
    const B = await full('lock-b');
    const W = A.w, H = A.h;
    const shiftDiff = dy => { let n = 0, c = 0; for (let y = 40; y < H - 40; y += 3) for (let x = 0; x < W; x += 3) { const a = ((y + dy) * W + x) * 4, b = (y * W + x) * 4; if (Math.abs(A.data[a] - B.data[b]) + Math.abs(A.data[a + 2] - B.data[b + 2]) > 12) n++; c++; } return n / c; };
    numbers.worldLock = { shiftUp32: +shiftDiff(32).toFixed(3), shiftDown32: +shiftDiff(-32).toFixed(3), noShift: +shiftDiff(0).toFixed(3) };
    numbers.worldLock.ok = numbers.worldLock.shiftUp32 < numbers.worldLock.shiftDown32 && numbers.worldLock.shiftUp32 < numbers.worldLock.noShift;
    frames.push(A);
    // 2. cross-fades: sunny -> rain -> fog -> sunny, a picture every half second, mean luminance per frame
    place(road.x, road.y); setTime(12 * 60, 'clear'); atm.settle(); step(60);
    const lum = [], L = [], jumps = {};
    const phases = [['rain', 420], ['fog', 420], ['clear', 420]];
    let prev = null, idx = 0;
    const sample = async (tag, save) => { const f = await full(tag); const l = lumOf(f); const j = prev === null ? 0 : Math.abs(l - prev); prev = l; lum.push(+l.toFixed(4)); L.push({ ...atm.L, wet: +atm.wet.toFixed(2) }); if (save) frames.push(f); return j; };
    await sample('seq-start', true);
    for (const [w, n] of phases) {
      ctx.weather.set(w);
      let worst = 0;
      for (let i = 0; i < n; i += 15) { step(15); const j = await sample('seq-' + w + '-' + i, i % 120 === 0); worst = Math.max(worst, j); }
      jumps[w] = +worst.toFixed(4);
    }
    numbers.crossFade = { biggestMeanLuminanceStep15Frames: jumps, series: lum.length, final: L.at(-1) };
    numbers.crossFade.noPop = Math.max(...Object.values(jumps)) < 0.05; // a pop would be one step of the whole fade (about 0.2)
    // 3. wet ground and lamp reflections, rain at night; ripples
    setTime(19 * 60 + 50, 'rain'); place(home.x, home.y + 40); atm.settle(); step(400);
    frames.push(await shot('wet-night', home.x, home.y + 10, 192, 128));
    numbers.wet = { wet: +atm.wet.toFixed(2), sheenSprites: atm.spr.filter(s => s.visible).length, reflections: atm.refl.filter(s => s.visible).length, ripples: atm.ripLive, puddles: ctx.weather.count };
    setTime(12 * 60, 'rain'); place(road.x, road.y); atm.settle(); step(500);
    frames.push(await shot('wet-day', road.x, road.y, 192, 128));
    numbers.wetDay = { sheenSprites: atm.spr.filter(s => s.visible).length, ripples: atm.ripLive };
    // 4. every switch off per tier: nothing of that layer shows
    const off = {};
    const t = ctx.quality.tier.atmosphere;
    const saved = { ...t };
    const names = () => postFx.names.includes('SchulwegGrade');
    const setFlags = o => Object.assign(t, saved, o);
    setTime(12 * 60, 'fog'); place(road.x, road.y); step(2); atm.settle(); step(3);
    setFlags({ fog: false }); atm.settle(); step(130); off.fog = +atm.L.fog.toFixed(3);
    setFlags({}); setTime(12 * 60, 'clear'); atm.settle(); step(3);
    setFlags({ clouds: false }); atm.settle(); step(130); off.clouds = +atm.L.clouds.toFixed(3);
    setFlags({}); setTime(7 * 60, 'clear'); atm.settle(); step(3);
    setFlags({ mist: false }); atm.settle(); step(130); off.mist = +atm.L.mist.toFixed(3);
    setFlags({}); setTime(12 * 60, 'rain'); step(240);
    setFlags({ curtain: false }); atm.settle(); step(130); off.curtain = +atm.L.curtain.toFixed(3);
    setFlags({ wet: 0 }); step(5); off.wetSprites = atm.spr.filter(s => s.visible).length;
    setFlags({ reflections: 0 }); step(5); off.reflections = atm.refl.filter(s => s.visible).length;
    setFlags({ ripples: 0 }); step(60); off.ripples = atm.rip.filter(s => s.visible).length;
    setFlags({}); setTime(12 * 60, 'clear'); atm.settle(); step(130);
    off.running = !gs.paused; // the bedtime flow pauses the world late in the evening: the evening pictures are taken at 19:50
    numbers.switchesOff = off;
    numbers.switchesOff.ok = off.running && Object.entries(off).every(([k, v]) => k === 'running' || v === 0);
    numbers.tier = { gradePass: names(), shader: postFx.atmosphereAllowed, renderer: game.renderer.type === Phaser.WEBGL ? 'webgl' : 'canvas', caps: saved };
    numbers.ripplePool = atm.rip.length;
    return { numbers, frames: frames.map(f => ({ name: f.name, png: f.png })) };
  })()`);
  mkdirSync(outDir, { recursive: true });
  for (const f of result.frames) writeFileSync(join(outDir, `${f.name}-${tier}${renderer ? '-' + renderer : ''}.png`), Buffer.from(f.png.split(',')[1], 'base64'));
  console.log(JSON.stringify(result.numbers, null, 1));
} finally {
  browser.close();
  server.close();
}
