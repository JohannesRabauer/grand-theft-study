// Smoke scenarios: coop. Each export is { name, run(game, assert, env) }; registered in scripts/smoke/index.js.

const memoryStorage = () => {
  const m = new Map();
  return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
};

// Quits to the menu and starts a game through the real menu path (SCHULWEG_GAME.menuNav: Play, New game in the slot, mode, one
// pick per player), exactly the steps of the buttons. The slots live in memory for the rest of the run, so a smoke run never
// overwrites a real save. Returns the new game's scenes and ctx; its input is driven by hand.
function menuStart(game, env, { coop, characters, slot = 1 }) {
  const app = game.registry.get('app');
  if (!app.saves.storage.isSmoke) app.saves.storage = Object.assign(memoryStorage(), { isSmoke: true });
  const old = game.scene.getScene('Game')?.ctx;
  if (old) { old.events.emit('game:quit'); env.step(4); }
  const nav = game.menuNav;
  nav.play();
  nav.newGame(slot);
  nav.mode(coop ? 'coop' : 'solo');
  for (const id of characters) nav.pick(id);
  env.step(4);
  return bootGame(game);
}

// Continue in `slot` from the menu (Play -> Continue).
function menuContinue(game, env, slot = 1) {
  game.scene.getScene('Game').ctx.events.emit('game:quit');
  env.step(4);
  game.menuNav.play();
  game.menuNav.continueSlot(slot);
  env.step(4);
  return bootGame(game);
}

function bootGame(game) {
  const gs = game.scene.getScene('Game');
  gs.ctx.input.update = () => {};
  // These scenarios cover the street and start vehicles; the home scenario covers morning preparation.
  if (gs.ctx.world.id === 'home') gs.ctx.world.load('town', 'from-home');
  return { gs, ui: game.scene.getScene('UI'), ctx: gs.ctx };
}

const startCoop = (game, env) => menuStart(game, env, { coop: true, characters: ['lorenz', 'helena'] });

// CAP-23: the menu flow (mode, one character select per player), the stored mode and characters, Continue, the pause menu
// line, the solo path, and the pad join and disconnect handling.
export const coopMenu = {
  name: 'coopMenu',
  run(game, assert, env) {
    const { step } = env;
    const app = game.registry.get('app');
    const t = app.t;
    const nav = () => game.menuNav.state();
    const menuTexts = () => game.scene.getScene('Menu').children.list.filter(o => o.text !== undefined).map(o => o.text);
    const pad = (a = false) => ({ buttons: Array.from({ length: 16 }, (_, i) => ({ pressed: i === 0 && a })), leftStick: { x: 0, y: 0 } });
    app.saves.storage = Object.assign(memoryStorage(), { isSmoke: true });

    // ---- the flow screen by screen
    game.scene.getScene('Game').ctx.events.emit('game:quit');
    step(4);
    game.menuNav.play();
    game.menuNav.newGame(2);
    step(2);
    assert('New game opens the mode screen with Solo, Co-op and the control hint', nav().screen === 'mode' && menuTexts().includes(t('menu.mode.solo')) && menuTexts().includes(t('menu.mode.coop')) && menuTexts().includes(t('menu.mode.controls')), JSON.stringify(nav()));
    game.menuNav.mode('coop');
    step(2);
    assert('Co-op leads to the select for player 1, then player 2', nav().screen === 'character' && nav().picker === 0 && menuTexts().includes(t('menu.character.titleP1')));
    game.menuNav.pick('kilian');
    step(2);
    assert('player 2 picks next, in its own select', nav().picker === 1 && menuTexts().includes(t('menu.character.titleP2')) && nav().picks[0] === 'kilian');
    game.menuNav.pick('kilian'); // the same kid twice is allowed
    step(4);
    const same = bootGame(game).ctx;
    assert('both may pick the same character', same.players.length === 2 && same.players.every(p => p.character.id === 'kilian'));
    assert('co-op with two characters starts from the menu and is saved in slot 2', same.state.shared.flags.coop === true && app.saves.list()[1].players.map(p => p.character).join() === 'kilian,kilian');

    // ---- two different kids: per-player start vehicles (Kilian on his skateboard, Helena on her bike)
    const { gs, ui, ctx } = menuStart(game, env, { coop: true, characters: ['kilian', 'helena'], slot: 1 });
    const [p1, p2] = ctx.players;
    assert('P1 Kilian starts on his skateboard, P2 Helena on her bike', p1.character.id === 'kilian' && p2.character.id === 'helena' && p1.vehicle === 'skateboard' && gs.skateboards.isMounted(0) && !gs.bikes.isMounted(0) && gs.bikes.isMounted(1) && p1.sprite.texture.key === 'player-kilian-skate' && p2.sprite.texture.key === 'player-helena-bike', `${p1.sprite.texture.key} ${p2.sprite.texture.key}`);
    assert('the HUD shows one slice per player', ui.hud.has('status.1') && !ui.hud.has('status'));

    // ---- the pause menu shows the mode
    ui.togglePause();
    step(2);
    const line = ctx.screens.top().mode.text;
    assert('the pause menu names the mode and both characters', line === t('pause.mode.coop', { who: 'Kilian + Helena' }), line);
    ui.togglePause();
    step(2);

    // ---- growth of the second player, save, Continue restores the mode and both characters
    ctx.state.dispatch('attr.grow', { player: 1, attr: 'tempo', amount: 0.5, reason: 'smoke' });
    const tempo = ctx.state.players[1].attributes.tempo;
    app.saves.save(1);
    const again = menuContinue(game, env, 1);
    const [q1, q2] = again.ctx.players;
    assert('Continue restores co-op with both characters', again.ctx.players.length === 2 && again.ctx.state.shared.flags.coop === true && q1.character.id === 'kilian' && q2.character.id === 'helena');
    assert('Continue keeps player 2 progress and start vehicles', again.ctx.state.players[1].attributes.tempo === tempo && again.gs.bikes.isMounted(1));

    // ---- a pad that drives a player drops out: toast, the player stays, the keyboard bindings take over
    const toast = again.ui.hud.get('toast');
    const log = [];
    again.ctx.events.on('pad:disconnected', e => log.push(e));
    const input = again.ctx.input;
    again.gs.input.gamepad.emit('disconnected', { index: 0 }); // with two players the first pad is P2's
    step(2);
    assert('the disconnect names player 2 and shows a toast', log.length === 1 && log[0].player === 1 && toast.text.visible && toast.text.text === t('toast.padLost'), `${log.length} ${toast.text.text}`);
    assert('player 2 is still in the game', again.ctx.players.length === 2 && again.ctx.players[1].alive !== false);
    again.gs.input.gamepad.emit('disconnected', { index: 5 }); // a pad that drives nobody
    assert('a pad nobody uses raises no event', log.length === 1);
    const realUpdate = Object.getPrototypeOf(input).update;
    input.src.down.add('ArrowRight');
    realUpdate.call(input);
    const steered = input.intents[1].move.x > 0 && input.intents[0].move.x === 0;
    input.src.down.clear();
    realUpdate.call(input);
    assert('without a pad player 2 steers with the arrow keys', steered);
    step(200);
    assert('the toast fades again', !toast.text.visible);

    // ---- press A to join: a pad is connected, A on the mode screen picks co-op
    const gp = game.scene.getScene('Menu').input.gamepad;
    again.ctx.events.emit('game:quit');
    step(4);
    gp.gamepads[0] = pad();
    game.menuNav.play();
    game.menuNav.newGame(3);
    step(2);
    assert('a connected pad shows the join hint on the mode screen', menuTexts().includes(t('menu.mode.padJoin')));
    gp.gamepads[0] = pad(true);
    step(2);
    assert('A on the pad joins: co-op is chosen', nav().screen === 'character' && nav().coop === true, JSON.stringify(nav()));
    gp.gamepads.length = 0;

    // ---- the solo path is unchanged: one player, no co-op flag, single HUD slice
    const solo = menuStart(game, env, { coop: false, characters: ['lorenz'], slot: 1 });
    assert('solo from the menu: one player, co-op off, the single-player HUD', solo.ctx.players.length === 1 && !solo.ctx.state.shared.flags.coop && solo.ctx.state.players.length === 1 && solo.ui.hud.has('status') && !solo.ctx.coop.active);
    assert('a solo save restores solo', menuContinue(game, env, 1).ctx.players.length === 1);
  }
};

// AD-18: a real two-player start (coop flag), the tether and the camera rig on the commute route.
export const coopCommute = {
  name: 'coopCommute',
  run(game, assert, env) {
    const { h, step } = env;
    // ---- start a co-op run from the menu: Lorenz (his skates) and Helena (her bike) ----
    const { gs, ui, ctx } = startCoop(game, env);
    const [p1, p2] = ctx.players;
    const cam = gs.cameras.main;
    const scale = ctx.res.scale;
    assert('the coop flag starts two players with their own characters and intents', ctx.players.length === 2 && p1.character.id === 'lorenz' && p2.character.id === 'helena' && ctx.input.intents[0] !== ctx.input.intents[1] && ctx.state.shared.flags.coop === true);
    assert('each starts with its own vehicle: P1 on skates, P2 on the bike', p1.vehicle === 'skates' && p2.vehicle === 'bike' && gs.skates.isMounted(0) && gs.bikes.isMounted(1) && !gs.bikes.isMounted(0));
    const entry = ctx.map.objects.find(o => o.id === 'from-home');
    const sx = (entry.x + 0.5) * ctx.map.tileSize;
    assert('leaving home puts both children at the street entry together', Math.abs(p1.x - sx) < 1 && Math.abs(p2.x - sx) < 1 && Math.abs(p1.y - p2.y) < 1);
    assert('ctx.coop is active and the HUD has two status slices, one shared money line and one arrow', ctx.coop.active && ctx.coop.distance < 40 && ui.hud.has('status.0') && ui.hud.has('status.1') && ui.hud.has('tool.1') && ui.hud.has('money') && ui.hud.has('objective') && !ui.hud.has('objective.0'));
    assert('P2 sits on the right, P1 on the left', ui.hud.get('status.0').stamina.x < 100 && ui.hud.get('status.1').stamina.x > 380);
    assert('rings mark both players', gs.markers.rings.length === 2 && gs.markers.rings.every(r => r.visible));
    step(60);
    assert('the camera is centred between them at the base zoom', Math.abs(gs.focus.x - (p1.x + p2.x) / 2) < 1e-6 && Math.abs(cam.zoom - gs.zoomCfg.max * scale) < 1e-6, `zoom ${cam.zoom}`);

    // ---- both ride/walk the commute route; the tether holds them together and the camera keeps both in view ----
    const r1 = h.makeRouteRunner(ctx, 16, 9, 0);
    const r2 = h.makeRouteRunner(ctx, 16, 9, 1);
    const i1 = ctx.input.intents[0];
    const i2 = ctx.input.intents[1];
    i1.sprint = i2.sprint = true;
    p1.move.speedMult = 0.8; // a clearly slower kid, so the tether has someone to hold back whatever the characters' Tempo
    let maxRatio = 0;
    let outOfView = 0;
    let minZoom = Infinity;
    let slowed = false;
    let frames = 0;
    // each follows the route and, once its last waypoint is reached, walks straight into the school goal
    const goal = ctx.map.objects.find(o => o.type === 'goal');
    const gx = (goal.x + goal.w / 2) * ctx.map.tileSize;
    const gy = (goal.y + goal.h / 2) * ctx.map.tileSize;
    const runners = [r1, r2];
    const finishing = [false, false];
    const steer = (i) => {
      const p = ctx.players[i];
      if (!finishing[i]) { runners[i](); finishing[i] = runners[i].done; return; }
      const dx = gx - p.x;
      const dy = gy - p.y;
      const l = Math.hypot(dx, dy) || 1;
      ctx.input.intents[i].move.x = dx / l;
      ctx.input.intents[i].move.y = dy / l;
    };
    for (; frames < 6000 && !(gs.zones.reached[0] && gs.zones.reached[1]); frames++) {
      steer(0);
      steer(1);
      step(1);
      maxRatio = Math.max(maxRatio, ctx.coop.tetherRatio);
      minZoom = Math.min(minZoom, cam.zoom / scale);
      slowed = slowed || p1.move.tetherMult < 0.97 || p2.move.tetherMult < 0.97;
      const v = cam.worldView;
      for (const p of ctx.players) if (p.x < v.x || p.x > v.right || p.y < v.y || p.y > v.bottom) outOfView++;
    }
    i1.sprint = i2.sprint = false;
    i1.move.x = i1.move.y = i2.move.x = i2.move.y = 0;
    assert('both reached the school', gs.zones.reached[0] === 1 && gs.zones.reached[1] === 1, `${frames} frames, reached ${gs.zones.reached[0]}/${gs.zones.reached[1]}, P1 ${p1.x.toFixed(0)},${p1.y.toFixed(0)} ${p1.vehicle}, P2 ${p2.x.toFixed(0)},${p2.y.toFixed(0)} ${p2.vehicle}, ratio ${ctx.coop.tetherRatio.toFixed(2)} mult ${p1.move.tetherMult.toFixed(2)}/${p2.move.tetherMult.toFixed(2)}`);
    assert('the tether kept them together (never far past the limit)', maxRatio < 1.1 && maxRatio > gs.zoomCfg.tether.soft, `max ratio ${maxRatio.toFixed(2)}`);
    assert('the tether slowed the faster one down on the way', slowed);
    assert('both stayed in view on every frame', outOfView === 0, `${outOfView} player-frames outside`);
    assert('the camera zoomed out to keep them in view', minZoom < gs.zoomCfg.max - 0.02 && minZoom >= gs.zoomCfg.min - 1e-6, `min zoom ${minZoom.toFixed(3)}`);

    // ---- one player held (caught frame, screen): the other may go on, the tether pulls gently ----
    step(60);
    p2.pinned = true;
    const startY = p1.y;
    i1.move.x = 0;
    i1.move.y = 1;
    let worst = 0;
    for (let n = 0; n < 600; n++) {
      step(1);
      worst = Math.max(worst, ctx.coop.tetherRatio);
    }
    i1.move.y = 0;
    assert('a pinned partner does not block: the other still moves and stays within the view limit', Math.abs(p1.y - startY) > 30 && worst < 1.3, `max ratio ${worst.toFixed(2)}`);
    p2.pinned = false;
    p2.move.tetherMult = 1;
    ctx.state.dispatch('coop.set', { on: false });
    step(2);
  }
};

// AD-18: the chase with two players. One shared level, bullies pick the nearest visible player and stick to it, each
// player is caught and respawns on its own while the other plays on, the wallet is debited once per catch, and the
// level only drops when every player is hidden (or far).
export const coopChase = {
  name: 'coopChase',
  run(game, assert, env) {
    const { step, until } = env;
    const { gs, ui, ctx } = startCoop(game, env);
    const [p1, p2] = ctx.players;
    const chase = ctx.chase;
    const log = [];
    for (const n of ['player:caught', 'player:respawn', 'chase:level']) ctx.events.on(n, e => log.push([n, e]));
    const n = (name, pred = () => true) => log.filter(e => e[0] === name && pred(e[1])).length;
    const ts = ctx.map.tileSize;
    const px = (t) => t * ts;
    const at = (p, x, y) => { gs.matter.body.setPosition(p.body, { x, y }); gs.matter.body.setVelocity(p.body, { x: 0, y: 0 }); p.move.speed = 0; p.sprite.setPosition(x, y); };
    const active = () => chase.bullies.filter(b => b.active);
    const place = (b, x, y, toward) => {
      gs.matter.body.setPosition(b.body, { x, y });
      b.sprite.setPosition(x, y);
      b.move.heading = Math.atan2(toward.y - y, toward.x - x);
      chase.fsm.enter(b, 'CHASE');
      b.alerted = false;
    };
    const money = () => ctx.state.shared.money;
    const loss = chase.cfg.caught.lossCents;
    const frames = ui.hud.get('caught');
    p1.bullyWeight = p2.bullyWeight = 1;
    step(30);
    assert('co-op run: two players, one shared level, no bullies yet', ctx.players.length === 2 && chase.level === 0 && active().length === 0);

    // ---- either player's turf raises the shared level; two players get one extra bully, within the tier cap ----
    at(p2, px(55), px(39));
    at(p1, px(49), px(39));
    step(2);
    assert('both stand in the skatepark turf: level 1', chase.level === 1 && n('chase:level', e => e.reason === 'turf') >= 1, `level ${chase.level}`);
    assert('co-op spawns one extra bully (2 at level 1), within the Medium cap', active().length === 2 && active().length <= ctx.quality.tier.maxBullies, `bullies ${active().length}`);
    assert('they spawned outside the view that holds both players', active().every(b => !chase.onScreen(b.x, b.y, 0)));

    // ---- target: the nearest visible player, and it sticks (hysteresis) ----
    const [b, extra] = active();
    chase.pool.release(extra);
    at(p1, px(49), px(39));
    at(p2, px(55), px(39));
    const midX = (p1.x + p2.x) / 2;
    place(b, midX + 12, px(39) + 40, p2); // a little nearer to P2
    step(2);
    assert('the bully targets the nearer visible player (P2)', b.target === p2 && b.sees, `target ${b.target?.index}`);
    place(b, midX - 3, px(39) + 40, p1); // now only slightly nearer to P1: hysteresis keeps P2
    step(2);
    assert('hysteresis: a barely nearer second player does not steal the target', b.target === p2, `target ${b.target?.index}`);
    place(b, p1.x + 20, px(39) + 40, p1); // clearly nearer to P1
    step(2);
    assert('a clearly nearer player becomes the target', b.target === p1, `target ${b.target?.index}`);

    // ---- P1 is caught while P2 plays on; the wallet is debited once ----
    chase.spawn('foot'); // a second chaser, near P2 and not touching it
    const c2 = active().find(x => x !== b);
    const holdC2 = () => place(c2, p2.x + 60, p2.y + 20, p2); // keeps the chaser near P2 without touching it
    holdC2();
    const m0 = money();
    const y0 = p2.y;
    const x0 = p2.x;
    place(b, p1.x + 5, p1.y, p1);
    const caught = until(() => n('player:caught') >= 1, 120);
    assert('P1 is caught by contact', caught >= 0 && n('player:caught', e => e.player === 0) === 1, `${caught} frames`);
    assert('only P1 is pinned and out of play, the world keeps running', p1.pinned && !p1.alive && !p2.pinned && p2.alive && !ctx.frozen, `frozen ${ctx.frozen}`);
    assert('the shared wallet lost exactly one fine, once', money() === m0 - loss, `money ${m0} -> ${money()}`);
    assert('the caught frame shows on the left half for P1 only', frames.frames[0].items[0].visible && frames.frames[0].box.x === 0 && frames.frames[0].box.scaleX < 1 && !frames.frames[1]?.items[0]?.visible);
    assert('the catching bully gives up', b.state === 'GIVE_UP');
    ctx.input.intents[1].move.x = -1; // P2 rides off on the bike, away from its chaser
    until(() => false, 40, holdC2);
    ctx.input.intents[1].move.x = 0;
    assert('P2 keeps moving while P1 stands still', Math.hypot(p2.x - x0, p2.y - y0) > 10 && Math.abs(p1.x - px(49)) < 30, `P2 moved ${Math.hypot(p2.x - x0, p2.y - y0).toFixed(0)}`);
    assert('the other bully keeps the chase on: level stays', chase.level >= 1 && c2.active && c2.state !== 'GIVE_UP', `level ${chase.level} ${c2.state}`);
    assert('no second debit while P1 stands caught', money() === m0 - loss);
    const home = gs.caught.home;
    const off = gs.zoomCfg.coop.spawnOffsets[0];
    const back = until(() => n('player:respawn', e => e.player === 0) >= 1, 400, holdC2);
    const far = Math.hypot(p2.x - (home.x + off[0]), p2.y - (home.y + off[1])) > gs.zoomCfg.tether.maxDistance * 0.6;
    assert('home is far from P2, so P1 comes back right next to P2 (the shared camera and tether cannot get stuck), alive and free', back >= 0 && far && Math.hypot(p1.x - p2.x, p1.y - p2.y) < 40 && p1.alive && !p1.pinned && !gs.bikes.isMounted(0) && n('player:respawn', e => e.player === 0 && e.rejoined) === 1, `${back} frames, apart ${Math.hypot(p1.x - p2.x, p1.y - p2.y).toFixed(0)}px`);
    assert('the view fits both players after the rejoin: their distance is inside the tether', Math.hypot(p1.x - p2.x, p1.y - p2.y) < gs.zoomCfg.tether.maxDistance * 0.3);
    assert('P1 frame is hidden again, P2 never lost control', !frames.frames[0].items[0].visible && !p2.pinned && p2.alive);

    // ---- P2 is caught as the last chaser: level resets (nobody chases any more) ----
    at(p1, px(49), px(39));
    at(p2, px(55), px(39));
    place(c2, p2.x + 5, p2.y, p2);
    const m1 = money();
    until(() => n('player:caught') >= 2, 120);
    assert('P2 is caught on its own: pinned, debited once more', p2.pinned && !p2.alive && !p1.pinned && money() === m1 - loss, `money ${m1} -> ${money()}`);
    assert('no bully chases any more: the shared level resets', chase.level === 0 && n('chase:level', e => e.level === 0 && e.reason === 'caught') >= 1, `level ${chase.level}`);
    assert('P2 frame sits on the right half', frames.frames[1].items[0].visible && frames.frames[1].box.x >= 240);

    // ---- both caught: the world freezes; the first respawn lets the world run again ----
    chase.lvl.lockout = 0;
    chase.lvl.set(1, 'smoke');
    const c3 = active()[0];
    place(c3, p1.x + 5, p1.y, p1);
    until(() => n('player:caught') >= 3, 120);
    assert('everyone caught: the world stands still', p1.pinned && p2.pinned && ctx.frozen);
    until(() => n('player:respawn') >= 2, 400);
    assert('the first respawn unfreezes the world while the other stays pinned', !ctx.frozen && p1.pinned !== p2.pinned, `pinned ${p1.pinned}/${p2.pinned}`);
    until(() => n('player:respawn') >= 3, 400);
    assert('both are back and free', !p1.pinned && !p2.pinned && p1.alive && p2.alive && !ctx.frozen);

    // ---- hiding: one hidden, the other seen keeps the level; both hidden drops it ----
    step(10);
    chase.lvl.lockout = 0;
    chase.cfg.bully.catchRadius = -1; // the chaser stays near without ending the run
    chase.lvl.set(1, 'smoke');
    for (const x of active().slice(1)) chase.pool.release(x);
    const hb = active()[0];
    const dumpster = ctx.map.objects.find(o => o.id === 'dumpster-skate');
    const hedge = ctx.map.objects.find(o => o.id === 'hedge-east');
    const mid = (z) => [px(z.x + z.w / 2), px(z.y + z.h / 2)];
    at(p2, px(55), px(39));
    at(p1, ...mid(dumpster));
    const hold = () => place(hb, p2.x + 40, p2.y + 10, p2);
    hold();
    const t0 = until(() => chase.escapes[0].done === 'hidden', 600, hold);
    assert('P1 hides while P2 stays in sight: P1 is safe, the chase goes on', t0 >= 0 && chase.hiddenFor(p1) && !chase.hiddenFor(p2) && chase.level >= 1 && chase.escapes[1].done === null, `${t0} frames, level ${chase.level}`);
    step(60);
    assert('the level holds while one player is still exposed', chase.level >= 1 && !chase.hidden);
    at(p2, ...mid(hedge));
    const t1 = until(() => chase.level === 0, 900);
    assert('both hidden: the shared level drops', t1 >= 0 && chase.level === 0, `${t1} frames, level ${chase.level}`);
    chase.cfg.bully.catchRadius = 9;
    until(() => active().length === 0, 1500);
    // ---- sibling near home: the caught player still goes home, beside the spawn point ----
    chase.cfg.bully.catchRadius = -1;
    until(() => active().length === 0, 1500);
    step(5);
    at(p2, home.x + 40, home.y);
    const r0 = n('player:respawn', e => e.player === 0 && !e.rejoined);
    ctx.events.emit('bully:caught-contact', { player: 0 });
    step(1);
    gs.caught.respawn(0);
    assert('with P2 near home, P1 respawns at the spawn point as before', Math.hypot(p1.x - (home.x + off[0]), p1.y - (home.y + off[1])) < 24 && n('player:respawn', e => e.player === 0 && !e.rejoined) === r0 + 1, `at ${p1.x.toFixed(0)},${p1.y.toFixed(0)}`);
    chase.cfg.bully.catchRadius = 9;
    ctx.state.dispatch('coop.set', { on: false });
    step(2);
  }
};
