// Smoke scenario: the shops (story 10.1). Registered in scripts/smoke/index.js. Restores money, cosmetics, flags and the
// player's vehicle afterwards so the scenarios that follow find the game as they left it.
import { hasDayTicket } from '../../services/shopLogic.js';

export const shop = {
  name: 'shop',
  run(game, assert, env) {
    const { step, ctx, gs, ui, player } = env;
    const log = [];
    for (const n of ['shop:bought', 'shop:refused', 'vehicle:unlocked']) ctx.events.on(n, e => log.push([n, e]));
    const count = (n, pred = () => true) => log.filter(e => e[0] === n && pred(e[1])).length;
    const top = () => ui.screens.top();
    const ts = ctx.map.tileSize;
    const data0 = ctx.state.data;
    const home0 = { x: player.x, y: player.y, vehicle: player.vehicle };
    const slingshot = () => player.toolbelt.tools.find(t => t.id === 'slingshot');
    const max0 = slingshot().max;
    for (const ride of gs.mountables) if (ride.isMounted(0)) ride.dismount(player);
    const at = o => { player.teleport((o.x + o.w / 2) * ts, (o.y + o.h) * ts + 6); gs.snapCamera(); step(3); };
    const choose = id => { const s = top(); s.sel = s.items.findIndex(i => i.id === id); s.retext(); };
    const tap = () => { step(1); env.press('jump'); }; // a fresh press needs one frame with the key released in between
    const buy = id => { choose(id); tap(); };
    const workshop = ctx.map.objects.find(o => o.id === 'market-workshop');
    const bakery = ctx.map.objects.find(o => o.id === 'market-bakery');

    // ---- the workshop opens on interact
    ctx.state.dispatch('wallet.earn', { cents: 200000, reason: 'smoke' });
    at(workshop);
    assert('standing at the workshop on foot shows the prompt', ctx.shops.placeNear(player)?.id === 'vehicles' && ctx.shops.labels[0].visible && ctx.shops.labels[0].text.includes('Fahrrad') || ctx.shops.labels[0].text.includes('Bike'), ctx.shops.labels[0].text);
    env.press('interact');
    assert('interact opens the shop and freezes the world', top()?.id === 'shop' && ctx.frozen && top().items.length === 11, top()?.id);
    step(2);
    assert('a key still held from play cannot buy: nothing is bought without a fresh press', count('shop:bought') === 0);

    // ---- cosmetics are bought, worn and visible
    const m0 = ctx.state.shared.money;
    buy('hat-cap');
    step(2);
    assert('buying the cap takes its price and puts it on', ctx.state.shared.money === m0 - 300 && ctx.state.players[0].cosmetics.equipped.hat === 'hat-cap' && count('shop:bought', e => e.id === 'hat-cap') === 1);
    assert('the shop says so', top().note.length > 0 && top().rows.some(r => r.price.text.length > 0));
    top().retext();
    buy('ring-blue');
    ui.screens.clear();
    step(3);
    const slot = ctx.cosmetics.slots[0];
    assert('the hat floats above the player and the ring glows under the feet', slot.hat.visible && slot.hat.texture.key === 'cosm-hat-cap' && slot.ring.visible && slot.ring.texture.key === 'cosm-ring-blue' && slot.hat.y < player.y && slot.ring.y >= player.y, `${slot.hat.y.toFixed(0)} ${slot.ring.y.toFixed(0)} ${player.y.toFixed(0)}`);
    ctx.shops.open('vehicles', 0);
    step(2);
    choose('hat-cap');
    tap();
    assert('an owned cap is taken off with the same press', ctx.state.players[0].cosmetics.equipped.hat === undefined);
    tap();
    assert('and put back on', ctx.state.players[0].cosmetics.equipped.hat === 'hat-cap');

    // ---- not enough money: refused, nothing taken
    ctx.state.dispatch('wallet.spend', { cents: ctx.state.shared.money - 100, reason: 'smoke' });
    choose('hat-crown');
    tap();
    assert('without the money the crown is refused kindly and costs nothing', count('shop:refused', e => e.id === 'hat-crown' && e.reason === 'insufficient-funds') === 1 && ctx.state.shared.money === 100 && !ctx.state.players[0].cosmetics.owned.includes('hat-crown') && top().note.length > 0);

    // ---- the slingshot magazine upgrade and a vehicle
    ctx.state.dispatch('wallet.earn', { cents: 200000, reason: 'smoke' });
    buy('upgrade-ammo');
    assert('the upgrade widens the slingshot magazine for the family', slingshot().max === max0 + 4 && count('shop:bought', e => e.id === 'upgrade-ammo') === 1, `${max0} -> ${slingshot().max}`);
    const owned0 = ctx.state.shared.ownedVehicles.includes('rollerblades');
    if (owned0) ctx.state.replace({ ...ctx.state.data, shared: { ...ctx.state.shared, ownedVehicles: ctx.state.shared.ownedVehicles.filter(v => v !== 'rollerblades') } });
    buy('vehicle-rollerblades');
    assert('a vehicle goes through the vehicle unlock with its toast', ctx.state.shared.ownedVehicles.includes('rollerblades') && count('vehicle:unlocked', e => e.id === 'rollerblades' && e.reason === 'bought') === 1, `owned0 ${owned0}, owned ${ctx.state.shared.ownedVehicles}, unlocked ${JSON.stringify(log.filter(e => e[0] === 'vehicle:unlocked' || e[0] === 'shop:refused').map(e => e[1]))}`);
    env.press('pause');
    assert('Esc leaves the shop and unfreezes the world', !top() && !ctx.frozen);

    // ---- the bakery: a snack fills the energy, a day ticket covers the tram
    at(bakery);
    assert('the bakery has its own prompt', ctx.shops.placeNear(player)?.id === 'bakery');
    env.press('interact');
    assert('it sells the bakery items only', top()?.id === 'shop' && top().items.every(i => ['snack', 'ticket', 'activity'].includes(i.type)));
    player.move.stamina = 0.2;
    buy('snack-juice');
    assert('a snack fills the energy bar again', player.move.stamina === 1);
    const day = ctx.state.shared.clock.day;
    buy('ticket-day');
    assert('the day ticket is valid for today', hasDayTicket(ctx.state.shared) && ctx.state.shared.flags[`ticket.${day}`] === true);
    ui.screens.clear();
    step(2);

    // ---- put everything back
    slingshot().max = max0;
    ctx.state.replace(data0);
    player.teleport(home0.x, home0.y);
    if (home0.vehicle === 'bike') gs.bikes.giveBike(player);
    else if (home0.vehicle === 'skateboard') gs.skateboards.giveBoard(player);
    else if (home0.vehicle === 'skates') gs.skates.giveBoard(player);
    gs.snapCamera();
    step(3);
    assert('the shop scenario leaves the world running, the hat gone and the player where they were', !ctx.frozen && !ctx.cosmetics.slots[0].hat.visible && !ctx.cosmetics.slots[0].ring.visible && player.vehicle === home0.vehicle);
  }
};
