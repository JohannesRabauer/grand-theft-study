// Runs the ?bench page in a headless Edge/Chrome through the DevTools protocol (no dependencies,
// Node 22+): the benchmark table and, with --live, real rendering frame rates, in a browser that
// is not throttled like a hidden tab. Needs the game served, e.g. `python -m http.server 8080`.
//   node scripts/bench-cdp.mjs [--url http://localhost:8080] [--live [--uncapped]] [--smoke] [--cpu scenario [--live] --tier medium] [--eval "js expression"] [--alloc scenario --tier medium] [--steps 600] [--json out.json]
import { writeFileSync } from 'node:fs';
import { launchBrowser } from './lib/headless-browser.mjs';

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i < 0 ? d : (process.argv[i + 1]?.startsWith('--') || i + 1 >= process.argv.length ? true : process.argv[i + 1]); };
const base = arg('url', 'http://localhost:8080');
const steps = +arg('steps', 600);

const browser = launchBrowser('bench-', [
  '--enable-precise-memory-info', '--js-flags=--expose-gc', '--window-size=960,540',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
  ...(arg('uncapped', false) ? ['--disable-frame-rate-limit', '--disable-gpu-vsync'] : [])
]);
const port = browser.port;

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function connect() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      const page = list.find(t => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
    await sleep(200);
  }
  throw new Error('browser did not start');
}

try {
  const ws = new WebSocket(await connect());
  await new Promise(r => ws.addEventListener('open', r));
  let id = 0;
  const pending = new Map();
  const logs = [];
  ws.addEventListener('message', ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') logs.push('EXCEPTION ' + m.params.exceptionDetails.text + ' ' + (m.params.exceptionDetails.exception?.description ?? '') + ' ' + m.params.exceptionDetails.url + ':' + (m.params.exceptionDetails.lineNumber + 1));
    if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) logs.push(m.params.type + ': ' + m.params.args.map(a => a.value ?? a.description).join(' '));
  });
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const evalJs = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, timeout: 900000 });
    if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 800));
    return r.result.result.value;
  };

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.navigate', { url: `${base}/index.html?bench${arg('query', '')}` });
  let ready = false;
  for (let i = 0; i < 200 && !ready; i++) {
    await sleep(300);
    try { ready = await evalJs('!!window.SCHULWEG_BENCH && !!window.Phaser && !!window.SCHULWEG_GAME.registry.get("app")'); } catch { /* page still loading */ }
  }
  if (!ready) throw new Error('game did not start; is the server running at ' + base + '?\n' + logs.join('\n'));
  await sleep(1500); // let BootScene finish

  const out = {};
  if (arg('eval', false)) console.log(JSON.stringify(await evalJs(arg('eval')), null, 1));
  else if (arg('cpu', false)) {
    // CPU profile of one scenario: self and inclusive milliseconds per function (e.g. --cpu all --tier medium).
    await send('Profiler.enable');
    await send('Profiler.setSamplingInterval', { interval: 100 });
    await send('Profiler.start');
    if (arg('live', false)) await evalJs(`SCHULWEG_BENCH.live({ tiers: ['${arg('tier', 'medium')}'], scenarios: ['${arg('cpu', 'all')}'], seconds: 8 })`); // with --live: the real render loop (story 16.15)
    else await evalJs(`SCHULWEG_BENCH.runAll({ steps: ${steps}, tiers: ['${arg('tier', 'medium')}'], scenarios: ['${arg('cpu', 'all')}'] })`);
    const prof = (await send('Profiler.stop')).result.profile;
    const byId = new Map(prof.nodes.map(n => [n.id, n]));
    const selfT = new Map();
    prof.samples.forEach((id, i) => selfT.set(id, (selfT.get(id) ?? 0) + (prof.timeDeltas[i] ?? 0)));
    const nm = n => `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').slice(-2).join('/')}:${n.callFrame.lineNumber + 1}`;
    const self = new Map();
    const incl = new Map();
    const walk = (n, stack) => {
      const k = nm(n);
      const t = selfT.get(n.id) ?? 0;
      self.set(k, (self.get(k) ?? 0) + t);
      const first = !stack.has(k);
      if (first) stack.add(k);
      let tot = t;
      for (const c of n.children ?? []) tot += walk(byId.get(c), stack);
      if (first) { incl.set(k, (incl.get(k) ?? 0) + tot); stack.delete(k); }
      return tot;
    };
    walk(prof.nodes[0], new Set());
    const show = (m, title) => console.log(title + String.fromCharCode(10) + [...m].sort((a, b) => b[1] - a[1]).slice(0, 28).map(([k, v]) => `${(v / 1000).toFixed(0).padStart(7)} ms  ${k}`).join(String.fromCharCode(10)));
    show(self, '-- self time');
    show(incl, '-- inclusive time');
  } else if (arg('alloc', false)) {
    // Sampling heap profiler: which functions allocate the most during one scenario (e.g. --alloc all --tier medium).
    await send('HeapProfiler.enable');
    await send('HeapProfiler.startSampling', { samplingInterval: 512, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
    await evalJs(`SCHULWEG_BENCH.runAll({ steps: ${steps}, tiers: ['${arg('tier', 'medium')}'], scenarios: ['${arg('alloc', 'all')}'] })`);
    const result = (await send('HeapProfiler.stopSampling')).result.profile;
    const flat = new Map();
    const name = f => `${f.functionName || '(anon)'} ${f.url.split('/').slice(-2).join('/')}:${f.lineNumber + 1}`;
    // grouped by the nearest game-code caller, so engine internals are attributed to the code that triggered them
    const walk = (n, owner, chain = []) => {
      const f = n.callFrame;
      chain = [...chain, f.functionName || '(anon)'];
      const own = f.url && !f.url.includes('phaser') ? name(f) : owner;
      const k = own === name(f) ? own : `${own}  >>  ${chain.slice(-4).join(' < ')}`;
      flat.set(k, (flat.get(k) ?? 0) + n.selfSize);
      n.children.forEach(c => walk(c, own, chain));
    };
    walk(result.head, '(engine)');
    const top = [...flat].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => `${(v / 1024).toFixed(0).padStart(7)} KB  ${k}`);
    console.log(top.join(String.fromCharCode(10)));
  } else {
    if (arg('smoke', false)) out.smoke = await evalJs('SCHULWEG_BENCH.smoke().then(r => JSON.parse(JSON.stringify(r)))');
    else if (arg('live', false)) out.live = await evalJs('SCHULWEG_BENCH.live({ tiers: ["low","medium","high"], scenarios: ["walk","chase","all"], seconds: 6 })');
    else out.bench = await evalJs(`SCHULWEG_BENCH.runAll({ steps: ${steps} })`);
    out.consoleProblems = logs;
    const json = JSON.stringify(out, null, 1);
    if (typeof arg('json', false) === 'string') writeFileSync(arg('json'), json);
    console.log(json);
  }
  ws.close();
} finally {
  browser.close();
}
