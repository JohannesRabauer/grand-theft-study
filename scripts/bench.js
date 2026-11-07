// Benchmark and integration smoke test (story 1.11). Loaded by main.js only with `?bench`:
//   index.html?bench            -> installs window.SCHULWEG_BENCH and a small control panel
//   SCHULWEG_BENCH.runAll({ tiers, scenarios, steps })  -> table of ms per update (logic + physics, no rendering)
//   SCHULWEG_BENCH.smoke()      -> scripted whole-game run with assertions
// The game loop is put to sleep and the scenes are stepped by hand with a fixed 60 Hz delta
// (game.scene.update = every scene's update, Matter step, particles, tweens; no drawing), so the
// numbers are CPU cost per frame and independent of how fast the browser would render.
// Intents are written straight into ctx.input.intent (input.update is stubbed); the real
// gameplay code does the rest. See docs/PERFORMANCE.md.
const DT = 1000 / 60;
const TIERS = ['low', 'medium', 'high'];
let clock = 0;

const stepAll = game => { clock += DT; game.scene.update(clock, DT); };
// stepAll plus what drawing would do for the camera (follow, zoom, worldView), which culling and rain read
const stepFrame = game => { stepAll(game); if (game.scene.isActive('Game')) game.scene.getScene('Game').cameras.main.preRender(); };

// Fresh GameScene at a quality tier (restarts it if it is already running).
async function startGame(game, tier) {
  game.loop.sleep();
  const app = game.registry.get('app');
  app.quality.set(tier);
  if (game.scene.isActive('Game')) game.scene.getScene('Game').scene.restart();
  else {
    game.scene.stop('Menu');
    game.scene.start('Game');
  }
  for (let i = 0; i < 3; i++) stepAll(game);
  const gs = game.scene.getScene('Game');
  const ui = game.scene.getScene('UI');
  const ctx = gs.ctx;
  if (!ctx || !ui.ctx) throw new Error('game did not start');
  ctx.input.update = () => {}; // intents are scripted
  ctx.input.intent.aim = null;
  return { gs, ui, ctx, game };
}

// Steers a player's intent (default player 1) along an A* route (the bullies' pathfinder on the real map).
function makeDriver(ctx, index = 0) {
  const nav = ctx.chase.nav;
  const { ts, cols } = nav;
  const path = new Int32Array(800);
  const d = { len: 0, idx: 0, gx: 0, gy: 0, age: 0, dist: 0, sx: 0, sy: 0, still: 0 };
  d.goal = (x, y) => { d.gx = x; d.gy = y; d.age = 1e9; };
  d.tick = (reach = 10, clearance = 5) => {
    const p = ctx.players[index];
    const i = ctx.input.intents[index];
    if (++d.age > 120) { // replan now and then (also after teleports or being shoved)
      d.age = 0;
      d.len = nav.findPath(p.x, p.y, d.gx, d.gy, path);
      d.idx = d.len > 1 ? 1 : d.len;
    }
    d.dist = Math.hypot(d.gx - p.x, d.gy - p.y);
    if (++d.still > 90) { // shoved into something: plan again from here
      if (Math.hypot(p.x - d.sx, p.y - d.sy) < 6 && d.dist > 12) d.age = 1e9;
      d.still = 0; d.sx = p.x; d.sy = p.y;
    }
    let tx = d.gx;
    let ty = d.gy;
    while (d.idx < d.len) {
      const n = path[d.idx];
      const wx = (n % cols + 0.5) * ts;
      const wy = (((n / cols) | 0) + 0.5) * ts;
      const next = path[d.idx + 1];
      if (Math.hypot(wx - p.x, wy - p.y) < reach ||
          (d.idx + 1 < d.len && nav.clearFor(p.x, p.y, (next % cols + 0.5) * ts, (((next / cols) | 0) + 0.5) * ts, clearance))) d.idx++;
      else { tx = wx; ty = wy; break; }
    }
    const dx = tx - p.x;
    const dy = ty - p.y;
    const l = Math.hypot(dx, dy) || 1;
    // ease off before sharp turns so a fast bike does not run wide into walls
    let turn = Math.atan2(dy, dx) - p.move.heading;
    turn -= Math.round(turn / (2 * Math.PI)) * 2 * Math.PI;
    const mag = d.dist < 6 ? 0 : p.move.profile.faceHeading && Math.abs(turn) > 0.6 ? 0.5 : 1;
    i.move.x = (dx / l) * mag;
    i.move.y = (dy / l) * mag;
    return d.dist;
  };
  return d;
}

// Home -> school along the main road and the street east of the skatepark (avoids bully turf).
// Returns tick(): steers along it, restarts from home at the end; `done` says the last point was reached.
const ROUTE = [[7, 55], [80, 55], [82, 40], [82, 29], [79, 24], [78, 14]];
function makeRouteRunner(ctx, reach, clearance, index = 0) {
  const d = makeDriver(ctx, index);
  let k = 0;
  const go = () => d.goal(tilePx(ctx, ROUTE[k][0]), tilePx(ctx, ROUTE[k][1]));
  go();
  const run = () => {
    const dist = d.tick(reach, clearance);
    run.done = false;
    if (dist < reach + 4) {
      if (k < ROUTE.length - 1) { k++; go(); } else { run.done = true; k = 0; go(); }
    }
  };
  run.done = false;
  run.driver = d;
  return run;
}

function teleport(gs, ctx, tx, ty) {
  const ts = ctx.map.tileSize;
  const x = (tx + 0.5) * ts;
  const y = (ty + 0.5) * ts;
  for (const p of ctx.players) { // every player, so a co-op partner is not left behind at the tether
    gs.matter.body.setPosition(p.body, { x, y });
    gs.matter.body.setVelocity(p.body, { x: 0, y: 0 });
    p.move.speed = 0;
    p.sprite.setPosition(x, y);
  }
  gs.cameras.main.centerOn(x, y);
}

const tilePx = (ctx, t) => (t + 0.5) * ctx.map.tileSize;
const obj = (ctx, type, id) => ctx.map.objects.find(o => o.type === type && (!id || o.id === id));

// Fires the slingshot in bursts at a rotating target; refills ammo so it never stops.
function makeShooter(ctx) {
  const sling = ctx.players[0].toolbelt.tools[0];
  const targets = ctx.props.props;
  const i = ctx.input.intent;
  let n = 0;
  return step => {
    sling.ammo = sling.max;
    const phase = step % 36;
    if (phase === 0) {
      const t = targets[n++ % targets.length].body.position;
      i.aim = { x: t.x, y: t.y };
    }
    i.toolUse = phase < 28; // ~0.45 s charge, then release
  };
}

// Knocks awake props about so they actually move (resting bodies cost nothing).
function makeKicker(gs, ctx) {
  const list = ctx.props.props;
  let n = 0;
  return step => {
    if (step % 6) return;
    const p = list[n++ % list.length];
    if (!p.awake || !p.alive || p.body.isStatic) return;
    gs.matter.body.setVelocity(p.body, { x: (n % 5 - 2) * 1.5, y: (n % 3 - 1) * 2 });
  };
}

const wake = (ctx) => { ctx.props.cfg.margin = 1e5; ctx.props.cull(); };
const strongWind = ctx => { const w = ctx.wind.cfg; w.base = 0.8; w.gust = 0.2; };

// Each scenario returns a per-step callback. `restore` collects tuning values to put back.
const SCENARIOS = {
  walk(s, restore) {
    const { ctx } = s;
    return makeRouteRunner(ctx, 6, 5);
  },
  bike(s) {
    const { ctx } = s;
    ctx.players[0].setVehicle('bike');
    ctx.input.intent.sprint = true;
    return makeRouteRunner(ctx, 16, 9);
  },
  chase(s, restore) {
    const { ctx, gs } = s;
    const c = ctx.chase.cfg.bully;
    restore.push([c, 'catchRadius', c.catchRadius]);
    c.catchRadius = -1; // bullies stay on the player's heels instead of ending the run
    ctx.players[0].setVehicle('bike');
    teleport(gs, ctx, 46, 34);
    const d = makeDriver(ctx);
    // loop around the skatepark and the old town so the bullies keep needing paths
    const route = [[40, 24], [24, 28], [46, 40], [60, 22], [46, 34]];
    let r = 0;
    d.goal(tilePx(ctx, route[0][0]), tilePx(ctx, route[0][1]));
    let started = false;
    return () => {
      if (!started) { started = true; ctx.chase.lvl.set(2, 'bench'); }
      if (d.tick(14, 9) < 14) { r = (r + 1) % route.length; d.goal(tilePx(ctx, route[r][0]), tilePx(ctx, route[r][1])); }
    };
  },
  props(s, restore) {
    const { ctx, gs } = s;
    restore.push([ctx.props.cfg, 'margin', ctx.props.cfg.margin], [ctx.wind.cfg, 'base', ctx.wind.cfg.base], [ctx.wind.cfg, 'gust', ctx.wind.cfg.gust]);
    ctx.weather.set('rain');
    strongWind(ctx);
    teleport(gs, ctx, 52, 33); // among the skatepark cans, trash can and crates
    wake(ctx);
    const shoot = makeShooter(ctx);
    const kick = makeKicker(gs, ctx);
    const d = makeDriver(ctx);
    d.goal(tilePx(ctx, 56), tilePx(ctx, 36));
    return step => { d.tick(10); shoot(step); kick(step); if (d.dist < 12) d.goal(tilePx(ctx, 45 + (step >> 5) % 14), tilePx(ctx, 31 + (step >> 6) % 7)); };
  },
  all(s, restore) {
    const { ctx, gs } = s;
    const c = ctx.chase.cfg.bully;
    restore.push([c, 'catchRadius', c.catchRadius], [ctx.props.cfg, 'margin', ctx.props.cfg.margin], [ctx.wind.cfg, 'base', ctx.wind.cfg.base], [ctx.wind.cfg, 'gust', ctx.wind.cfg.gust]);
    c.catchRadius = -1;
    ctx.weather.set('rain');
    strongWind(ctx);
    ctx.players[0].setVehicle('bike');
    ctx.input.intent.sprint = true;
    teleport(gs, ctx, 46, 34);
    wake(ctx);
    const shoot = makeShooter(ctx);
    const kick = makeKicker(gs, ctx);
    const d = makeDriver(ctx);
    const route = [[40, 24], [24, 28], [46, 40], [60, 22], [46, 34]];
    let r = 0;
    d.goal(tilePx(ctx, route[0][0]), tilePx(ctx, route[0][1]));
    let started = false;
    return step => {
      if (!started) { started = true; ctx.chase.lvl.set(2, 'bench'); }
      if (d.tick(14, 9) < 14) { r = (r + 1) % route.length; d.goal(tilePx(ctx, route[r][0]), tilePx(ctx, route[r][1])); }
      shoot(step);
      kick(step);
    };
  },
  openWorld(s, restore) {
    const { ctx, gs } = s;
    if (ctx.world.id !== 'town') ctx.world.load('town', 'from-home');
    if (ctx.players.length < 2) gs.addDebugPlayer();
    for (const p of ctx.players) {
      for (const svc of gs.mountables) if (svc.isMounted(p.index)) svc.dismount(p);
      p.setVehicle('foot');
    }
    const c = ctx.chase.cfg.bully;
    restore.push([c, 'catchRadius', c.catchRadius], [ctx.props.cfg, 'margin', ctx.props.cfg.margin],
      [ctx.wind.cfg, 'base', ctx.wind.cfg.base], [ctx.wind.cfg, 'gust', ctx.wind.cfg.gust]);
    c.catchRadius = -1;
    ctx.weather.set('rain'); strongWind(ctx); wake(ctx);
    const kick = makeKicker(gs, ctx);
    const places = [[112,29],[95,87],[109,43],[102,52],[86,85]];
    let last = -1;
    return step => {
      const phase = Math.floor(step / 120) % places.length;
      if (phase !== last) {
        last = phase; teleport(gs, ctx, ...places[phase]); gs.snapCamera(); ctx.props.cull();
        ctx.chase.lvl.set(2, 'bench-open-world');
      }
      if (step % 30 === 0) {
        const g = gs.play.groups.find(g => g.parts.every(p => p.awake));
        if (g) gs.play.activate(g, ctx.players[step % 2]);
      }
      kick(step);
    };
  }
};

const LABELS = {
  walk: 'a idle walking', bike: 'b bike top speed', chase: 'c level-2 chase (3 bullies)', props: 'd rain+wind+props+sling', all: 'e everything', openWorld: 'f co-op expansion+linked toys+traffic'
};

const mem = () => performance.memory?.usedJSHeapSize ?? 0;

async function runOne(game, name, tier, steps, warm) {
  const s = await startGame(game, tier);
  const restore = [];
  const tick = SCENARIOS[name](s, restore);
  const times = new Float64Array(steps);
  const cam = s.gs.cameras.main;
  const intent = s.ctx.input.intent;
  let alloc = 0;
  let gcs = 0;
  let peakParticles = 0;
  let peakBullies = 0;
  let last = 0;
  let heap0 = 0;
  const peakPools = new Map();
  const particles = s.ctx.pools.byName.get('particles');
  const bullies = s.ctx.pools.byName.get('bullies');
  for (let i = -warm; i < steps; i++) {
    intent.pause = false;
    tick(i + warm);
    const t0 = performance.now();
    stepAll(game);
    const dt = performance.now() - t0;
    cam.preRender(); // camera follow + worldView (normally done while drawing); not timed
    if (i < 0) continue;
    times[i] = dt;
    for (const [name, pool] of s.ctx.pools.byName) {
      const peak = peakPools.get(name) ?? { name, live: 0, cap: pool.cap };
      peak.live = Math.max(peak.live, pool.live());
      peak.cap = pool.cap;
      peakPools.set(name, peak);
    }
    const m = mem();
    if (i === 0) { window.gc?.(); heap0 = mem(); last = heap0; }
    if (m > last) alloc += m - last; else if (m < last - 262144) gcs++;
    last = m;
    if (i % 15 === 0) {
      peakParticles = Math.max(peakParticles, particles.live());
      peakBullies = Math.max(peakBullies, bullies.live());
    }
  }
  window.gc?.(); // with --expose-gc (bench-cdp.mjs) the growth below is what is really retained
  last = mem();
  const awake = s.ctx.pools.byName.get('props').live();
  for (const [o, k, v] of restore) o[k] = v;
  const sorted = Float64Array.from(times).sort();
  let sum = 0;
  for (const t of times) sum += t;
  return {
    scenario: LABELS[name],
    tier,
    avg: sum / steps,
    p95: sorted[Math.floor(steps * 0.95)],
    max: sorted[steps - 1],
    allocKBperStep: mem() ? alloc / 1024 / steps : null,
    heapGrowthKB: last ? (last - heap0) / 1024 : null, // retained after a forced GC when available, else raw difference
    gcs,
    particles: peakParticles,
    bullies: peakBullies,
    awakeProps: awake,
    pools: [...peakPools.values()],
    poolsWithinCap: [...peakPools.values()].every(p => p.live <= p.cap)
  };
}

// Real-time run with the loop awake: frames per second and frame time as the browser really renders.
// Only meaningful in a visible, unthrottled browser (see scripts/bench-cdp.mjs); `seconds` of play.
async function runLive(game, name, tier, seconds, warm) {
  const s = await startGame(game, tier);
  const restore = [];
  const tick = SCENARIOS[name](s, restore);
  const frames = [];
  let n = 0;
  let last = 0;
  const onStep = () => { s.ctx.input.intent.pause = false; tick(n++); };
  const onPost = () => { const t = performance.now(); if (last && n > warm) frames.push(t - last); last = t; };
  game.events.on('prestep', onStep);
  game.events.on('postrender', onPost);
  game.loop.wake();
  await new Promise(r => setTimeout(r, (seconds + warm / 60) * 1000));
  game.events.off('prestep', onStep);
  game.events.off('postrender', onPost);
  game.loop.sleep();
  for (const [o, k, v] of restore) o[k] = v;
  const sorted = Float64Array.from(frames).sort();
  const avg = frames.reduce((a, b) => a + b, 0) / frames.length;
  return {
    scenario: LABELS[name], tier, frames: frames.length, fps: 1000 / avg, avgFrameMs: avg,
    p95FrameMs: sorted[Math.floor(frames.length * 0.95)], maxFrameMs: sorted[frames.length - 1]
  };
}

function renderTable(rows, panel) {
  const f = (v, d = 2) => (v == null ? 'n/a' : v.toFixed(d));
  panel.innerHTML = '<table style="border-collapse:collapse;font:11px monospace;color:#fff"><tr>' +
    ['scenario', 'tier', 'avg ms', 'p95 ms', 'max ms', 'alloc KB/step', 'heap growth KB', 'GCs', 'particles', 'bullies', 'props awake']
      .map(h => `<th style="text-align:left;padding:1px 6px">${h}</th>`).join('') + '</tr>' +
    rows.map(r => '<tr>' + [r.scenario, r.tier, f(r.avg), f(r.p95), f(r.max), f(r.allocKBperStep, 1), f(r.heapGrowthKB, 0), r.gcs, r.particles, r.bullies, r.awakeProps]
      .map(v => `<td style="padding:1px 6px">${v}</td>`).join('') + '</tr>').join('') + '</table>';
}

export function installBench(game) {
  const panel = document.createElement('div');
  panel.style.cssText = 'position:fixed;left:0;top:0;z-index:20;background:#000c;padding:4px;max-height:100%;overflow:auto';
  panel.textContent = 'bench ready: SCHULWEG_BENCH.runAll()';
  document.body.append(panel);
  let savedTier = null;
  try { savedTier = localStorage.getItem('schulweg.quality'); } catch { /* storage blocked */ }

  const api = {
    // steps: measured updates per run (default 600); warm: untimed warm-up updates (default 120)
    async runAll({ tiers = TIERS, scenarios = Object.keys(SCENARIOS), steps = 600, warm = 120 } = {}) {
      const rows = [];
      for (const tier of tiers) {
        for (const name of scenarios) {
          rows.push(await runOne(game, name, tier, steps, warm));
          renderTable(rows, panel);
          await new Promise(r => setTimeout(r, 0)); // let the page breathe
        }
      }
      if (savedTier) game.registry.get('app').quality.set(savedTier);
      console.table(rows.map(r => ({ ...r, avg: +r.avg.toFixed(3), p95: +r.p95.toFixed(3), max: +r.max.toFixed(3) })));
      return rows;
    },
    async live({ tiers = ['medium'], scenarios = ['walk', 'chase', 'all'], seconds = 6, warm = 120 } = {}) {
      const rows = [];
      for (const tier of tiers) for (const name of scenarios) rows.push(await runLive(game, name, tier, seconds, warm));
      if (savedTier) game.registry.get('app').quality.set(savedTier);
      console.table(rows);
      return rows;
    },
    async smoke(only) { return (await import('./smoke.js')).runSmoke(game, { startGame, stepAll: stepFrame, makeDriver, makeRouteRunner, makeShooter, teleport, tilePx, obj, panel }, only); }
  };
  window.SCHULWEG_BENCH = api;
  window.SCHULWEG_GAME = game;
}
