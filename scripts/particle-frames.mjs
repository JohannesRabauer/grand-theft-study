// Frame sequences for the particles (story 16.11): a headless run that steps the game frame by frame and writes crops of the new
// particles into docs/shots/overhaul/<label>/frames/: footsteps and wheel dust on every surface, splash crowns and drips, rain and snow,
// lamp embers, fireflies and their light, falling leaves and petals, dust motes in window light, chimney smoke and the celebration
// bursts. Prints counts (alive per emitter, the live total against maxParticles, lights held and given back).
//   node scripts/particle-frames.mjs --label after-16-11 [--tier medium|low|high] [--renderer canvas]
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
if (!/^[a-z0-9-]+$/.test(label)) { console.error('usage: node scripts/particle-frames.mjs --label <name> [--tier medium|low] [--renderer canvas]'); process.exit(2); }
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

const browser = launchBrowser('particleframes-', ['--window-size=960,540', '--disable-background-timer-throttling', '--disable-renderer-backgrounding']);
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
    const lit = (f) => { let n = 0; for (let i = 0; i < f.data.length; i += 4) if (f.data[i] + f.data[i + 1] + f.data[i + 2] > 600) n++; return n; };
    const frames = [], numbers = { pz: [], maxParticles: ctx.quality.tier.maxParticles, peakTotal: 0 };
    const hub = ctx.particles;
    const seen = []; const em = ctx.events.emit.bind(ctx.events); ctx.events.emit = (n, ...a) => { if (!/tick|ui:toast/.test(n) && seen.length < 400) seen.push(n); return em(n, ...a); };
    const alive = n => hub.emitters[n].emitter.getAliveParticleCount();
    const track = () => { numbers.peakTotal = Math.max(numbers.peakTotal, hub.live()); };
    const run = n => { for (let i = 0; i < n; i++) { step(1); track(); } };
    const fake = (season, phase, alpha = 0) => {
      Object.defineProperty(ctx.day, 'season', { value: season, configurable: true });
      Object.defineProperty(ctx.day, 'phase', { value: phase, configurable: true });
      Object.defineProperty(ctx.day, 'tint', { value: { alpha, rgb: 0x203060 }, configurable: true });
    };
    const unfake = () => { for (const k of ['season', 'phase', 'tint']) delete ctx.day[k]; };
    const clear = () => { for (const e of hub.list) e.emitter.killAll(); };
    const ts = ctx.map.tileSize;
    const findSurface = id => {
      const cx = ctx.players[0].x, cy = ctx.players[0].y;
      let best = null, bd = 1e9;
      for (let ty = 2; ty < ctx.surfaces.rowCount - 2; ty++) for (let tx = 2; tx < ctx.surfaces.cols - 2; tx++) {
        if (ctx.surfaces.at((tx + 0.5) * ts, (ty + 0.5) * ts) !== id) continue;
        let ok = true;
        for (const [dx, dy] of id === 'puddle' || id === 'snow' ? [] : [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (ctx.surfaces.at((tx + 0.5 + dx) * ts, (ty + 0.5 + dy) * ts) !== id) ok = false;
        const d = Math.hypot(tx * ts - cx, ty * ts - cy);
        if (ok && d < bd) { best = { x: (tx + 0.5) * ts, y: (ty + 0.5) * ts }; bd = d; }
      }
      return best;
    };
    // the kids walk and ride by hand: the hub reads move.velSpeed, so each frame sets it after the real step
    const walk = (p, speed, bike, n) => {
      p.move.velSpeed = speed; p.move.sprinting = true; p.move.profile.faceHeading = bike;
      for (let i = 0; i < n; i++) { p.move.velSpeed = speed; hub.playerFx(1 / 60, p); step(1); track(); }
      p.move.profile.faceHeading = !!bike && p.move.profile.faceHeading;
    };
    setTime(12 * 60, 'clear');
    numbers.surfaces = {};
    // surfaces: footsteps (walking) and wheel dust (riding) on each ground, then the crown and drips in a puddle and after it
    const p0 = ctx.players[0];
    for (const id of ['asphalt', 'cobble', 'path', 'grass', 'snow', 'puddle']) {
      if (id === 'puddle' || id === 'snow') { // these only exist while it rains or snows
        const base = findSurface('asphalt');
        setTime(12 * 60, id === 'puddle' ? 'rain' : 'snow');
        place(base.x, base.y); run(420);
      }
      const spot = findSurface(id);
      if (id !== 'puddle' && id !== 'snow') setTime(12 * 60, 'clear');
      if (!spot) { numbers.surfaces[id] = 'none'; continue; }
      clear();
      place(spot.x, spot.y);
      step(30);
      const was = p0.move.profile.faceHeading;
      walk(p0, 70, false, 22);
      const walkAlive = { stepdust: alive('stepdust'), crown: alive('crown'), leaves: alive('leaves'), dust: alive('dust'), splash: alive('splash') };
      frames.push(await shot('foot-' + id, spot.x, spot.y, 96, 64));
      walk(p0, 90, true, 22);
      frames.push(await shot('wheel-' + id, spot.x, spot.y, 96, 64));
      p0.move.profile.faceHeading = was;
      numbers.surfaces[id] = { ...walkAlive, afterWheel: { stepdust: alive('stepdust'), crown: alive('crown'), dust: alive('dust') } };
      if (id === 'puddle') {
        ctx.weather.set('rain');
        const outside = findSurface('asphalt');
        place(outside.x, outside.y); step(2);
        p0.move.velSpeed = 0;
        for (let i = 0; i < 30; i++) { hub.playerFx(1 / 60, p0); step(1); }
        numbers.dripsAfterPuddle = alive('drip');
        frames.push(await shot('drips-after-puddle', outside.x, outside.y, 64, 48));
      }
    }
    // skid and ollie puffs
    clear();
    const road = findSurface('asphalt');
    place(road.x, road.y); step(10);
    hub.puffAt(p0, p0.x, p0.y, 1); ctx.events.emit('trick:ollie', { player: 0, phase: 'start', x: p0.x, y: p0.y });
    numbers.ollieAndSkidPuffs = alive('stepdust');
    frames.push(await shot('ollie-puff', p0.x, p0.y, 64, 48));
    // weather: rain and snow over the same street
    for (const w of ['rain', 'snow']) {
      setTime(12 * 60, w);
      place(road.x, road.y); run(200);
      frames.push(await shot('weather-' + w, road.x, road.y, 192, 128));
      numbers['weather-' + w] = { alive: hub.live(), rain: alive('rain'), impact: alive('impact'), dust: alive('dust') };
    }
    setTime(12 * 60, 'clear');
    // seasons: petals (spring afternoon), falling leaves (autumn morning), by day on a grass tile
    const lawn = findSurface('grass');
    window.SCHULWEG_GAME.ambienceOff = false;
    for (const [name, season, phase, emitter] of [['petals', 'spring', 'afternoon', 'petal'], ['leaves', 'autumn', 'morning', 'leaffall']]) {
      clear(); fake(season, phase); place(lawn.x, lawn.y); run(240);
      frames.push(await shot('season-' + name, lawn.x, lawn.y, 192, 128));
      numbers['season-' + name] = alive(emitter);
    }
    numbers.pz.push(gs.paused);
    // evening: fireflies with their lights, lamp embers beside the first park lamp, the dark world
    const lamp = ctx.map.objects.find(o => o.id === 'park-lamp-1');
    const lx = (lamp.x + 0.5) * ts, ly = (lamp.y + 0.5) * ts;
    numbers.pz.push(gs.paused);
    setTime(19 * 60 + 40, 'clear'); // the lamps are lit by now; later in the evening the bedtime flow pauses the world
    clear(); fake('summer', 'evening', 0.5); place(lx, ly + 90); run(300);
    frames.push(await shot('evening-fireflies-embers', lx, ly, 192, 128));
    numbers.evening = { firefly: alive('firefly'), ember: alive('ember'), glowLights: hub.glow.count, lightLimit: ctx.quality.tier.particleLights, poolLights: ctx.lights.count };
    numbers.pz.push(gs.paused);
    const before = ctx.lights.count;
    clear();
    numbers.lightsReleasedOnClear = before - ctx.lights.count >= numbers.evening.glowLights && hub.glow.count === 0;
    numbers.pz.push(gs.paused);
    // celebrations at night: level up
    place(lx, ly + 90); step(5);
    hub.celebrate('levelup', 0); // the real event would also open the level-up screen, which holds the world
    run(12);
    frames.push(await shot('celebrate-levelup-a', p0.x, p0.y - 10, 128, 96));
    run(20);
    frames.push(await shot('celebrate-levelup-b', p0.x, p0.y - 10, 128, 96));
    numbers.celebrate = { sparkle: alive('sparkle'), confetti: alive('confetti'), flashLights: hub.flashes.count };
    numbers.pz.push(gs.paused);
    run(80);
    numbers.celebrateFlashAfter = hub.flashes.count;
    numbers.pz.push(gs.paused); numbers.screens = game.scene.getScene('UI').screens.screens.map(s => s.id ?? s.name ?? Object.keys(s).join());
    unfake();
    numbers.pz.push(gs.paused);
    // indoors by day: dust motes in the window light, home
    ctx.world.load('home', 'from-town');
    setTime(12 * 60, 'clear');
    step(60);
    clear(); run(300);
    frames.push(await shot('home-motes', p0.x, p0.y, 192, 128));
    numbers.motes = alive('mote');
    // the smoke of a chimney, on the street
    ctx.world.load('town', 'from-home');
    setTime(12 * 60, 'clear');
    step(10);
    const chim = hub.spots.find(s => s.chimney);
    clear(); place(chim.x, chim.y + 40); run(180);
    frames.push(await shot('chimney-smoke', chim.x, chim.y - 10, 96, 96));
    numbers.smoke = alive('smoke');
    window.SCHULWEG_GAME.ambienceOff = true;
    numbers.peakWithinBudget = numbers.peakTotal <= numbers.maxParticles;
    return { numbers, frames: frames.map(f => ({ name: f.name, png: f.png })) };
  })()`);
  mkdirSync(outDir, { recursive: true });
  for (const f of result.frames) writeFileSync(join(outDir, `${f.name}-${tier}${renderer ? '-' + renderer : ''}.png`), Buffer.from(f.png.split(',')[1], 'base64'));
  console.log(JSON.stringify(result.numbers, null, 1));
} finally {
  browser.close();
  server.close();
}
