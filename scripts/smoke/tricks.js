// Smoke scenario: trick system (story 5.2, AD-23). Mehmet rides the practice strip in the town (ramp, rail, bench,
// stairs along the road at tile rows 54..57, x 12..45): a ramp launch, the chain ollie -> grind -> ollie off -> stairs
// jump raising the multiplier (fire trail, sparks, Style HUD), banking through wallet.earn / xp.add / style:banked with
// the Tempo growth hook, the comic stair rattle, a wall bail that banks a reduced share, and independent co-op combos.
export const tricks = {
  name: 'tricks',
  run(game, assert, env) {
    const { h, step, intent, ctx, gs, player, ui } = env;
    const tr = ctx.tricks;
    const cfg = gs.cache.json.get('tricks');
    const board = gs.skateboards;
    const sk = player.profiles.skateboard;
    const before = ctx.state.data;
    const log = [];
    for (const n of ['style:trick', 'style:changed', 'style:banked', 'trick:grind', 'trick:ramp']) ctx.events.on(n, e => log.push([n, e]));
    const of = n => log.filter(e => e[0] === n).map(e => e[1]);
    const fx = { spark: 0, fire: 0 };
    const emit = ctx.particles.emit;
    ctx.particles.emit = function (name, ...a) { if (name in fx) fx[name]++; return emit.call(this, name, ...a); };
    const become = id => { ctx.state.dispatch('player.setCharacter', { player: 0, character: id }); ctx.characters.apply(player); };
    const place = (p, x, y, speed = 0, heading = 0) => {
      const c = Math.cos(heading);
      const s = Math.sin(heading);
      gs.matter.body.setPosition(p.body, { x, y });
      gs.matter.body.setVelocity(p.body, { x: (c * speed) / 60, y: (s * speed) / 60 });
      p.move.speed = speed;
      p.move.vel.x = c * speed;
      p.move.vel.y = s * speed;
      p.move.heading = heading;
      p.sprite.setPosition(x, y);
    };
    // the camera follows a teleport so walls and props around stream in; the rider then starts from a flying start
    const prep = (x, y, heading = 0, speed = 110) => {
      ctx.chase.reset();
      h.teleport(gs, ctx, Math.floor(x / 16), Math.floor(y / 16));
      step(15);
      place(player, x, y, speed, heading);
    };
    become('mehmet');
    const tempo0 = ctx.state.players[0].attributes.tempo;
    gs.mountStartVehicle(player);
    step(2);
    ctx.surfaces.at = () => 'asphalt';
    // stick intent magnitude that holds 110 px/s on the board (Mehmet's Tempo scales the top speed)
    const mag = 110 / (sk.maxSpeed * player.move.speedMult * ctx.surfaces.props('asphalt').speed.skateboard);
    const slot = tr.forPlayer(0);
    const skate = board.riders[0].skate;
    const money0 = ctx.state.shared.money;
    const xp0 = ctx.state.players[0].xp;

    assert('the practice strip is in the town: ramp, two rails, bench, stairs', ['ramp', 'rail', 'bench', 'stairs'].every(t => ctx.map.objects.some(o => o.type === t && o.id.startsWith('practice-'))) && tr.rails.length === 3 && tr.ramps.length === 1 && tr.stairs.length === 1);
    assert('every player has trick state and a Style combo (ctx.tricks.forPlayer, player.tricks)', tr === ctx.tricks && player.tricks === slot && slot.combo.mult === 1 && slot.state === 'roll');

    // ---- ramp
    prep(170, 884);
    let peak = 0;
    const rampStates = new Set();
    for (let i = 0; i < 150; i++) {
      intent.move.x = mag;
      step(1);
      peak = Math.max(peak, skate.height);
      rampStates.add(slot.state);
      if (peak > 0 && skate.air === 0) break;
    }
    const ramp = of('trick:ramp');
    assert('a ramp launches the rider higher and longer than an ollie, and landing scores it', peak > sk.trick.ollie.height * 1.4 && rampStates.has('ramp') && ramp[0]?.phase === 'start' && ramp.at(-1)?.phase === 'end' && ramp.at(-1).airtime > sk.trick.ollie.airtime * 1.5 && slot.combo.tricks[0] === 'ramp', `peak ${peak.toFixed(1)} px, air ${ramp.at(-1)?.airtime?.toFixed(2)} s, tricks ${slot.combo.tricks}`);
    intent.move.x = 0;
    let n = 0;
    while (slot.combo.tricks.length && n++ < 400) step(1);
    assert('rolling without tricks for the window banks it (money and XP through actions, style:banked)', of('style:banked').length === 1 && !of('style:banked')[0].bailed && of('style:banked')[0].tricks[0] === 'ramp' && ctx.state.shared.money > money0 && ctx.state.players[0].xp > xp0, `${of('style:banked')[0]?.points} points`);

    // ---- stairs without an ollie: comic rattle, slower
    prep(470, 904, 0, 120);
    let slow = 999;
    for (let i = 0; i < 30; i++) { intent.move.x = mag; step(1); slow = Math.min(slow, player.move.velSpeed); }
    assert('rolling down stairs rattles and slows the board, without a trick', of('style:trick').some(e => e.id === 'rattle' && e.points === 0) && slow < 90 && slot.combo.tricks.length === 0, `min speed ${slow.toFixed(0)}`);
    intent.move.x = 0;
    step(20);

    // ---- the chain: ollie -> grind -> ollie off -> stairs jump
    const banked0 = of('style:banked').length;
    const moneyChain = ctx.state.shared.money;
    const xpChain = ctx.state.players[0].xp;
    prep(228, 904);
    const states = new Set();
    const mults = [];
    let stage = 0;
    let hudSeen = false;
    for (let f = 0; f < 500; f++) {
      intent.move.x = mag;
      intent.jump = (stage === 0 && player.x >= 240) || (stage === 1 && slot.state === 'grind' && slot.travel > 35) || (stage === 2 && player.x >= 506 && skate.air === 0 && !skate.grind);
      if (intent.jump) stage++;
      step(1);
      states.add(slot.state);
      if (mults.at(-1) !== slot.combo.mult) mults.push(slot.combo.mult);
      if (slot.combo.tricks.length === 3) hudSeen = hudSeen || (ui.hud.get('style')?.head.visible && ui.hud.get('style').head.text.startsWith('Style') && ui.hud.get('style').bar.visible);
      if (stage === 3 && slot.combo.tricks.length >= 4 && skate.air === 0) break;
    }
    intent.jump = false;
    intent.move.x = 0;
    const chainTricks = slot.combo.tricks.slice();
    const fireMult = cfg.combo.fireMult;
    assert('the chain scores ollie, grind, ollie off, stairs jump', JSON.stringify(chainTricks) === JSON.stringify(['ollie', 'grind', 'ollie', 'stairs']), chainTricks.join(','));
    assert('through every trick state', ['ollie', 'grind', 'stairs-jump'].every(s => states.has(s)), [...states].join(','));
    assert('the multiplier only goes up along the chain and passes the fire level', mults.every((m, i) => i === 0 || m > mults[i - 1]) && slot.combo.mult >= fireMult, mults.map(m => m.toFixed(2)).join(' '));
    assert('the grind threw sparks, the fire trail burns at a high multiplier (ParticleHub spark / fire)', fx.spark >= 5 && fx.fire > 0, JSON.stringify(fx));
    assert('the jump off the rail was an ollie off with the style bonus', of('trick:grind').some(e => e.phase === 'end' && e.reason === 'ollie' && e.meters > 1));
    assert('the Style HUD shows points and multiplier while the chain runs', hudSeen);
    assert('nothing is paid while the chain runs', ctx.state.shared.money === moneyChain && ctx.state.players[0].xp === xpChain);
    const value = Math.round(slot.combo.base * slot.combo.mult);
    const mult = slot.combo.mult;
    n = 0;
    while (slot.combo.tricks.length && n++ < 400) step(1);
    const banks = of('style:banked').slice(banked0);
    const bank = banks[0];
    assert('banking fires style:banked with player, points, multiplier and the tricks', banks.length === 1 && bank.player === 0 && bank.points === value && Math.abs(bank.multiplier - mult) < 1e-9 && bank.tricks.join() === chainTricks.join() && !bank.bailed, JSON.stringify(bank));
    assert('it pays wallet cents and XP by the data rate', ctx.state.shared.money - moneyChain === Math.floor(value * cfg.bank.centsPerPoint) && ctx.state.players[0].xp - xpChain === Math.floor(value * cfg.bank.xpPerPoint) && bank.cents > 0, `+${ctx.state.shared.money - moneyChain} cents, +${ctx.state.players[0].xp - xpChain} XP`);
    assert('Tempo grew for every banked chain (the style:banked growth hook)', Math.abs(ctx.state.players[0].attributes.tempo - tempo0 - 0.15 * of('style:banked').length) < 1e-6, `${tempo0} -> ${ctx.state.players[0].attributes.tempo}`);
    assert('the meter resets', slot.combo.mult === 1 && of('style:changed').at(-1).points === 0 && !ui.hud.get('style').head.visible);

    // ---- bail: hitting a wall with a big chain banks a reduced share
    for (const id of ['ollie', 'grind', 'ollie', 'stairs']) tr.score(slot, id, { air: 0.4, meters: 6, steps: 4 });
    const full = Math.round(slot.combo.base * slot.combo.mult);
    const moneyBail = ctx.state.shared.money;
    const bankedBefore = of('style:banked').length;
    prep(100, 904, Math.PI, 110);
    for (let i = 0; i < 90 && of('style:banked').length === bankedBefore; i++) { intent.move.x = -mag; step(1); }
    intent.move.x = 0;
    const bail = of('style:banked')[bankedBefore];
    assert('hitting a wall banks only part of a big chain, gently', !!bail && bail.bailed && bail.reason === 'wall' && bail.points === Math.floor(full * cfg.bank.bailShare) && bail.points > 0 && bail.points < full && ctx.state.shared.money - moneyBail === bail.cents && bail.cents > 0, JSON.stringify(bail));

    // ---- co-op: every player has their own combo (and the perk is per character)
    if (ctx.players.length < 2) gs.addDebugPlayer();
    const p2 = ctx.players[1];
    if (!board.isMounted(1)) board.giveBoard(p2);
    const slot2 = tr.forPlayer(1);
    step(2);
    tr.score(slot, 'ollie', { air: 0.4 });
    const i2 = ctx.input.intents[1];
    prep(100, 904, 0, 110);
    place(p2, 60, 904, 110, 0);
    const kinds = new Set();
    for (let i = 0; i < 80; i++) {
      i2.move.x = mag;
      i2.jump = i === 2;
      step(1);
      kinds.add(slot2.state);
      if (i > 5 && board.riders[1].skate.air === 0 && slot2.combo.tricks.length) break;
    }
    i2.move.x = 0;
    i2.jump = false;
    const changed = of('style:changed').filter(e => e.player === 1);
    assert('player 2 ollies on their own: their own chain, player 1 untouched', JSON.stringify(slot2.combo.tricks) === '["ollie"]' && slot.combo.tricks.length === 1 && kinds.has('ollie') && changed.length > 0, `${slot2.combo.tricks} / ${slot.combo.tricks}`);
    assert('the Mehmet perk grows his multiplier faster than a neutral kid', Math.abs((slot.combo.mult - 1) / (slot2.combo.mult - 1) - player.perks.trickMultiplier) < 1e-6, `${slot.combo.mult.toFixed(2)} vs ${slot2.combo.mult.toFixed(2)}`);

    // ---- back to the neutral kid the later scenarios expect
    ctx.particles.emit = emit;
    delete ctx.surfaces.at;
    intent.move.x = 0;
    board.dismount(p2);
    tr.clean(slot);
    tr.clean(slot2);
    ctx.state.replace(before);
    ctx.characters.apply(player);
    player.setVehicle('foot');
    ctx.chase.reset();
    h.teleport(gs, ctx, 7, 51);
    step(20);
    board.unloadMap();
    board.loadMap();
    assert('neutral kid restored on foot, no chain left', player.vehicle === 'foot' && player.character === null && slot.combo.tricks.length === 0 && slot2.combo.tricks.length === 0);
  }
};
