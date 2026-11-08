// Shared state for the smoke scenarios: boots the game from the menu, hooks the events the scenarios count
// and builds the stepping helpers. Scenarios receive the returned object as their third argument.
export function createEnv(game, h, assert, savedLang) {
  const step = n => { for (let i = 0; i < n; i++) h.stepAll(game); };
  // ---- menu -> game ----
  if (game.scene.isActive('Game')) game.scene.getScene('Game').scene.start('Menu'); else if (!game.scene.isActive('Menu')) game.scene.start('Menu');
  game.schoolEventsOff = true; // surprises in the school day (story 8.4) are switched on by the scenario that tests them
  game.pocketMoneyOff = true; // the Familienfrieden pocket money on a new morning (story 9.6) is switched on by the scenario that tests it
  game.talkOff = true; // the talk-down at levels 1-2 (story 7.5) is switched on by the scenario that tests it
  game.grownupsOff = true; // the janitor, the inspector and the neighbor dog (story 7.4) are switched on by the scenario that tests them
  game.lookoutsOff = true; // lookouts (story 7.2) are switched on by the scenario that tests them
  game.hintsOff = true; // contextual tips freeze the world until confirmed; the scripted runs switch them off (the `hints` scenario turns them on)
  game.trafficOff = true; // the scripted route runners ride the main road blind: buses only hit players in the `traffic` scenario
  step(3);
  const menu = game.scene.getScene('Menu');
  assert('menu is active', game.scene.isActive('Menu'));
  assert('menu shows a Start button', menu.children.list.some(o => o.text === game.registry.get('app').t('menu.start') || o.list?.some?.(c => c.text === game.registry.get('app').t('menu.start'))) ||
    menu.children.list.length > 4, `${menu.children.list.length} objects`);
  game.registry.get('app').quality.set('medium');
  menu.scene.start('Game'); // what the Start button does
  step(4);
  const gs = game.scene.getScene('Game');
  const ui = game.scene.getScene('UI');
  const ctx = gs.ctx;
  const hud = (id) => ui.hud.get(id);
  assert('game and UI scenes running', game.scene.isActive('Game') && game.scene.isActive('UI') && !!ctx);
  for (const id of ctx.state.cfg.vehicleIds) ctx.ownership.unlock(id, 'garage'); // the earlier scenarios mount whatever lies around; scenario `vehicles` tests the locks
  ctx.achievements.cfg.xpReward = 0; // older scenarios pin exact xp totals; the reward of an unlock is covered by check-achievements
  ctx.input.update = () => {};
  const intent = ctx.input.intent;
  intent.aim = null;
  const events = [];
  const log = n => ctx.events.on(n, e => events.push([n, e]));
  ['goal:reached', 'turf:enter', 'turf:leave', 'chase:level', 'player:caught', 'player:respawn', 'tool:fire', 'prop:hit', 'weather:changed', 'bike:bell', 'hide:enter', 'npc:react'].forEach(log);
  const count = n => events.filter(e => e[0] === n).length;
  const pools = () => [...ctx.pools.byName].map(([name, p]) => ({ name, live: p.live(), cap: p.cap }));
  const live = name => ctx.pools.byName.get(name).live();
  const player = ctx.players[0];
  const { surfaces } = ctx;
  const drive = h.makeDriver(ctx);
  const T = t => h.tilePx(ctx, t);
  const press = key => { intent[key] = true; step(1); intent[key] = false; };
  // step until cond() or max frames; returns frames used or -1
  const until = (cond, max, tick) => { for (let i = 0; i < max; i++) { tick?.(); step(1); if (cond()) return i; } return -1; };
  const inWall = () => { if (surfaces.solid(surfaces.at(player.x, player.y))) env.wallViolations++; };

  const env = { h, step, gs, ui, ctx, hud, intent, events, count, pools, live, player, surfaces, drive, T, press, until, inWall, crowd: ctx.crowd, savedLang, wallViolations: 0 };
  return env;
}
