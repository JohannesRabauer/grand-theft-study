// Smoke scenario: the skatepark map (story 5.4, AD-28, CAP-15). Mehmet rolls into the park through the west gate: the
// turf still raises Ärger and the zone toast shows. With the chase switched off, he then skates the designed main line
// (data/maps trick-line `park-line-main`): ramp -> ollie onto the long rail -> grind -> ollie off -> stair jump -> U-turn ->
// manual along the pad -> ollie out -> rolling slowly through the bank spot, which banks the chain cleanly with the
// bonus (money through wallet.earn, XP through xp.add, style:banked reason 'bank-spot').
export const skatepark = {
  name: 'skatepark',
  run(game, assert, env) {
    const { h, step, intent, ctx, gs, player, ui, count } = env;
    const tr = ctx.tricks;
    const cfg = gs.cache.json.get('tricks');
    const sk = player.profiles.skateboard;
    const before = ctx.state.data;
    const obj = id => ctx.map.objects.find(o => o.id === id);
    const log = [];
    for (const n of ['style:trick', 'style:banked', 'trick:grind', 'trick:ramp', 'ui:toast']) ctx.events.on(n, e => log.push([n, e]));
    const of = n => log.filter(e => e[0] === n).map(e => e[1]);
    const place = (x, y, speed = 0, heading = 0) => {
      gs.matter.body.setPosition(player.body, { x, y });
      gs.matter.body.setVelocity(player.body, { x: (Math.cos(heading) * speed) / 60, y: (Math.sin(heading) * speed) / 60 });
      player.move.speed = player.move.velSpeed = speed;
      player.move.vel.x = Math.cos(heading) * speed;
      player.move.vel.y = Math.sin(heading) * speed;
      player.move.heading = heading;
      player.sprite.setPosition(x, y);
    };
    ctx.state.dispatch('player.setCharacter', { player: 0, character: 'mehmet' });
    ctx.characters.apply(player);
    gs.mountStartVehicle(player);
    step(2);
    const slot = tr.forPlayer(0);
    const skate = gs.skateboards.riders[0].skate;
    const ts = ctx.map.tileSize;

    // ---- the map: every obstacle is there, the strip on the road is gone
    const nOf = t => ctx.map.objects.filter(o => o.type === t && o.id.startsWith('park-')).length;
    assert('the park is loaded into the trick system: rails, ramps, stairs, a bank spot', tr.rails.length === 6 && tr.ramps.length === nOf('ramp') && tr.stairs.length === 1 && tr.spots.length === 1, `${tr.rails.length} rails, ${tr.ramps.length} ramps, ${tr.stairs.length} stairs, ${tr.spots.length} spots`);
    assert('the practice strip no longer lies on the road', !ctx.map.objects.some(o => o.id.startsWith('practice-')));
    assert('the park art is drawn: ground canvas, lamps, rack and the Lines sign', gs.park.art.images.length >= 1 + nOf('lamp') + 2 && gs.park.art.images.every(i => i.active), `${gs.park.art.images.length} images`);

    // ---- turf: entering still raises Ärger and shows the zone toast
    ctx.chase.reset();
    h.teleport(gs, ctx, 43, 41);
    step(20);
    const turfs0 = count('turf:enter');
    place(44 * ts, 41.5 * ts, 100, 0);
    let n = 0;
    while (count('turf:enter') === turfs0 && n++ < 200) { intent.move.x = 1; step(1); }
    intent.move.x = 0;
    assert('rolling in raises Ärger (bully turf unchanged)', ctx.chase.level >= 1, `level ${ctx.chase.level}`);
    assert('the zone toast "Skatepark: Hier wird gerollt!" shows (DE) on entering', of('ui:toast').some(e => e.key === 'zone.skatepark.enter') && ctx.t('zone.skatepark.enter') === (ctx.i18n.lang === 'de' ? 'Skatepark: Hier wird gerollt!' : 'Skatepark: Roll here!'));
    ctx.chase.reset();
    ctx.chase.lvl.enabled = false; // the run is about tricks: bullies would only knock the rider off
    const mag = v => v / (sk.maxSpeed * player.move.speedMult * ctx.surfaces.props('asphalt').speed.skateboard);
    ctx.surfaces.at = () => 'asphalt'; // known speeds, like the tricks scenario

    // ---- the main line, steered by intents
    const money0 = ctx.state.shared.money;
    const xp0 = ctx.state.players[0].xp;
    const banked0 = of('style:banked').length;
    ctx.input.intents[0].jump = false;
    h.teleport(gs, ctx, 45, 41);
    step(15);
    place(45.2 * ts, 41 * ts, 110, 0);
    const stairs = obj('park-stairs');
    const rail = obj('park-rail-long');
    const pad = obj('park-manual-pad');
    const states = new Set();
    const waypoints = [[67 * ts, 42.2 * ts], [64.6 * ts, 44 * ts]]; // the U-turn after the stairs, then west along the pad
    let wp = 0;
    let stage = 0;
    let target = 110;
    let manualSweet = false;
    const manualEvents = [];
    ctx.events.on('trick:manual', e => manualEvents.push(e));
    for (let f = 0; f < 1500 && of('style:banked').length === banked0; f++) {
      const air = skate.air > 0;
      const grounded = !air && !skate.grind;
      const tricks = slot.combo.tricks;
      intent.jump = intent.manual = false;
      // the stage follows what the board did; a press is repeated until the ollie really starts (it has a short cooldown after a landing)
      if (stage === 0) { // ramp, land, ollie onto the long rail
        intent.jump = tricks[0] === 'ramp' && grounded && player.x >= rail.points[0][0] * ts - 22;
        if (air && slot.flight === 'ollie') stage = 1;
      } else if (stage === 1) { // grind, then ollie off it
        intent.jump = slot.state === 'grind' && slot.travel > 55;
        if (air && !slot.rail && tricks.includes('grind')) stage = 2;
      } else if (stage === 2) { // stair jump
        intent.jump = grounded && player.x >= stairs.x * ts + 6 && player.x < (stairs.x + stairs.w) * ts;
        if (air && slot.flight === 'stairs') stage = 3;
      } else if (stage === 3) { // land, round the corner
        if (grounded && tricks.at(-1) === 'stairs') stage = 4;
      } else if (stage === 4) { // heading west along the pad: press the manual, bang-bang on the balance needle
        intent.manual = wp >= waypoints.length && player.x <= (pad.x + pad.w) * ts && skate.meter < 0.6;
        if (skate.manual) stage = 5;
      } else if (stage === 5) { // balance, then ollie out of the manual and slow down
        intent.manual = skate.meter < 0.6;
        intent.jump = grounded && skate.manual && player.x <= (pad.x + 3.2) * ts;
        if (air) { stage = 6; target = 38; }
      }
      intent.jump = intent.jump && f % 2 === 0; // a press is an edge: tap until the ollie starts
      let dx = 1;
      let dy = 0;
      if (stage >= 3) { // after the stairs: steer round the corner, then straight west
        const [tx, ty] = wp < waypoints.length ? waypoints[wp] : [pad.x * ts, 44.5 * ts];
        if (wp < waypoints.length && stage >= 4 && Math.hypot(tx - player.x, ty - player.y) < 14) wp++;
        const len = Math.hypot(tx - player.x, ty - player.y) || 1;
        dx = (tx - player.x) / len;
        dy = (ty - player.y) / len;
        if (wp >= waypoints.length) { dy = (44.5 * ts - player.y) * 0.08; dx = -1; }
      }
      manualSweet = manualSweet || skate.sweetNow;
      const m = mag(stage === 4 ? 80 : stage === 6 ? target : 110);
      intent.move.x = dx * m;
      intent.move.y = dy * m;
      step(1);
      states.add(slot.state);
    }
    intent.move.x = intent.move.y = 0;
    intent.jump = intent.manual = false;
    const banks = of('style:banked').slice(banked0);
    const bank = banks[0];
    const done = slot.combo.tricks.length === 0;
    assert('the line chains ramp, ollie, grind, ollie off, stair jump and manual', bank && ['ramp', 'ollie', 'grind', 'stairs', 'manual'].every(t => bank.tricks.includes(t)), bank?.tricks.join(','));
    assert('through every trick state on the way', ['ramp', 'ollie', 'grind', 'stairs-jump', 'manual'].every(s => states.has(s)), [...states].join(','));
    assert('the rail is the long flat rail, ended by the jump off it', of('trick:grind').some(e => e.phase === 'start' && e.rail === rail.id) && of('trick:grind').some(e => e.phase === 'end' && e.reason === 'ollie'));
    assert('the manual was balanced in the sweet spot', manualSweet && manualEvents.some(e => e.phase === 'end' && e.sweet >= cfg.tricks.manual.minSweet), `${manualEvents.length} manual events`);
    assert('rolling slowly through the bank spot banks it: clean, reason bank-spot, with the bonus', banks.length === 1 && !bank.bailed && bank.reason === 'bank-spot' && bank.spot === 'park-bank-spot' && bank.bonus === cfg.bankSpot.bonus && done, JSON.stringify(bank));
    const raw = Math.round(bank.points / (1 + cfg.bankSpot.bonus));
    assert('points include the bonus', Math.abs(bank.points - raw * (1 + cfg.bankSpot.bonus)) <= 1 && bank.points > 300, `${bank.points} points`);
    assert('money and XP are awarded by the data rate', bank.cents > 0 && bank.xp > 0 && ctx.state.shared.money - money0 === Math.floor(bank.points * cfg.bank.centsPerPoint) && ctx.state.players[0].xp - xp0 === Math.floor(bank.points * cfg.bank.xpPerPoint), `+${ctx.state.shared.money - money0} cents, +${ctx.state.players[0].xp - xp0} XP`);
    assert('the Style popup says it was a clean bank', ui.hud.get('style').note.text === ctx.t('style.bankedSpot', { v: (bank.cents / 100).toFixed(2).replace('.', ctx.i18n.lang === 'de' ? ',' : '.'), xp: bank.xp, b: Math.round(cfg.bankSpot.bonus * 100) }), ui.hud.get('style').note.text);

    // ---- leaving the turf shows the leave toast; the board stays under the rider
    const leave0 = count('turf:leave');
    delete ctx.surfaces.at;
    place(66.5 * ts, 41.5 * ts, 100, 0);
    n = 0;
    while (count('turf:leave') === leave0 && n++ < 200) { intent.move.x = 1; step(1); }
    intent.move.x = 0;
    assert('leaving the park shows its leave toast', of('ui:toast').some(e => e.key === 'zone.skatepark.leave'));

    // ---- back to the neutral kid the later scenarios expect
    ctx.chase.lvl.enabled = true;
    ctx.chase.reset();
    tr.clean(slot);
    ctx.state.replace(before);
    ctx.characters.apply(player);
    player.setVehicle('foot');
    h.teleport(gs, ctx, 7, 51);
    step(20);
    gs.skateboards.unloadMap(); // the dropped board goes, the map's own lying boards come back
    gs.skateboards.loadMap();
    assert('neutral kid restored on foot, no chain left', player.vehicle === 'foot' && player.character === null && slot.combo.tricks.length === 0);
  }
};
