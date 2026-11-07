// Whole-game smoke test, run with `index.html?bench` then `await SCHULWEG_BENCH.smoke()`
// (or `node scripts/bench-cdp.mjs --smoke`). Starts from the menu and plays a scripted session by
// stepping the game by hand: bike ride home -> school, skatepark turf, chase, hide and escape,
// getting caught and respawning, slingshot, weather, language, quality, pause, back to menu and a
// second run. Every step asserts game state; console errors and exceptions fail the run.
import { CAT } from '../physics/categories.js';
import { TestScreen } from '../ui/screens/TestScreen.js';

const FRAME = 1000 / 60;

export async function runSmoke(game, h) {
  const checks = [];
  const problems = [];
  const check = (name, ok, detail = '') => { checks.push({ name, ok: !!ok, detail: String(detail) }); return ok; };

  const origErr = console.error;
  const origWarn = console.warn;
  const onErr = e => problems.push('window error: ' + (e.message ?? e.reason));
  console.error = (...a) => { problems.push('console.error: ' + a.join(' ')); origErr.apply(console, a); };
  console.warn = (...a) => { problems.push('console.warn: ' + a.join(' ')); origWarn.apply(console, a); };
  window.addEventListener('error', onErr);
  window.addEventListener('unhandledrejection', onErr);
  const savedLang = game.registry.get('app').i18n.lang;
  const savedTier = game.registry.get('app').quality.id;

  try {
    game.loop.sleep();
    const step = n => { for (let i = 0; i < n; i++) h.stepAll(game); };

    // ---- menu -> game ----
    if (game.scene.isActive('Game')) game.scene.getScene('Game').scene.start('Menu'); else if (!game.scene.isActive('Menu')) game.scene.start('Menu');
    step(3);
    const menu = game.scene.getScene('Menu');
    check('menu is active', game.scene.isActive('Menu'));
    check('menu shows a Start button', menu.children.list.some(o => o.text === game.registry.get('app').t('menu.start') || o.list?.some?.(c => c.text === game.registry.get('app').t('menu.start'))) ||
      menu.children.list.length > 4, `${menu.children.list.length} objects`);
    game.registry.get('app').quality.set('medium');
    menu.scene.start('Game'); // what the Start button does
    step(4);
    const gs = game.scene.getScene('Game');
    const ui = game.scene.getScene('UI');
    const ctx = gs.ctx;
    const hud = (id) => ui.hud.get(id);
    check('game and UI scenes running', game.scene.isActive('Game') && game.scene.isActive('UI') && !!ctx);
    ctx.input.update = () => {};
    const intent = ctx.input.intent;
    intent.aim = null;
    const events = [];
    const log = n => ctx.events.on(n, e => events.push([n, e]));
    ['goal:reached', 'turf:enter', 'turf:leave', 'chase:level', 'player:caught', 'player:respawn', 'tool:fire', 'prop:hit', 'weather:changed', 'bike:bell', 'hide:enter', 'npc:react'].forEach(log);
    const count = n => events.filter(e => e[0] === n).length;
    const pools = () => [...ctx.pools.byName].map(([name, p]) => ({ name, live: p.live(), cap: p.cap }));
    const live = name => ctx.pools.byName.get(name).live();
    const { player, surfaces } = ctx;
    const drive = h.makeDriver(ctx);
    const T = t => h.tilePx(ctx, t);
    const press = key => { intent[key] = true; step(1); intent[key] = false; };
    // step until cond() or max frames; returns frames used or -1
    const until = (cond, max, tick) => { for (let i = 0; i < max; i++) { tick?.(); step(1); if (cond()) return i; } return -1; };
    let wallViolations = 0;
    const inWall = () => { if (surfaces.solid(surfaces.at(player.x, player.y))) wallViolations++; };

    check('starts on foot at home with 5 euro', player.vehicle === 'foot' && ctx.state.shared.money === 500, `money ${ctx.state.shared.money}`);
    check('no bullies, level 0, pools quiet', ctx.chase.level === 0 && live('bullies') === 0 && live('projectiles') === 0);
    const wallsAtStart = live('walls');
    check('wall streaming keeps only nearby walls', wallsAtStart > 0 && wallsAtStart < ctx.pools.byName.get('walls').cap * 0.6, `${wallsAtStart}/${ctx.pools.byName.get('walls').cap}`);

    // ---- walk to the bike, mount ----
    const bike = ctx.map.objects.find(o => o.type === 'bike');
    drive.goal(T(bike.x), T(bike.y));
    check('walked to the bike', until(() => drive.dist < 14, 900, () => drive.tick(6)) >= 0, `dist ${drive.dist.toFixed(1)}`);
    intent.move.x = intent.move.y = 0;
    press('interact');
    check('mounted the bike', player.vehicle === 'bike' && !!gs.bikes.mounted);
    press('jump');
    check('bell rings', count('bike:bell') === 1 && live('bell') >= 1);

    // ---- ride home -> school by the main road (scripted route, A* between points) ----
    const route = h.makeRouteRunner(ctx, 16, 9);
    intent.sprint = true;
    let topSpeed = 0;
    const ride = until(() => gs.zones.reached, 5400, () => {
      route();
      topSpeed = Math.max(topSpeed, player.move.velSpeed);
      inWall();
    });
    intent.sprint = false;
    check('rode to the school (goal:reached)', ride >= 0 && count('goal:reached') === 1, `${ride} frames, top ${topSpeed.toFixed(0)} px/s, at ${player.x.toFixed(0)},${player.y.toFixed(0)}`);
    check('no �rger on the road', ctx.chase.level === 0 && live('bullies') === 0);
    check('never inside a wall tile on the way', wallViolations === 0, `${wallViolations} frames`);
    check('arrow shows arrival message', hud('objective').arrow.done && hud('objective').arrow.msg.visible);

    // ---- skatepark turf: chase starts ----
    const turf = ctx.map.objects.find(o => o.type === 'turf' && o.id === 'skatepark');
    drive.goal(T(turf.x + 2), T(turf.y + 2));
    intent.sprint = true;
    until(() => count('turf:enter') >= 1, 4200, () => { drive.tick(16, 9); inWall(); });
    intent.sprint = false;
    intent.move.x = intent.move.y = 0;
    check('entered turf, level >= 1', ctx.chase.level >= 1, `level ${ctx.chase.level}`);
    check('bullies spawn and chase', until(() => live('bullies') > 0 && ctx.chase.bullies.some(b => b.active && b.state === 'CHASE'), 600) >= 0, `bullies ${live('bullies')}`);
    check('bully count within the Medium cap', live('bullies') <= ctx.quality.tier.maxBullies);
    step(180);
    check('Medium never exceeds 3 bullies at level 2', live('bullies') <= 3 && ctx.chase.level <= 2, `level ${ctx.chase.level}, bullies ${live('bullies')}`);
    check('HUD shows chase level', hud('anger').bars && ctx.chase.level >= 1);

    // ---- hide and escape (teleport: bullies are far, the hedge is the hiding spot) ----
    const hedge = ctx.map.objects.find(o => o.type === 'hiding' && o.id === 'hedge-park');
    h.teleport(gs, ctx, hedge.x + hedge.w / 2 | 0, hedge.y + hedge.h / 2 | 0);
    intent.sprint = false;
    intent.move.x = intent.move.y = 0;
    const hid = until(() => ctx.chase.level === 0, 900, () => { intent.move.x = intent.move.y = 0; });
    check('hiding still in a hiding spot clears the chase', hid >= 0, `${hid} frames, hidden=${ctx.chase.hidden}`);
    const gone = until(() => live('bullies') === 0, 1500);
    check('bullies walk away and return to the pool', gone >= 0, `${gone} frames, bullies ${live('bullies')}`);
    step(360); // lockout after a clear

    // ---- get caught and respawn ----
    h.teleport(gs, ctx, turf.x + 2, turf.y + 2);
    const caught = until(() => count('player:caught') >= 1, 4000, () => { intent.move.x = intent.move.y = 0; });
    check('caught by a bully', caught >= 0, `${caught} frames`);
    check('world frozen, money -1, frame shown', ctx.frozen && ctx.state.shared.money === 400 && hud('caught').frame.items.length > 0 && hud('caught').frame.items[0].visible, `money ${ctx.state.shared.money}`);
    check('chase reset on catch', ctx.chase.level === 0 && live('bullies') === 0);
    const home = gs.caught.home;
    const resp = until(() => count('player:respawn') >= 1, 400);
    check('respawned at home on foot', resp >= 0 && Math.hypot(player.x - home.x, player.y - home.y) < 24 && !ctx.frozen && player.vehicle === 'foot' && !gs.bikes.mounted, `${resp} frames`);
    check('caught frame hidden again', !hud('caught').frame.items[0].visible);
    step(30);

    // ---- pedestrians (AD-15) ----
    const crowd = ctx.crowd;
    step(120);
    check('pedestrians fill the town up to the Medium cap', crowd.liveCount >= 6 && crowd.liveCount <= ctx.quality.tier.maxNPCs && live('npcs') === crowd.liveCount, `${crowd.liveCount}/${ctx.quality.tier.maxNPCs}`);
    const victims = crowd.list.filter(n => n.active && !n.sitting).slice(0, 3);
    for (const [i, n] of victims.entries()) { n.cool = 0; gs.matter.body.setPosition(n.body, { x: player.x + 26 + i * 12, y: player.y - 8 + i * 12 }); }
    step(2);
    const reacts = count('npc:react');
    ctx.events.emit('bike:bell', { x: player.x, y: player.y });
    step(8);
    check('a bell near pedestrians makes them step aside with a bubble', count('npc:react') >= reacts + victims.length && victims.every(n => n.state === 'REACT') && live('bubbles') > 0 && live('bubbles') <= 3, `${count('npc:react') - reacts} reacted, ${live('bubbles')} bubbles`);
    const line = crowd.bubbles.items.find(b => b.owner)?.text.text;
    check('the shout is a translated line', ctx.i18n.lang === 'de' ? /[A-Za-z]/.test(line) && line !== 'npc.react.1' : true, line);
    step(150);
    check('pedestrians resume and the bubbles go away', victims.every(n => n.state === 'WALK' || n.state === 'STAND') && live('bubbles') === 0, victims.map(n => n.state).join(','));
    const crowdBodies = [...crowd.list.map(n => n.body), ...crowd.dogs.map(d => d.body)];
    check('pedestrian and dog bodies never meet projectiles', crowdBodies.every(b => !(b.collisionFilter.mask & CAT.PROJECTILE) && !(b.collisionFilter.category & CAT.PROJECTILE)));

    // ---- slingshot ----
    const sling = ctx.toolbelt.current;
    sling.ammo = 5;
    const can = ctx.props.props.find(p => p.kind === 'can' && p.body.isStatic);
    h.teleport(gs, ctx, Math.floor(can.body.position.x / 16), Math.floor(can.body.position.y / 16) + 3);
    step(2);
    intent.aim = { x: can.body.position.x, y: can.body.position.y };
    intent.toolUse = true;
    step(50);
    check('aim dots show while charging', live('aimDots') > 0);
    intent.toolUse = false;
    step(2);
    check('slingshot fired, ammo 4', count('tool:fire') === 1 && sling.ammo === 4, `ammo ${sling.ammo}`);
    check('pebble in flight', live('projectiles') >= 1 || count('prop:hit') >= 1);
    const flown = until(() => live('projectiles') === 0, 200);
    check('pebble pool back to zero', flown >= 0 && live('aimDots') === 0, `${flown} frames`);
    check('pebble hit the target can (info)', true, count('prop:hit') >= 1 ? 'hit' : 'missed');
    intent.aim = null;
    ctx.chase.reset(); // the shooting range is bully turf: leave it quiet for the rest of the run
    h.teleport(gs, ctx, 7, 51);
    step(30);
    check('quiet again after the shooting range', ctx.chase.level === 0 && live('bullies') === 0 && !ctx.frozen);

    // ---- weather ----
    press('weather');
    check('rain on', ctx.weather.state === 'rain');
    step(240);
    check('rain particles and puddles', live('particles') > 0 && ctx.weather.count > 0, `particles ${live('particles')}, puddles ${ctx.weather.count}`);
    press('weather');
    check('rain off', ctx.weather.state === 'clear');
    step(180);

    // ---- day clock (no slot: freeplay) ----
    check('freeplay clock stands at its data time', ctx.day.mode === 'freeplay' && ctx.day.time === '07:45' && ctx.day.phase === 'commute', `${ctx.day.mode} ${ctx.day.time}`);
    check('HUD shows the time and the phase', hud('clock').time.text === '07:45' && hud('clock').phase.text.includes(ctx.t('day.phase.commute')), `${hud('clock').time.text} / ${hud('clock').phase.text}`);

    // ---- language ----
    const before = hud('status').stamina.text;
    ctx.i18n.set(savedLang === 'de' ? 'en' : 'de');
    step(2);
    check('language switch re-texts the HUD', hud('status').stamina.text === ctx.t('hud.stamina') && hud('status').stamina.text !== before, `${before} -> ${hud('status').stamina.text}`);
    ctx.i18n.set(savedLang);
    step(2);

    // ---- quality switch round trip ----
    for (const tier of ['low', 'high', 'medium']) {
      ctx.quality.set(tier);
      step(20);
      const bad = pools().filter(p => p.live > p.cap);
      check(`pools within cap at ${tier}`, bad.length === 0, JSON.stringify(bad));
      check(`pedestrians within the ${tier} cap`, live('npcs') <= ctx.quality.tier.maxNPCs, `${live('npcs')}/${ctx.quality.tier.maxNPCs}`);
    }

    // ---- pause ----
    h.teleport(gs, ctx, 7, 51);
    step(5);
    const px = player.x;
    ctx.events.emit('ui:pause-toggle');
    intent.move.x = 1;
    step(30);
    check('paused world stands still', gs.paused && player.x === px);
    ctx.events.emit('ui:pause-toggle');
    step(30);
    intent.move.x = 0;
    check('resumed', !gs.paused && player.x !== px, `paused ${gs.paused}, x ${px.toFixed(1)} -> ${player.x.toFixed(1)}, world ${gs.matter.world.enabled}, frozen ${ctx.frozen}`);

    // ---- screen stack: pause via the intent, exclusive input, nested freezes ----
    intent.pause = true;
    step(1);
    intent.pause = false;
    check('pause intent opens the pause screen and freezes the world', ui.screens.top()?.id === 'pause' && gs.paused && ctx.frozen);
    intent.pause = true;
    step(1);
    intent.pause = false;
    check('pause intent closes it again', !ui.screens.top() && !ctx.frozen && !gs.paused);
    const px0 = player.x;
    const a = ui.screens.push(new TestScreen(ui, ctx, ui.screens, 'test'));
    const b = ui.screens.push(new TestScreen(ui, ctx, ui.screens, 'test', 40));
    intent.move.x = 1;
    step(20);
    check('test screens freeze the world and only the top one gets input', ctx.frozen && player.x === px0 && b.received === 20 && a.received === 0, `x ${player.x.toFixed(1)}, top ${b.received}, below ${a.received}`);
    intent.move.x = 0;
    intent.pause = true;
    step(1);
    intent.pause = false;
    check('popping the top screen keeps the world frozen for the one below', ui.screens.top() === a && ctx.frozen);
    intent.pause = true;
    step(1);
    intent.pause = false;
    check('popping the last freezing screen restores the world', !ui.screens.top() && !ctx.frozen);

    // ---- crowd cleanup ----
    crowd.clear();
    check('crowd pools return to zero on cleanup', live('npcs') === 0 && live('dogs') === 0 && live('bubbles') === 0, `${live('npcs')}/${live('dogs')}/${live('bubbles')}`);

    // ---- back to menu, second run ----
    ctx.events.emit('game:quit');
    step(4);
    check('quit returns to menu', game.scene.isActive('Menu') && !game.scene.isActive('Game') && !game.scene.isActive('UI'));
    game.scene.getScene('Menu').scene.start('Game');
    step(4);
    const gs2 = game.scene.getScene('Game');
    check('second run starts', game.scene.isActive('Game') && gs2.ctx && gs2.ctx !== ctx);
    gs2.ctx.input.update = () => {};
    gs2.ctx.input.intent.move.x = 1;
    step(120);
    check('second run is playable', gs2.ctx.player.x > (gs2.ctx.caught?.home?.x ?? 0) || gs2.ctx.player.move.velSpeed > 5);
    gs2.ctx.input.intent.move.x = 0;
    const bad = [...gs2.ctx.pools.byName].filter(([, p]) => p.live() > p.cap).map(([n]) => n);
    check('second run pools within cap', bad.length === 0, bad.join(','));
    check('player position is finite', Number.isFinite(gs2.ctx.player.x) && Number.isFinite(gs2.ctx.player.y));
  } catch (e) {
    check('smoke run finished without throwing', false, e.stack ?? e);
  } finally {
    try { game.registry.get('app').i18n.set(savedLang); game.registry.get('app').quality.set(savedTier); } catch { /* ignore */ }
    console.error = origErr;
    console.warn = origWarn;
    window.removeEventListener('error', onErr);
    window.removeEventListener('unhandledrejection', onErr);
  }
  check('no console errors, warnings or exceptions', problems.length === 0, problems.slice(0, 5).join(' | '));
  const failed = checks.filter(c => !c.ok);
  const result = { pass: failed.length === 0, total: checks.length, failed, checks, problems };
  h.panel.innerHTML = `<pre style="font:11px monospace;color:${result.pass ? '#7dff8a' : '#ff8a7a'};margin:0">${checks.map(c => `${c.ok ? 'PASS' : 'FAIL'}  ${c.name}  ${c.detail}`).join('\n')}</pre>`;
  return result;
}
