// Smoke scenario: the commute (story 8.2). Registered in scripts/smoke/index.js. Switches the clock to story mode for
// the duration and puts everything back afterwards.
export const commute = {
  name: 'commute',
  run(game, assert, env) {
    const { step, intent, ctx, gs, player } = env;
    const cm = ctx.commute;
    const log = [];
    for (const n of ['school:late', 'commute:ontime', 'tram:ride', 'tram:inspector', 'ui:toast']) ctx.events.on(n, e => log.push([n, e]));
    const count = (n, pred = () => true) => log.filter(e => e[0] === n && pred(e[1])).length;
    const clock = (day, minute, phase) => ctx.state.dispatch('clock.set', { day, minute, phase });
    const ordnung = () => ctx.state.players[0].kopfnoten.ordnung;
    const ts = ctx.map.tileSize;
    const tile = o => [(o.x + 0.5) * ts, (o.y + 0.5) * ts];
    const stop = id => ctx.map.objects.find(o => o.id === id);
    const at = o => { player.teleport(...tile(o)); gs.snapCamera(); step(2); };
    const home0 = { x: player.x, y: player.y, vehicle: player.vehicle };
    ctx.day.mode = 'story';
    for (const ride of gs.mountables) if (ride.isMounted(0)) ride.dismount(player);

    // ---- the bell: in time, then late
    clock(1, 470, 'commute');
    const o0 = ordnung();
    ctx.events.emit('goal:reached', { id: 'school', player: 0 });
    assert('arriving before 08:00 is on time and praised with a toast', count('commute:ontime') === 1 && count('school:late') === 0 && count('ui:toast', e => e.key === 'commute.ontime') === 1);
    assert('the arrival is stored for that day and player, and on time costs nothing', ctx.state.shared.flags['commute.1.0'] === 0);
    assert('being on time lifts the Ordnung Kopfnote a little', ordnung() > o0, `${o0} -> ${ordnung()}`);
    ctx.events.emit('goal:reached', { id: 'school', player: 0 });
    assert('arriving a second time the same day counts nothing more', count('commute:ontime') === 1);
    clock(2, 485, 'school');
    const o1 = ordnung();
    ctx.events.emit('goal:reached', { id: 'school', player: 0 });
    assert('arriving at 08:05 is five minutes late: event, kind toast, flag', count('school:late', e => e.minutes === 5) === 1 && count('ui:toast', e => e.key === 'commute.late' && e.params.min === 5) === 1 && ctx.state.shared.flags['commute.2.0'] === 5);
    assert('lateness lowers Ordnung only a little', ordnung() < o1 && o1 - ordnung() <= 0.3, `${o1} -> ${ordnung()}`);
    ctx.day.mode = 'freeplay';
    ctx.events.emit('goal:reached', { id: 'school', player: 0 });
    assert('the freeplay clock never judges arrival', count('school:late') === 1 && count('commute:ontime') === 1);
    ctx.day.mode = 'story';

    // ---- reminder at the warning times
    clock(3, 470, 'commute');
    ctx.events.emit('clock:tick', { day: 3, minute: 470, phase: 'commute' });
    assert('a toast counts down the minutes to the bell at 07:50', count('ui:toast', e => e.key === 'commute.warn' && e.params.min === 10) === 1);

    // ---- the tram: ticket, clock and teleport
    clock(4, 450, 'commute');
    ctx.state.dispatch('wallet.earn', { cents: 1000, reason: 'smoke' });
    const money0 = ctx.state.shared.money;
    const home = stop('home-tram-stop');
    const school = stop('school-tram-stop');
    at(home);
    assert('standing at the stop on foot names the ride', cm.nearStop(player)?.id === 'home-tram-stop' && cm.labels[0].visible);
    env.press('interact');
    const [sx, sy] = tile(school);
    assert('interact rides to the school stop', Math.hypot(player.x - sx, player.y - sy) < 40 && count('tram:ride', e => e.to === 'school-tram-stop' && e.tickets[0] === true) === 1, `${player.x.toFixed(0)},${player.y.toFixed(0)}`);
    assert('the ticket was paid from the wallet', ctx.state.shared.money === money0 - cm.cfg.tram.priceCents, `${money0} -> ${ctx.state.shared.money}`);
    assert('the ride took eight game minutes', ctx.day.minute === 458 && ctx.day.phase === 'commute', `${ctx.day.minute} ${ctx.day.phase}`);

    // ---- black rider and the inspector
    clock(4, 470, 'commute');
    ctx.state.dispatch('wallet.spend', { cents: ctx.state.shared.money - 100, reason: 'smoke' });
    cm.rng = () => 0; // the inspector is aboard
    at(school);
    env.press('interact');
    assert('without money the kid rides without a ticket and the inspector fines what there is', count('tram:ride', e => e.from === 'school-tram-stop' && e.tickets[0] === false) === 1 && count('tram:inspector') === 1 && ctx.state.shared.money === 0, `money ${ctx.state.shared.money}`);
    assert('the ride never crossed the end of the commute phase', ctx.day.phase === 'commute' && ctx.day.minute <= 479, `${ctx.day.minute}`);
    cm.rng = () => 0.99;
    ctx.state.dispatch('wallet.earn', { cents: 500, reason: 'smoke' });

    // ---- pickups appear when a kid comes near
    const spot = cm.cfg.pickups[0];
    cm.spawned.clear();
    player.teleport((spot.x + 0.5) * ts + 60, (spot.y + 0.5) * ts);
    gs.snapCamera();
    step(40);
    assert('a coin lies at the pickup once somebody comes near, only once', cm.spawned.has(spot.id) && ctx.loot.items.some(i => i.active && i.kind === 'coin' && i.data?.cents === spot.cents));

    ctx.loot.unloadMap(); // the coin must not outlive this scenario (the loot scenario counts live drops)

    // ---- put the clock back
    ctx.day.mode = 'freeplay';
    clock(1, 465, 'commute');
    cm.rng = Math.random;
    player.teleport(home0.x, home0.y); // and back on the vehicle the next scenarios expect
    if (home0.vehicle === 'bike') gs.bikes.giveBike(player);
    else if (home0.vehicle === 'skateboard') gs.skateboards.giveBoard(player);
    else if (home0.vehicle === 'skates') gs.skates.giveBoard(player);
    gs.snapCamera();
    step(2);
    assert('the commute scenario leaves the world running and the player where it found them', !ctx.frozen && player.vehicle === home0.vehicle, `${player.vehicle}`);
  }
};
