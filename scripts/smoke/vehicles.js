// Smoke scenario: vehicle ownership, bike racks, borrowing and rescue (story 5.5, CAP-16, AD-22, AD-23). Registered in
// scripts/smoke/index.js. The earlier scenarios mount whatever lies around, so scripts/smoke/env.js unlocks all vehicles; this one
// takes them away again and walks every unlock path: a refused mount with its toast and the padlocks over the lying items,
// shop purchase, race win, the garage find, then bike racks (locked bike, safe from theft), an unlocked bike borrowed with
// accelerated timers (the thief walks to it, rides it to a hideout, phone toast, mission trigger, objective arrow, a guard
// raises Aerger), a scared-off thief, the rescue, and ownership in a save and in a map reload.
export const vehicles = {
  name: 'vehicles',
  run(game, assert, env) {
    const { step, until } = env;
    // a fresh single-player run: earlier scenarios may have left co-op or a restarted scene behind
    const prev = game.scene.getScene('Game');
    prev.ctx.state.dispatch('coop.set', { on: false });
    prev.scene.restart();
    step(4);
    const gs = game.scene.getScene('Game');
    const ui = game.scene.getScene('UI');
    const ctx = gs.ctx;
    ctx.input.update = () => {};
    ctx.input.intent.aim = null;
    const player = ctx.players[0];
    const intent = ctx.input.intent;
    const press = key => { intent[key] = true; step(1); intent[key] = false; };
    const T = t => (t + 0.5) * ctx.map.tileSize;
    const theft = gs.theft;
    const parking = gs.parking;
    const cfg = theft.cfg;
    const keep = { ...cfg };
    const log = [];
    for (const n of ['ui:toast', 'vehicle:refused', 'vehicle:unlocked', 'garage:found', 'bike:parked', 'bike:mounted', 'bike:stolen', 'bike:recovered', 'bike:theft-foiled', 'mission:trigger', 'bully:bump', 'state:rejected']) ctx.events.on(n, e => log.push([n, e]));
    const of = n => log.filter(e => e[0] === n).map(e => e[1]);
    const toast = () => of('ui:toast').at(-1)?.key;
    const sparks = { n: 0 };
    const emit = ctx.particles.emit;
    ctx.particles.emit = function (name, ...a) { if (name === 'spark') sparks.n++; return emit.call(this, name, ...a); };
    const setOwned = list => ctx.state.replace({ ...ctx.state.data, shared: { ...ctx.state.data.shared, ownedVehicles: list } });
    const owned = () => [...ctx.state.shared.ownedVehicles].sort().join();
    const services = [gs.bikes, gs.skateboards, gs.skates];
    const onFoot = () => { for (const s of services) if (s.isMounted(0)) s.dismount(player); step(2); };
    const at = (tx, ty) => { player.teleport(T(tx), T(ty)); gs.snapCamera(); ctx.chase.reset(); step(3); };
    const lying = id => ctx.map.objects.find(o => o.id === id);
    const visiblePads = () => parking.padlocks.filter(p => p.visible);
    const lockedItems = () => services.filter(s => !ctx.ownership.owns(s.id)).reduce((n, s) => n + s.parked.filter(b => b.visible).length, 0); // what should wear a padlock

    onFoot();
    ctx.chase.reset();
    ctx.state.dispatch('flags.set', { key: 'stolenBike', value: null });
    ctx.state.dispatch('flags.set', { key: 'garageFound', value: false });

    // ---- nothing owned: lying vehicles are display pieces with a padlock
    setOwned(['foot']);
    step(2);
    const items = services.flatMap(s => s.parked).filter(b => b.visible);
    assert('with nothing owned every lying vehicle has a padlock above it', items.length >= 6 && visiblePads().length === items.length && items.every(b => visiblePads().some(p => Math.abs(p.x - b.x) < 1 && p.y < b.y)), `${visiblePads().length}/${items.length}`);
    const board = lying('board1');
    at(board.x, board.y);
    const n0 = log.length;
    press('interact');
    assert('mounting a skateboard that is not owned is refused with the friendly toast', player.vehicle === 'foot' && of('vehicle:refused').at(-1)?.id === 'skateboard' && toast() === 'vehicle.locked' && ctx.t('vehicle.locked') === 'Das gehört dir noch nicht – im Laden oder bei Rennen freischalten!', `${player.vehicle} ${toast()}`);
    assert('the refused press does not mount something else nearby, the board stays lying', log.slice(n0).every(e => e[0] !== 'bike:mounted') && gs.skateboards.parked.some(b => b.visible && Math.abs(b.x - T(board.x)) < 1));
    const bike = lying('bike1');
    at(bike.x, bike.y);
    press('interact');
    assert('same for a bike and for skates', player.vehicle === 'foot' && of('vehicle:refused').at(-1)?.id === 'bike' && gs.bikes.parked.some(b => b.visible));
    ctx.ownership.unlock('skates', 'start');
    at(lying('skates1').x, lying('skates1').y);
    press('interact');
    assert('an owned vehicle mounts (no padlock over the skates, the others keep theirs)', player.vehicle === 'skates' && visiblePads().length === lockedItems() && lockedItems() < items.length, `${player.vehicle} pads ${visiblePads().length} of ${lockedItems()}`);
    onFoot();

    // ---- shop purchase
    ctx.state.dispatch('wallet.spend', { cents: ctx.state.shared.money, reason: 'test' });
    assert('without money the board cannot be bought', !ctx.state.dispatch('shop.buyVehicle', { id: 'skateboard' }) && of('state:rejected').at(-1)?.reason === 'insufficient-funds' && owned() === 'foot,skates');
    ctx.state.dispatch('wallet.earn', { cents: 5000, reason: 'test' });
    assert('buying the skateboard costs 45 euro and unlocks it, with an announcement', ctx.state.dispatch('shop.buyVehicle', { id: 'skateboard' }) && ctx.state.shared.money === 500 && owned() === 'foot,skateboard,skates' && of('vehicle:unlocked').at(-1)?.reason === 'bought' && toast() === 'vehicle.unlocked');
    at(board.x, board.y);
    press('interact');
    assert('the bought board mounts and its padlocks are gone', player.vehicle === 'skateboard' && visiblePads().length === lockedItems() && lockedItems() < items.length - 2, `${visiblePads().length} of ${lockedItems()}`);
    onFoot();

    // ---- race win hook
    setOwned(['foot', 'skateboard', 'skates']);
    ctx.events.emit('race:won', { vehicle: 'bike' });
    assert('race:won unlocks the prize vehicle (reason race)', owned() === 'bike,foot,skateboard,skates' && of('vehicle:unlocked').at(-1)?.reason === 'race');

    // ---- garage find
    setOwned(['foot']);
    const garage = lying('home-garage');
    at(garage.x + 1, garage.y + 1);
    const g = gs.garage.garages[0];
    assert('the garage door stands near home, closed', !!g && g.sprite.texture.key === 'garage-closed' && !ctx.state.shared.flags.garageFound);
    const sparks0 = sparks.n;
    press('interact');
    assert('the first interact opens it: skateboard unlocked (reason garage), flag set, discovery toast, sparkle, door open',
      owned() === 'foot,skateboard' && of('garage:found').at(-1)?.vehicle === 'skateboard' && ctx.state.shared.flags.garageFound === true && toast() === 'garage.found' && sparks.n > sparks0 && g.sprite.texture.key === 'garage-open' && of('vehicle:unlocked').at(-1)?.reason === 'garage', `${owned()} ${toast()}`);
    press('interact');
    assert('a second visit finds nothing new', toast() === 'garage.empty' && owned() === 'foot,skateboard' && of('garage:found').length === 1);

    // ---- racks: a locked bike
    setOwned(['foot', 'bike']);
    onFoot();
    const rack = lying('home-bike-rack');
    at(bike.x, bike.y);
    press('interact');
    assert('the owned bike mounts', player.vehicle === 'bike' && gs.bikes.isMounted(0));
    const ridden = gs.bikes.riders[0].mounted;
    at(rack.x, rack.y + 1);
    press('interact');
    assert('letting go within the rack radius chains it: locked, closed lock and chain visible, toast, safe from theft',
      ridden.parkState === 'locked' && ridden.icon.visible && ridden.icon.texture.key === 'lock-closed' && ridden.chain.visible && of('bike:parked').at(-1)?.locked === true && of('bike:parked').at(-1)?.rack === 'home-bike-rack' && toast() === 'bike.locked');

    // accelerate every timer: the dice always say yes and a spawn is a motive
    const accelerate = () => { cfg.awaySeconds = 0.5; cfg.chance = 1; cfg.checkInterval = 0.2; cfg.cooldownSeconds = 1; theft.rng = () => 0; };
    accelerate();
    at(3, 58);
    step(60 * 6);
    assert('a locked bike is never borrowed, however long it stays', !theft.active && of('bike:stolen').length === 0 && ridden.visible && ridden.parkState === 'locked' && ridden.awayT === 0);
    at(rack.x, rack.y + 1);
    press('interact');
    assert('mounting it again takes the lock off', player.vehicle === 'bike' && ridden.parkState === undefined && !ridden.icon.visible && !ridden.chain.visible && of('bike:mounted').length >= 2);

    // ---- an unlocked bike gets borrowed
    at(36, 44);
    press('interact');
    assert('a bike let go of away from every rack stays unlocked and shows the open lock', ridden.parkState === 'unlocked' && ridden.icon.texture.key === 'lock-open' && !ridden.chain.visible && of('bike:parked').at(-1)?.locked === false);
    const bikeId = ridden.bikeId;
    at(3, 58);
    step(30);
    assert('the player is out of view and far from the bike (the conditions of a borrow)', Math.hypot(player.x - ridden.x, player.y - ridden.y) > cfg.awayDistance && !ctx.chase.onScreen(ridden.x, ridden.y, cfg.viewMargin));
    const frames = until(() => of('bike:stolen').length > 0, 60 * 40);
    assert('after the (accelerated) timers a thief takes it', frames >= 0 && of('bike:stolen').length === 1, `${frames} frames`);
    const stolen = of('bike:stolen')[0];
    assert('bike:stolen names the owner, the bike and the nearest hideout', stolen.player === 0 && stolen.bikeId === bikeId && ['hideout-underpass', 'hideout-park-back'].includes(stolen.hideoutId), JSON.stringify(stolen));
    assert('the bike left its place and the phone toast says so', !ridden.visible && !gs.bikes.nearest({ x: ridden.x, y: ridden.y }).bike && of('ui:toast').some(t => t.key === 'bike.stolen' && t.style === 'phone') && ctx.t('bike.stolen') === 'Dein Fahrrad wurde geborgt!');
    assert('the rescue trigger fires and the fallback flag marks the hideout', of('mission:trigger').at(-1)?.id === 'stolen-bike' && ctx.state.shared.flags.stolenBike?.hideout === stolen.hideoutId && ctx.state.shared.flags.stolenBike?.bikeId === bikeId);
    const arrow = ui.hud.get('objective').arrow;
    const hideout = lying(stolen.hideoutId);
    assert('the objective arrow points at the hideout', arrow.bike === true && Math.abs(arrow.gx - T(hideout.x)) < 1 && Math.abs(arrow.gy - T(hideout.y)) < 1 && arrow.arrow.visible);
    assert('no second theft while a bike is out', (() => { cfg.cooldownSeconds = 0; step(60); return of('bike:stolen').length === 1; })());
    until(() => !theft.active, 60 * 30);
    assert('the thief rides it to the hideout and leaves it standing there', !theft.active && theft.stolen === ridden && ridden.visible && Math.hypot(ridden.x - T(hideout.x), ridden.y - T(hideout.y)) < 1);

    // ---- rescue: a guard shows up, the bike is fetched back
    const bump0 = of('bully:bump').length;
    at(hideout.x - 1, hideout.y);
    step(5);
    assert('near the hideout a guard raises Aerger (once)', of('bully:bump').length === bump0 + 1 && ctx.chase.level >= 1);
    step(30);
    assert('and only once', of('bully:bump').length === bump0 + 1);
    onFoot();
    at(hideout.x, hideout.y);
    press('interact');
    assert('pressing interact at the hideout bike returns it: mounted, bike:recovered, flag cleared, toast, arrow back on the school',
      player.vehicle === 'bike' && of('bike:recovered').length === 1 && of('bike:recovered')[0].bikeId === bikeId && !ctx.state.shared.flags.stolenBike && toast() === 'bike.recovered' && theft.stolen === null && arrow.bike === false);

    // ---- a thief that is scared off
    ctx.chase.reset();
    at(36, 44);
    onFoot();
    const lone = parking.dropped.at(-1) ?? null;
    assert('the bike is tracked again as unlocked', lone === ridden && lone.parkState === 'unlocked');
    at(3, 58);
    until(() => theft.active, 60 * 40);
    assert('a thief walks towards the bike', theft.active && theft.thief.phase === 'approach');
    player.teleport(theft.sprite.x + 20, theft.sprite.y);
    step(2);
    assert('a player coming close scares it off: no theft, bike stays', !theft.active && of('bike:theft-foiled').length === 1 && ridden.visible && ridden.parkState === 'unlocked' && !ctx.state.shared.flags.stolenBike);

    // ---- ownership and a pending theft survive saves and map reloads
    Object.assign(cfg, keep);
    theft.rng = Math.random;
    ctx.chase.reset();
    setOwned(['foot', 'bike', 'skates']);
    ctx.state.dispatch('flags.set', { key: 'stolenBike', value: { hideout: 'hideout-park-back', x: T(70), y: T(40), bikeId: 'bike1', map: 'town' } });
    assert('saved to a slot', ctx.saves.save(3));
    setOwned(['foot']);
    ctx.state.dispatch('flags.set', { key: 'stolenBike', value: null });
    assert('loaded again: ownership and the pending theft are back', ctx.saves.load(3) && owned() === 'bike,foot,skates' && ctx.state.shared.flags.stolenBike?.bikeId === 'bike1');
    ctx.saves.delete(3);
    ctx.world.load('test-room', 'from-town');
    step(2);
    ctx.world.load('town', 'from-test-room');
    step(3);
    const back = gs.bikes.parked.find(b => b.bikeId === 'bike1');
    assert('back in the town the stolen bike stands at its hideout and not at home too', gs.bikes.parked.filter(b => b.bikeId === 'bike1').length === 1 && theft.stolen === back && Math.abs(back.x - T(70)) < 1 && Math.abs(back.y - T(40)) < 1 && arrow.bike === true);
    assert('the padlocks follow ownership after the reload (skateboards locked, skates and bike free)', visiblePads().length === gs.skateboards.parked.filter(b => b.visible).length && visiblePads().every(p => gs.skateboards.parked.some(b => Math.abs(b.x - p.x) < 1)), `${visiblePads().length}`);

    // ---- clean up for whatever runs next
    ctx.state.dispatch('flags.set', { key: 'stolenBike', value: null });
    theft.unloadMap();
    theft.loadMap();
    for (const id of ctx.state.cfg.vehicleIds) ctx.ownership.unlock(id, 'garage');
    ctx.chase.reset();
    ctx.particles.emit = emit;
    at(7, 51);
    onFoot();
  }
};
