// Zoom sweep (story 1.13): steps the world camera through the speed-zoom range in a headless Edge/Chrome,
// captures every rendered frame and reports how smooth the zoom is. Node 22+, needs the game served.
//   node scripts/zoom-sweep.mjs [--url http://localhost:8080] [--tier medium|low|high] [--shot out.png]   (--shot saves a late frame of the 1.6 step)
// Per run (game logic frozen, player standing still, only the camera zoom is driven):
//  - gaps:   magenta camera background showing through the map (seams / holes) over a 0.05 step sweep
//  - drift:  screen position of a fixed world point minus the ideal continuous projection (px)
//  - step:   largest per-step jump of that point beyond its ideal displacement (px; budget 1)
//  - mad:    mean abs. difference of consecutive frames over a 0.01 step sweep; "ratio" = max over median,
//            a smooth zoom keeps it near 1, shimmering textures or jumping sprites push it up;
//            "roughness" = largest deviation of one step from the mean of its neighbours, relative to the median
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i < 0 ? d : process.argv[i + 1]; };
const base = arg('url', 'http://localhost:8080');
const tier = arg('tier', 'medium');
const exe = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe'
].find(existsSync);
if (!exe) { console.error('no Edge or Chrome found'); process.exit(2); }

const port = 9300 + Math.floor(Math.random() * 500);
const proc = spawn(exe, [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'sweep-'))}`,
  '--no-first-run', '--window-size=960,540', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', 'about:blank'
], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws;
try {
  for (let i = 0; i < 50 && !ws; i++) {
    try {
      const page = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t => t.type === 'page');
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
  for (let i = 0; i < 100 && !ready; i++) {
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
    const cam = scene.cameras.main;
    const res = game.registry.get('app').res;
    scene.sys.sceneUpdate = () => {}; // freeze the world; the sweep drives the camera
    scene.updateZoom = () => {};
    cam.setBackgroundColor('#ff00ff');
    const W = game.canvas.width, H = game.canvas.height;
    const off = document.createElement('canvas'); off.width = W; off.height = H;
    const oc = off.getContext('2d', { willReadFrequently: true });
    const frame = () => new Promise(r => game.events.once('postrender', () => { oc.drawImage(game.canvas, 0, 0); r(oc.getImageData(0, 0, W, H).data); }));
    const px = scene.player.x, py = scene.player.y;
    const P = { x: px + 150, y: py + 90 }; // fixed world feature
    const project = (z, cx, cy) => ({ x: (P.x - cx) * z + W / 2, y: (P.y - cy) * z + H / 2 });
    const sweep = async (from, to, step) => {
      const out = [];
      for (let e = from; e >= to - 1e-9; e -= step) {
        cam.setZoom(e * res.scale / 2); // e is the Medium/High zoom; Low runs the same range at half
        scene.followCamera(1);
        const data = await frame();
        const z = cam.zoom, cx = cam.scrollX + cam.width / 2, cy = cam.scrollY + cam.height / 2;
        const vw = cam.width / z / 2, vh = cam.height / z / 2; // the follow clamps the view to the map
        const a = project(z, cx, cy), ideal = project(z, Math.min(Math.max(px, vw), scene.worldW - vw), Math.min(Math.max(py, vh), scene.worldH - vh));
        out.push({ e, data, a, ideal });
      }
      return out;
    };
    const coarse = await sweep(2.0, 1.2, 0.05);
    let gaps = 0;
    for (const f of coarse) for (let i = 0; i < f.data.length; i += 4) if (f.data[i] === 255 && f.data[i + 1] === 0 && f.data[i + 2] === 255) gaps++;
    let drift = 0, step = 0;
    for (let i = 0; i < coarse.length; i++) {
      const c = coarse[i];
      drift = Math.max(drift, Math.hypot(c.a.x - c.ideal.x, c.a.y - c.ideal.y));
      if (i) {
        const p = coarse[i - 1];
        const actual = Math.hypot(c.a.x - p.a.x, c.a.y - p.a.y), ideal = Math.hypot(c.ideal.x - p.ideal.x, c.ideal.y - p.ideal.y);
        step = Math.max(step, Math.abs(actual - ideal));
      }
    }
    const shot = ${JSON.stringify(!!arg('shot', ''))} ? (await sweep(1.6, 1.6, 1), game.canvas.toDataURL()) : null;
    const fine = await sweep(2.0, 1.2, 0.01);
    const mad = [];
    for (let i = 1; i < fine.length; i++) {
      let s = 0; const a = fine[i].data, b = fine[i - 1].data;
      for (let k = 0; k < a.length; k += 4) s += Math.abs(a[k] - b[k]) + Math.abs(a[k + 1] - b[k + 1]) + Math.abs(a[k + 2] - b[k + 2]);
      mad.push(s / (a.length / 4) / 3);
    }
    let rough = 0, roughAt = 0;
    for (let i = 1; i < mad.length - 1; i++) {
      const r = Math.abs(mad[i] - (mad[i - 1] + mad[i + 1]) / 2);
      if (r > rough) { rough = r; roughAt = fine[i + 1].e; }
    }
    const sorted = [...mad].sort((x, y) => x - y);
    const median = sorted[sorted.length >> 1];
    return { tier: '${tier}', size: W + 'x' + H, frames: coarse.length + fine.length, gaps, driftPx: +drift.toFixed(3), maxStepExcessPx: +step.toFixed(3),
      madMedian: +median.toFixed(3), madMax: +sorted[sorted.length - 1].toFixed(3), madRatio: +(sorted[sorted.length - 1] / median).toFixed(2), madRoughness: +(rough / median).toFixed(3), roughAtZoom: +roughAt.toFixed(2), shot };
  })()`);
  if (result.shot) writeFileSync(arg('shot'), Buffer.from(result.shot.split(',')[1], 'base64'));
  delete result.shot;
  console.log(JSON.stringify(result, null, 1));
} finally {
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(proc.pid), '/T', '/F']); else proc.kill();
}
