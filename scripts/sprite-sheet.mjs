// Contact sheet of every procedural sprite (story 16.20, CAP-35): kids, NPC types, animals and vehicles, each at game scale
// (the Medium texture 1:1) and zoomed 3x, written to docs/shots/overhaul/<label>/ as one PNG per group plus keys.json.
//   node scripts/sprite-sheet.mjs --label sprites-before
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser } from './lib/headless-browser.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i < 0 ? d : process.argv[i + 1]; };
const label = arg('label', '');
if (!/^[a-z0-9-]+$/.test(label)) { console.error('usage: node scripts/sprite-sheet.mjs --label <name>'); process.exit(2); }
const outDir = join(root, 'docs', 'shots', 'overhaul', label);
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

// groups: [name, [rows]] where a row is a list of key regexes (matched against all texture keys, sorted)
const GROUPS = {
  helena: [/^player-helena(-|$)/, /^portrait-helena$/],
  kilian: [/^player-kilian(-|$)/, /^portrait-kilian$/],
  lorenz: [/^player-lorenz(-|$)/, /^portrait-lorenz$/],
  'other-riders': [/^(player|bully)(-|$)/],
  npcs: [/^npc-(?!dog|bench)/],
  animals: [/^critter-/, /^npc-(dog|bench)/],
  vehicles: [/^(bike|skateboard|skates|scooter|rollerblades|bus|car|van|tram|garage-|lock-|bike-chain|skate-shadow)/]
};

const browser = launchBrowser('sprites-', ['--window-size=960,540']);
try {
  let ws;
  for (let i = 0; i < 50 && !ws; i++) {
    try { const page = (await (await fetch(`http://127.0.0.1:${browser.port}/json`)).json()).find(t => t.type === 'page'); if (page) ws = new WebSocket(page.webSocketDebuggerUrl); } catch { await sleep(200); }
  }
  await new Promise(r => ws.addEventListener('open', r));
  let id = 0; const pending = new Map();
  ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const evalJs = async expr => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, timeout: 600000 }); if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 1200)); return r.result.result.value; };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: SEED });
  await send('Page.navigate', { url: `${base}/index.html?debug&q=medium` });
  let ready = false;
  for (let i = 0; i < 100 && !ready; i++) { await sleep(300); try { ready = await evalJs('!!window.SCHULWEG_GAME && !!window.SCHULWEG_GAME.registry.get("app")'); } catch { /* loading */ } }
  if (!ready) throw new Error('game did not start');
  await sleep(500);
  await evalJs(`(() => { const g = SCHULWEG_GAME; g.loop.sleep(); window.__c = 0; window.__step = n => { for (let i = 0; i < n; i++) { window.__c += 1000 / 60; g.step(window.__c, 1000 / 60); } }; g.scene.stop('Menu'); g.scene.start('Game'); window.__step(4); return true; })()`);
  mkdirSync(outDir, { recursive: true });
  const index = {};
  for (const [name, res] of Object.entries(GROUPS)) {
    const r = await evalJs(`(() => {
      const tm = SCHULWEG_GAME.textures, res = ${JSON.stringify(res.map(r => r.source))}.map(s => new RegExp(s));
      const keys = tm.getTextureKeys().filter(k => !k.startsWith('__') && res.some(r => r.test(k))).sort();
      const items = keys.map(k => ({ k, c: tm.get(k).getSourceImage() })).filter(i => i.c && i.c.width && i.c.width <= 200);
      const Z = 3, pad = 10, lab = 12, cols = 6;
      // each cell: native sprite and 3x zoom side by side, label above
      const cw = Math.max(...items.map(i => i.c.width * (1 + Z))) + pad * 3, ch = Math.max(...items.map(i => i.c.height * Z)) + lab + pad * 2;
      const rows = Math.ceil(items.length / cols);
      const cv = document.createElement('canvas'); cv.width = cols * cw; cv.height = rows * ch;
      const x = cv.getContext('2d'); x.imageSmoothingEnabled = false;
      x.fillStyle = '#6fae5a'; x.fillRect(0, 0, cv.width, cv.height);
      x.fillStyle = '#5c9a4d'; for (let yy = 0; yy < cv.height; yy += 16) for (let xx = (yy / 16 % 2) * 16; xx < cv.width; xx += 32) x.fillRect(xx, yy, 16, 16);
      x.font = '10px monospace'; x.textBaseline = 'top';
      items.forEach((it, i) => {
        const cx = (i % cols) * cw, cy = Math.floor(i / cols) * ch;
        x.fillStyle = '#000'; x.fillText(it.k, cx + 4, cy + 2);
        x.drawImage(it.c, cx + pad, cy + lab + pad);
        x.drawImage(it.c, cx + pad * 2 + it.c.width, cy + lab + pad, it.c.width * Z, it.c.height * Z);
      });
      return { png: cv.toDataURL('image/png'), keys: items.map(i => i.k + ' ' + i.c.width + 'x' + i.c.height) };
    })()`);
    writeFileSync(join(outDir, `${name}.png`), Buffer.from(r.png.split(',')[1], 'base64'));
    index[name] = r.keys;
    console.log(name, r.keys.length);
  }
  writeFileSync(join(outDir, 'keys.json'), JSON.stringify(index, null, 1) + '\n');
} finally { browser.close(); server.close(); }
