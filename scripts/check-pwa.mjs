// Offline play (story 14.1): the manifest and the icons, the page links, and the service worker's behaviour run inside a fake worker scope:
// install caches the shell, online requests are answered from the network and kept, offline requests come from the cache, the page itself falls
// back to index.html, only GET is handled, old caches are dropped on activate.
// Run: node scripts/check-pwa.mjs
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';

const text = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const manifest = JSON.parse(text('manifest.webmanifest'));
const html = text('index.html');

// ---- manifest, icons, page
assert.ok(manifest.name && manifest.short_name && manifest.start_url && manifest.scope, 'names and start');
assert.ok(['fullscreen', 'standalone'].includes(manifest.display) && manifest.orientation === 'landscape');
for (const need of [192, 512]) assert.ok(manifest.icons.some(i => i.sizes === `${need}x${need}` && i.type === 'image/png'), `a ${need} icon`);
assert.ok(manifest.icons.some(i => i.purpose === 'maskable'), 'a maskable icon');
for (const i of manifest.icons) {
  assert.ok(existsSync(new URL(`../${i.src}`, import.meta.url)), `${i.src} exists`);
  const b = readFileSync(new URL(`../${i.src}`, import.meta.url));
  assert.deepEqual([...b.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], `${i.src} is a PNG`);
  assert.equal(b.readUInt32BE(16), parseInt(i.sizes), `${i.src} has the stated width`);
}
assert.match(html, /rel="manifest" href="manifest.webmanifest"/);
assert.match(html, /theme-color/);
assert.match(text('main.js'), /serviceWorker\.register\('sw\.js'\)/, 'the page registers the worker');
assert.match(text('main.js'), /has\('bench'\)/, 'but not in the scripted runs');
for (const f of ['index.html', 'main.js', 'manifest.webmanifest', 'icons/icon-192.png']) assert.ok(text('sw.js').includes(f), `${f} is in the shell`);
assert.match(text('.github/workflows/pages.yml'), /sw\.js/, 'the Pages workflow publishes the worker');

// ---- the worker in a fake scope
const store = new Map(); // cache name -> Map(url -> response)
const caches = {
  open: async name => { if (!store.has(name)) store.set(name, new Map()); const m = store.get(name); return { addAll: async urls => { for (const u of urls) m.set(u, { ok: true, body: `shell:${u}` }); }, put: async (req, res) => { m.set(req.url ?? req, res); } }; },
  keys: async () => [...store.keys()],
  delete: async name => store.delete(name),
  match: async req => { const url = req.url ?? req; for (const m of store.values()) if (m.has(url)) return m.get(url); for (const m of store.values()) for (const [k, v] of m) if (url.endsWith(k) || k.endsWith(url)) return v; return undefined; }
};
const listeners = {};
let online = true;
const scope = {
  caches, Response: { error: () => ({ error: true }) }, console, Promise,
  fetch: async req => { if (!online) throw new Error('offline'); return { ok: true, type: 'basic', body: `net:${req.url}`, clone() { return { ...this }; } }; },
  self: { addEventListener: (n, f) => { listeners[n] = f; }, skipWaiting: async () => {}, clients: { claim: async () => {} } }
};
vm.runInNewContext(text('sw.js'), scope);
const run = async (type, extra = {}) => { let p; listeners[type]({ ...extra, waitUntil: x => { p = x; }, respondWith: x => { p = x; } }); return p; };
await run('install');
assert.ok(store.get('schulweg-dev').has('index.html'), 'install caches the shell');
await run('fetch', { request: { method: 'GET', url: 'https://x.test/data/a.json', mode: 'cors' } }).then(r => assert.equal(r.body, 'net:https://x.test/data/a.json', 'online: from the network'));
await new Promise(r => setTimeout(r, 5));
assert.ok(store.get('schulweg-dev').has('https://x.test/data/a.json'), 'and kept for later');
online = false;
assert.equal((await run('fetch', { request: { method: 'GET', url: 'https://x.test/data/a.json', mode: 'cors' } })).body, 'net:https://x.test/data/a.json', 'offline: the cached copy');
assert.deepEqual(await run('fetch', { request: { method: 'GET', url: 'https://x.test/never-seen.js', mode: 'cors' } }), { error: true }, 'offline and never seen: an error, not a hang');
assert.equal((await run('fetch', { request: { method: 'GET', url: 'https://x.test/other/', mode: 'navigate' } })).body, 'shell:index.html', 'a page offline falls back to index.html');
let handled = false;
listeners.fetch({ request: { method: 'POST', url: 'https://x.test/p' }, respondWith: () => { handled = true; } });
assert.ok(!handled, 'only GET is handled');
store.set('old-cache', new Map());
await run('activate');
assert.ok(!store.has('old-cache') && store.has('schulweg-dev'), 'old caches are dropped on activate');
console.log('pwa ok: manifest, 3 icons, page links, worker install/online/offline/fallback/activate');
