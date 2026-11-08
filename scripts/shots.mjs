// Screenshot set and look metrics (story 16.1, CAP-35). Captures a fixed shot list of the game without any debug overlay or
// HUD into docs/shots/overhaul/<label>/ and writes metrics.json beside the images. Runs the game in a headless Edge/Chrome
// from a tiny static server of its own, with a seeded Math.random and a fixed-step clock, so two runs give the same bytes.
//   node scripts/shots.mjs --label before [--tier medium|low] [--only id,id] [--renderer canvas]
// Without --tier both Medium and Low are captured. Node 22+.
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser } from './lib/headless-browser.mjs';
import { computeLookMetrics } from './lib/look-metrics.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i < 0 ? d : process.argv[i + 1]; };
const label = arg('label', '');
if (!/^[a-z0-9-]+$/.test(label)) { console.error('usage: node scripts/shots.mjs --label <name> [--tier medium|low] [--only id,id]'); process.exit(2); }
const tiers = arg('tier', '') ? [arg('tier')] : ['medium', 'low'];
const only = arg('only', '') ? arg('only').split(',') : null;
const outDir = join(root, 'docs', 'shots', 'overhaul', label);

// minutes of the day for the lighting variants (data/day.json phases)
const TIMES = { morning: 7 * 60, day: 12 * 60, evening: 19 * 60 + 45, night: 21 * 60 + 30, dusk: 21 * 60 };
// The fixed shot list. `at` is a district of the town map (the npc node or spawn nearest to the centre of its npc points), a map id for the interiors.
const DISTRICTS = ['park', 'oldtown', 'road', 'school', 'market', 'riverside', 'skate', 'plaza'];
const SHOTS = [
  ...DISTRICTS.map(d => ({ id: `${d}-day`, map: 'town', at: d, time: 'day', weather: 'clear' })),
  ...['morning', 'evening', 'night'].map(t => ({ id: `oldtown-${t}`, map: 'town', at: 'oldtown', time: t, weather: 'clear' })),
  { id: 'oldtown-rain', map: 'town', at: 'oldtown', time: 'day', weather: 'rain' },
  { id: 'oldtown-snow', map: 'town', at: 'oldtown', time: 'day', weather: 'snow' },
  { id: 'lamp-dusk', map: 'town', at: 'object:park-lamp-1', time: 'dusk', weather: 'clear' }, // story 16.2: the first real light
  { id: 'park-night', map: 'town', at: 'park', time: 'night', weather: 'clear' },
  { id: 'interior-home-morning', map: 'home', time: 'morning', weather: 'clear' },
  { id: 'interior-home-night', map: 'home', time: 'night', weather: 'clear' },
  { id: 'interior-school-day', map: 'school', time: 'day', weather: 'clear' },
  { id: 'interior-dojo-day', map: 'dojo', time: 'day', weather: 'clear' },
  ...DISTRICTS.flatMap(d => ['evening', 'night'].filter(t => d !== 'oldtown' && !(d === 'park' && t === 'night')).map(t => ({ id: `${d}-${t}`, map: 'town', at: d, time: t, weather: 'clear' }))), // story 16.3: lamps, signs and headlights in every district
].filter(s => !only || only.includes(s.id));

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' };
const server = createServer((req, res) => {
  const path = normalize(join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
  if (!path.startsWith(root) || !existsSync(path) || !extname(path)) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream' }).end(readFileSync(path));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

// Everything random in the game reads Math.random, installed before any game script runs (the textures are made at boot).
const SEED_SCRIPT = `(() => {
  let s = 1;
  const rnd = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  Math.random = rnd;
  window.__reseed = n => { s = n | 0; };
})()`;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const sha = buf => createHash('sha256').update(buf).digest('hex').slice(0, 16);

async function captureTier(tier) {
  const browser = launchBrowser('shots-', ['--window-size=960,540', '--disable-background-timer-throttling', '--disable-renderer-backgrounding']);
  let ws;
  try {
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
    await send('Page.addScriptToEvaluateOnNewDocument', { source: SEED_SCRIPT });
    await send('Page.navigate', { url: `${base}/index.html?debug&q=${tier}${arg('renderer', '') ? `&renderer=${arg('renderer')}` : ''}` });
    let ready = false;
    for (let i = 0; i < 100 && !ready; i++) {
      await sleep(300);
      try { ready = await evalJs('!!window.SCHULWEG_GAME && !!window.SCHULWEG_GAME.registry.get("app")'); } catch { /* loading */ }
    }
    if (!ready) throw new Error('game did not start');
    await sleep(500);
    // ?debug exposes SCHULWEG_GAME; the overlays (physics lines, zones, markers, debug HUD) check the flag when the game scene starts
    await evalJs(`(() => {
      window.SCHULWEG_DEBUG = false;
      const game = SCHULWEG_GAME;
      game.loop.sleep();
      game.hintsOff = true; // tips freeze the world and draw text over the shot
      window.__clock = 0;
      window.__step = n => { for (let i = 0; i < n; i++) { window.__clock += 1000 / 60; game.step(window.__clock, 1000 / 60); } };
      game.scene.stop('Menu');
      game.scene.start('Game');
      window.__step(4);
      const gs = game.scene.getScene('Game');
      gs.ctx.input.update = () => {};
      gs.ctx.input.intent.aim = null;
      game.scene.getScene('UI').scene.setVisible(false);
      gs.matter.world.drawDebug = false;
      gs.matter.world.debugGraphic?.clear().setVisible(false);
      return true;
    })()`);

    const out = [];
    for (const shot of SHOTS) {
      const r = await evalJs(`(async () => {
        const shot = ${JSON.stringify(shot)}, TIMES = ${JSON.stringify(TIMES)};
        const computeLookMetrics = ${computeLookMetrics.toString()};
        const game = SCHULWEG_GAME, step = window.__step;
        const gs = game.scene.getScene('Game'), ctx = gs.ctx, cam = gs.cameras.main;
        window.__reseed(${hashSeed(shot.id)});
        if (ctx.world.id !== shot.map) {
          ctx.world.load(shot.map, shot.map === 'town' ? 'from-home' : 'from-town');
        }
        const minute = TIMES[shot.time];
        const phase = ctx.day.cfg.phases.find(p => minute >= p.start && minute < p.end);
        ctx.state.dispatch('clock.set', { day: 1, minute, phase: phase.id });
        ctx.events.emit('clock:tick', ctx.day.snapshot());
        ctx.weather.set(shot.weather);
        let x, y;
        if (shot.map === 'town') {
          const obj = shot.at.startsWith('object:') ? ctx.map.objects.find(o => o.id === shot.at.slice(7)) : null;
          const nodes = obj ? [obj] : ctx.map.objects.filter(o => o.district === shot.at && typeof o.x === 'number');
          const mx = nodes.reduce((a, o) => a + o.x, 0) / nodes.length, my = nodes.reduce((a, o) => a + o.y, 0) / nodes.length;
          const n = nodes.reduce((b, o) => Math.hypot(o.x - mx, o.y - my) < Math.hypot(b.x - mx, b.y - my) ? o : b);
          x = (n.x + 0.5) * ctx.map.tileSize; y = (n.y + 0.5) * ctx.map.tileSize;
        } else { x = ctx.players[0].x; y = ctx.players[0].y; }
        for (const p of ctx.players) p.teleport(x, y);
        gs.snapCamera();
        cam.resetFX();
        step(shot.weather === 'clear' ? 90 : 240);
        const W = game.canvas.width, H = game.canvas.height;
        const off = document.createElement('canvas'); off.width = W; off.height = H;
        const oc = off.getContext('2d', { willReadFrequently: true });
        game.events.once('postrender', () => oc.drawImage(game.canvas, 0, 0));
        step(1);
        const data = oc.getImageData(0, 0, W, H).data;
        // visible walkable tiles in image pixels (a tile is walkable when its surface is not solid)
        const ts = ctx.map.tileSize, v = cam.worldView, z = cam.zoom, walk = [];
        for (let ty = Math.floor(v.y / ts); ty <= Math.floor(v.bottom / ts); ty++) for (let tx = Math.floor(v.x / ts); tx <= Math.floor(v.right / ts); tx++) {
          const id = ctx.surfaces.at((tx + 0.5) * ts, (ty + 0.5) * ts);
          if (id && !ctx.surfaces.solid(id)) walk.push({ x: (tx * ts - v.x) * z, y: (ty * ts - v.y) * z, w: ts * z, h: ts * z });
        }
        const metrics = computeLookMetrics(data, W, H, walk);
        return { size: W + 'x' + H, map: ctx.world.id, minute: ctx.day.minute, weather: ctx.weather.state, walkTiles: walk.length, lights: ctx.lights.count, lightLimit: ctx.lights.limit, metrics, png: off.toDataURL('image/png') };
      })()`);
      const png = Buffer.from(r.png.split(',')[1], 'base64');
      const file = `${shot.id}-${tier}.png`;
      writeFileSync(join(outDir, file), png);
      out.push({ id: shot.id, tier, file, size: r.size, map: r.map, minute: r.minute, weather: r.weather, lights: r.lights, lightLimit: r.lightLimit, hash: sha(png), metrics: r.metrics });
      console.log(`${tier} ${shot.id}: seam ${r.metrics.longestSeamPx}px, flat ${r.metrics.largestFlatAreaPx}px2, walk lum p5 ${r.metrics.walkableLuminanceP5}, lights ${r.lights}/${r.lightLimit}`);
    }
    return out;
  } finally {
    browser.close();
  }
}

function hashSeed(id) { return [...id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7); }

try {
  mkdirSync(outDir, { recursive: true });
  for (const f of readdirSync(outDir)) if (f.endsWith('.png') || f === 'metrics.json') rmSync(join(outDir, f)); // index.md is hand-written and stays
  const shots = [];
  for (const tier of tiers) shots.push(...await captureTier(tier));
  const metrics = { schema: 1, label, shots };
  writeFileSync(join(outDir, 'metrics.json'), JSON.stringify(metrics, null, 1) + '\n');
  console.log(`${shots.length} shots written to ${outDir}`);
} finally {
  server.close();
}
