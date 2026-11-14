// UI screenshot set (story 16.14, CAP-35): the menu, the HUD in day, night and rain, and the screens (pause, shop, phone, Lernbuch, Zeugnis, message, album,
// achievements, help) captured WITH the UI scene into docs/shots/overhaul/<label>/ui-*.png, so one set shows the whole look in one consistent style. A second
// check reads the same opaque panel (the shop) over a bright day and over a rainy night and fails when one pixel differs: the UI scene is never touched by the light
// map or the post passes (AD-31). Seeded and fixed-step like scripts/shots.mjs, so two runs give the same bytes.
//   node scripts/ui-shots.mjs --label after-16-14 [--tier medium|low] [--renderer canvas] [--effects full|reduced|off]
// Node 22+.
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser } from './lib/headless-browser.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i < 0 ? d : process.argv[i + 1]; };
const label = arg('label', '');
if (!/^[a-z0-9-]+$/.test(label)) { console.error('usage: node scripts/ui-shots.mjs --label <name> [--tier medium|low] [--renderer canvas]'); process.exit(2); }
const tiers = arg('tier', '') ? [arg('tier')] : ['medium', 'low'];
const outDir = join(root, 'docs', 'shots', 'overhaul', label);

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' };
const server = createServer((req, res) => {
  const path = normalize(join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
  if (!path.startsWith(root) || !existsSync(path) || !extname(path)) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream' }).end(readFileSync(path));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const SEED_SCRIPT = `(() => {
  let s = 1;
  const rnd = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  Math.random = rnd;
  window.__reseed = n => { s = n | 0; };
})()`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const sha = buf => createHash('sha256').update(buf).digest('hex').slice(0, 16);

// minutes of the day, as in scripts/shots.mjs
const TIMES = { day: 12 * 60, evening: 19 * 60 + 45, night: 21 * 60 + 30, morning: 7 * 60 };
const MENU = ['title', 'slots', 'mode', 'character'];
const WORLD = [
  { id: 'hud-day', at: 'park', time: 'day', weather: 'clear', open: null },
  { id: 'hud-evening', at: 'oldtown', time: 'evening', weather: 'clear', open: null },
  { id: 'hud-night', at: 'oldtown', time: 'night', weather: 'clear', open: null },
  { id: 'hud-rain', at: 'oldtown', time: 'day', weather: 'rain', open: null },
  { id: 'hud-rain-night', at: 'oldtown', time: 'night', weather: 'rain', open: null },
  { id: 'hud-snow', at: 'park', time: 'day', weather: 'snow', open: null },
  { id: 'pause', at: 'park', time: 'day', weather: 'clear', open: 'pause' },
  { id: 'shop-day', at: 'park', time: 'day', weather: 'clear', open: 'shop', probe: true },
  { id: 'phone', at: 'park', time: 'day', weather: 'clear', open: 'phone' },
  { id: 'lernbuch', at: 'park', time: 'day', weather: 'clear', open: 'lernbuch' },
  { id: 'zeugnis', at: 'park', time: 'day', weather: 'clear', open: 'zeugnis' },
  { id: 'message', at: 'park', time: 'day', weather: 'clear', open: 'message' },
  { id: 'album', at: 'park', time: 'day', weather: 'clear', open: 'album' },
  { id: 'achievements', at: 'park', time: 'day', weather: 'clear', open: 'achievements' },
  { id: 'help', at: 'park', time: 'day', weather: 'clear', open: 'help' },
  { id: 'parent-settings', at: 'park', time: 'day', weather: 'clear', open: 'parent' }, // story 16.15: the Effekte row
  { id: 'pause-rain-night', at: 'oldtown', time: 'night', weather: 'rain', open: 'pause' },
  { id: 'shop-rain-night', at: 'oldtown', time: 'night', weather: 'rain', open: 'shop', probe: true }
];

async function captureTier(tier) {
  const browser = launchBrowser('uishots-', ['--window-size=960,540', '--disable-background-timer-throttling', '--disable-renderer-backgrounding']);
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
    const errors = [];
    ws.addEventListener('message', ev => {
      const m = JSON.parse(ev.data);
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
      if (m.method === 'Runtime.exceptionThrown') errors.push(JSON.stringify(m.params.exceptionDetails).slice(0, 400));
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map(a => a.value ?? a.description).join(' ').slice(0, 400));
    });
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
    if (arg('effects', '')) await evalJs(`SCHULWEG_GAME.registry.get('app').quality.setEffects('${arg('effects')}')`); // story 16.15: the Effekte mode (full, reduced, off)
    await evalJs(`(() => {
      const game = SCHULWEG_GAME;
      game.loop.sleep();
      game.hintsOff = true;
      game.uiAnimOff = true; // a shot shows a screen settled
      window.__clock = 0;
      window.__step = n => { for (let i = 0; i < n; i++) { window.__clock += 1000 / 60; game.step(window.__clock, 1000 / 60); } };
      window.__grab = () => new Promise(res => {
        const W = game.canvas.width, H = game.canvas.height;
        const off = document.createElement('canvas'); off.width = W; off.height = H;
        const oc = off.getContext('2d', { willReadFrequently: true });
        game.events.once('postrender', () => oc.drawImage(game.canvas, 0, 0));
        window.__step(1);
        res({ png: off.toDataURL('image/png'), size: W + 'x' + H, oc, W, H });
      });
      return true;
    })()`);

    const out = [];
    const keep = async (shotId, extra = {}) => {
      const r = await evalJs(`(async () => { const g = await window.__grab(); const o = { png: g.png, size: g.size }; ${extra.probe ? `
        const ui = SCHULWEG_GAME.scene.getScene('UI'), top = ui.screens.top(), res = SCHULWEG_GAME.registry.get('app').res;
        const px = (bx, by) => Array.from(g.oc.getImageData(Math.round(bx * res.scale), Math.round(by * res.scale), 1, 1).data).join(',');
        o.probe = [px(34, 30), px(40, 60), px(300, 100), px(60, 222), px(440, 40), px(26, 250)];
        o.noPass = ui.cameras.main.postPipelines.length === 0 && !(ui.cameras.main.preFX?.list?.length);` : ''}
        return o; })()`);
      const png = Buffer.from(r.png.split(',')[1], 'base64');
      const file = `ui-${shotId}-${tier}.png`;
      writeFileSync(join(outDir, file), png);
      out.push({ id: shotId, tier, file, size: r.size, hash: sha(png), probe: r.probe, uiHasNoPasses: r.noPass });
      console.log(`${tier} ${shotId} ${r.size}${r.probe ? ` probe ${r.probe[0]}` : ''}`);
    };

    // the menu first (the game boots into it)
    for (const m of MENU) {
      await evalJs(`(() => { const n = SCHULWEG_GAME.menuNav; ${m === 'slots' ? 'n.play();' : m === 'mode' ? 'n.newGame(1);' : m === 'character' ? "n.mode('solo');" : ''} window.__step(3); return true; })()`);
      await keep(`menu-${m}`);
    }
    await evalJs(`(() => {
      const game = SCHULWEG_GAME;
      window.SCHULWEG_DEBUG = false; // the overlays (physics lines, zones, debug HUD) check the flag when the game scene starts
      game.scene.stop('Menu');
      game.scene.start('Game');
      window.__step(4);
      const gs = game.scene.getScene('Game');
      gs.ctx.input.update = () => {};
      gs.ctx.input.intent.aim = null;
      gs.matter.world.drawDebug = false;
      gs.matter.world.debugGraphic?.clear().setVisible(false);
      return true;
    })()`);

    for (const shot of WORLD) {
      await evalJs(`(async () => {
        const shot = ${JSON.stringify(shot)}, TIMES = ${JSON.stringify(TIMES)};
        const game = SCHULWEG_GAME, step = window.__step;
        const gs = game.scene.getScene('Game'), ui = game.scene.getScene('UI'), ctx = gs.ctx;
        ui.screens.clear();
        step(2);
        window.__reseed(${[...shot.id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 11)});
        if (ctx.world.id !== 'town') ctx.world.load('town', 'from-home');
        const minute = TIMES[shot.time];
        const phase = ctx.day.cfg.phases.find(p => minute >= p.start && minute < p.end);
        ctx.state.dispatch('clock.set', { day: 1, minute, phase: phase.id });
        ctx.events.emit('clock:tick', ctx.day.snapshot());
        ctx.weather.set(shot.weather);
        gs.atmosphere.settle();
        gs.season.settle();
        const nodes = ctx.map.objects.filter(o => o.district === shot.at && typeof o.x === 'number');
        const mx = nodes.reduce((a, o) => a + o.x, 0) / nodes.length, my = nodes.reduce((a, o) => a + o.y, 0) / nodes.length;
        const n = nodes.reduce((b, o) => Math.hypot(o.x - mx, o.y - my) < Math.hypot(b.x - mx, b.y - my) ? o : b);
        for (const p of ctx.players) p.teleport((n.x + 0.5) * ctx.map.tileSize, (n.y + 0.5) * ctx.map.tileSize);
        gs.snapCamera();
        gs.cameras.main.resetFX();
        step(shot.weather === 'clear' ? 60 : 200);
        // a few things for the HUD to show: unread mail, some money, level progress, a chain of tricks, a toast
        ctx.state.dispatch('wallet.earn', { cents: 1250, reason: 'shot' });
        if (ctx.phone && !ctx.phone.inbox.length) ctx.state.dispatch('flags.set', { key: 'phone.inbox', value: [{ id: 'mom-ontime', day: 1, from: 'mom', read: false }, { id: 'mom-ontime', day: 2, from: 'mom', read: true }] });
        ctx.events.emit('phone:changed');
        if (!shot.open) ctx.events.emit('ui:toast', { key: 'phone.badge', params: { n: 2 } });
        if (shot.open === 'zeugnis') [['mathe', 2], ['deutsch', 3], ['englisch', 1], ['sachkunde', 2], ['science', 2]].forEach(([subject, grade], i) => ctx.grades.record(0, { subject, score: Math.max(0, 1 - (grade - 1) * 0.18), grade, lessonId: 'shot-' + i, day: 1 }));
        step(2);
        const open = shot.open;
        if (open === 'pause') ui.togglePause();
        else if (open === 'shop') ctx.shops.open('vehicles', 0);
        else if (open === 'phone') ctx.phone.toggle();
        else if (open === 'lernbuch') ctx.openLernbuch();
        else if (open === 'album') ctx.openAlbum();
        else if (open === 'achievements') ctx.openAchievements();
        else if (open === 'help') ctx.openHelp();
        else if (open === 'parent') {
          const { ParentSettingsScreen } = await import('./ui/screens/ParentSettingsScreen.js');
          ui.screens.push(new ParentSettingsScreen(ui, ctx, ui.screens, ui.cache.json.get('parent')));
        }
        else if (open === 'message') {
          const { MessageScreen } = await import('./ui/screens/MessageScreen.js');
          ui.screens.push(new MessageScreen(ui, ctx, ui.screens, { title: ctx.t('day.bedtime.title'), lines: [ctx.t('zeugnis.end.body')], inputCfg: ui.cache.json.get('input') }));
        } else if (open === 'zeugnis') {
          const { ReportCardScreen } = await import('./ui/screens/ReportCardScreen.js');
          const cards = ctx.players.map(p => ({ player: p.index, ...ctx.grades.yearCard(p.index, 1, ctx.i18n.lang), applied: true }));
          ui.screens.push(new ReportCardScreen(ui, ctx, ui.screens, { cards, day: 1, inputCfg: ui.cache.json.get('input') }));
        }
        step(shot.open === 'zeugnis' ? 90 : 4);
        return true;
      })()`);
      await keep(shot.id, { probe: shot.probe });
    }
    return { out, errors };
  } finally {
    browser.close();
  }
}

try {
  mkdirSync(outDir, { recursive: true });
  const shots = [];
  const errors = [];
  for (const tier of tiers) { const r = await captureTier(tier); shots.push(...r.out); errors.push(...r.errors); }
  writeFileSync(join(outDir, 'ui-shots.json'), JSON.stringify({ schema: 1, label, shots }, null, 1) + '\n');
  // the UI scene is never lit: the shop panel reads the same pixels over a bright day and over a rainy night
  let bad = 0;
  for (const tier of tiers) {
    const a = shots.find(s => s.id === 'shop-day' && s.tier === tier);
    const b = shots.find(s => s.id === 'shop-rain-night' && s.tier === tier);
    if (!a?.probe || !b?.probe) continue;
    const same = a.probe.every((p, i) => p === b.probe[i]);
    console.log(`${tier} panel pixels day vs rainy night: ${same ? 'identical' : `DIFFER ${a.probe.join(' | ')} vs ${b.probe.join(' | ')}`}; UI camera without passes: ${a.uiHasNoPasses && b.uiHasNoPasses}`);
    if (!same || !a.uiHasNoPasses) bad++;
  }
  console.log(`${shots.length} UI shots written to ${outDir}`);
  if (errors.length) { console.error(`console errors:\n${errors.join('\n')}`); process.exitCode = 1; }
  if (bad) process.exitCode = 1;
} finally {
  server.close();
}
