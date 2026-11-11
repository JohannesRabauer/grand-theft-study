// Camera jitter measure (story 16.13): the kid walks down the longest free street of the town at a steady pace while the camera
// follows and the renderer runs. Needs the game served; Node 22+, a headless Edge/Chrome.
//   node scripts/camera-jitter.mjs [--url http://localhost:8080] [--tier medium|low|high] [--seconds 4]
// Reported (screen px at the tier's resolution, lower is better):
//  - cameraResidualPx: RMS distance of the camera centre from the straight line it follows in the steady part of the run
//    (a smooth follow keeps this at about a pixel; a stuttering one is far above)
//  - cameraStepRatio: largest frame-to-frame camera step over the median step (1 = even)
//  - lightJitterPx / lightJitterOldPx: peak-to-peak wobble, over the same camera path at a settled zoom, of a static lamp's light pool against the world,
//    snapped origin (this build) versus the origin at the exact view (before story 16.13), in screen px
//  - kidWobblePx: peak-to-peak of the kid's on-screen x once the follow lag is steady and the zoom has settled
import { launchBrowser } from './lib/headless-browser.mjs';

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i < 0 ? d : process.argv[i + 1]; };
const base = arg('url', 'http://localhost:8080');
const tier = arg('tier', 'medium');
const seconds = Number(arg('seconds', 4));

const browser = launchBrowser('jitter-', ['--window-size=960,540', '--disable-background-timer-throttling', '--disable-renderer-backgrounding']);
const sleep = ms => new Promise(r => setTimeout(r, ms));
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
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, timeout: 300000 });
    if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 800));
    return r.result.result.value;
  };
  await send('Runtime.enable');
  await send('Page.navigate', { url: `${base}/index.html?debug&q=${tier}` });
  let ready = false;
  for (let i = 0; i < 200 && !ready; i++) {
    await sleep(300);
    try { ready = await evalJs('!!window.SCHULWEG_GAME && !!window.SCHULWEG_GAME.registry.get("app")'); } catch { /* loading */ }
  }
  if (!ready) throw new Error('game did not start; is the server running at ' + base + '?');
  await sleep(1000);

  const result = await evalJs(`(async () => {
    const game = SCHULWEG_GAME;
    game.scene.start('Game');
    await new Promise(r => setTimeout(r, 1500));
    const scene = game.scene.getScene('Game');
    const ctx = scene.ctx;
    const cam = scene.cameras.main;
    const p = ctx.players[0];
    // the longest free horizontal run of tiles
    const ts = ctx.map.tileSize, rows = ctx.map.rows;
    let best = { len: 0, x: 0, y: 0 };
    for (let y = 2; y < rows.length - 2; y++) {
      let start = -1;
      for (let x = 0; x <= rows[y].length; x++) {
        const free = x < rows[y].length && !ctx.surfaces.solid(ctx.surfaces.at((x + 0.5) * ts, (y + 0.5) * ts)) && !ctx.surfaces.solid(ctx.surfaces.at((x + 0.5) * ts, (y + 1.5) * ts)) && !ctx.surfaces.solid(ctx.surfaces.at((x + 0.5) * ts, (y - 0.5) * ts));
        if (free && start < 0) start = x;
        if (!free && start >= 0) { if (x - start > best.len) best = { len: x - start, x: start, y }; start = -1; }
      }
    }
    // start where the view is not clamped by the map edge: at least half a view in from the left, with room to walk
    const x0 = Math.max(best.x + 2, Math.ceil(300 / ts));
    p.teleport((x0 + 0.5) * ts, (best.y + 0.5) * ts, 0);
    scene.snapCamera();
    ctx.input.update = () => {};
    const it = ctx.input.intents[0];
    it.move.x = 1; it.move.y = 0; it.sprint = false;
    const lamp = { x: (x0 + 8) * ts + 5, y: (best.y - 1) * ts + 7 };
    const rec = [];
    const onFrame = () => {
      const z = cam.zoom, vw = cam.width / z, vh = cam.height / z;
      rec.push({ t: performance.now() / 1000, cx: cam.scrollX + cam.width / 2, cy: cam.scrollY + cam.height / 2, z, vx: cam.scrollX + (cam.width - vw) / 2, vy: cam.scrollY + (cam.height - vh) / 2, px: p.sprite.x, py: p.sprite.y, w: cam.width, k: 480 / vw });
    };
    game.events.on('postrender', onFrame);
    await new Promise(r => setTimeout(r, ${seconds} * 1000));
    game.events.off('postrender', onFrame);
    it.move.x = 0;
    const n = rec.length, lo = Math.floor(n * 0.3), hi = Math.floor(n * 0.9);
    const win = rec.slice(lo, hi);
    // straight-line fit of the camera centre (screen px) over the steady window
    const fit = (get) => {
      const m = win.length, ts0 = win[0].t;
      let sx = 0, sy = 0, sxx = 0, sxy = 0;
      for (const f of win) { const x = f.t - ts0, y = get(f); sx += x; sy += y; sxx += x * x; sxy += x * y; }
      const b = (m * sxy - sx * sy) / (m * sxx - sx * sx), a = (sy - b * sx) / m;
      let ss = 0;
      for (const f of win) ss += (get(f) - (a + b * (f.t - ts0))) ** 2;
      return Math.sqrt(ss / m);
    };
    const screen = f => f.cx * f.z;
    const residual = fit(screen);
    const median = a => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
    const steps = win.slice(1).map((f, i) => Math.abs(f.cx * f.z - win[i].cx * win[i].z));
    const med = median(steps) || 1e-6;
    // the kid's on-screen x over the settled-zoom frames: once the follow lag is steady it should hold within a pixel or two
    const zEnd0 = win[win.length - 1].z;
    const kid = win.filter(f => Math.abs(f.z - zEnd0) < 1e-6).map(f => (f.px - f.vx) * f.z).slice(Math.floor(win.length * 0.3));
    const kidWobble = Math.max(...kid) - Math.min(...kid);
    // a static lamp's light pool against the world: screen position of the pool minus that of the world point, per frame
    const wobble = (snap) => {
      let min = Infinity, max = -Infinity;
      const zEnd = win[win.length - 1].z;
      for (const f of win) {
        if (Math.abs(f.z - zEnd) > 1e-6) continue; // the light grid follows the zoom; measure the sideways travel at a settled zoom
        const ox = snap ? Math.round(f.vx * f.k) / f.k : f.vx;
        const lightX = (ox + Math.round((lamp.x - ox) * f.k) / f.k - f.vx) * f.z;
        const worldX = (lamp.x - f.vx) * f.z;
        min = Math.min(min, lightX - worldX); max = Math.max(max, lightX - worldX);
      }
      return max - min;
    };
    return { tier: '${tier}', frames: n, window: win.length, runTiles: best.len, cameraResidualPx: +residual.toFixed(3), cameraStepRatio: +(Math.max(...steps) / med).toFixed(2),
      kidWobblePx: +kidWobble.toFixed(2), lightJitterPx: +wobble(true).toFixed(3), lightJitterOldPx: +wobble(false).toFixed(3) };
  })()`);
  console.log(JSON.stringify(result, null, 1));
} finally {
  browser.close();
}
