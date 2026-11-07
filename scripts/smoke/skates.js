// Smoke scenario: inline skates and the bus grab (story 5.3, AD-23). Registered in scripts/smoke/index.js.
// Lorenz starts on skates (own rider look, HUD line), measured speeds and acceleration against foot, skateboard and bike per
// surface, a hop, lying skates to pick up, then the grab of the town's buses: hold interact in the rear zone, towed above
// the skates' top speed with sparks, rope and risk bar, swinging sideways, the failure with its comic stumble, release by
// letting go and by jumping (Style 'bus ride'), failure odds with seeded randomness (cobble worse, the perk better) and
// independent co-op grabs.
export const skates = {
  name: 'skates',
  run(game, assert, env) {
    const { h, step, intent, ctx, gs, player, ui, T } = env;
    const profiles = player.profiles;
    const sk = profiles.skates;
    const grabs = ctx.grabs;
    const cfg = gs.cache.json.get('grab');
    const trCfg = gs.cache.json.get('tricks');
    const before = ctx.state.data;
    const log = [];
    for (const n of ['grab:start', 'grab:end', 'trick:grab', 'style:trick', 'ui:toast', 'trick:ollie']) ctx.events.on(n, e => log.push([n, e]));
    const of = n => log.filter(e => e[0] === n).map(e => e[1]);
    const fx = { spark: 0 };
    const emit = ctx.particles.emit;
    ctx.particles.emit = function (name, ...a) { if (name in fx) fx[name]++; return emit.call(this, name, ...a); };
    const become = id => { ctx.state.dispatch('player.setCharacter', { player: 0, character: id }); ctx.characters.apply(player); };
    const place = (p, x, y, speed = 0, heading = 0) => {
      gs.matter.body.setPosition(p.body, { x, y });
      gs.matter.body.setVelocity(p.body, { x: (Math.cos(heading) * speed) / 60, y: (Math.sin(heading) * speed) / 60 });
      p.move.speed = p.move.velSpeed = speed;
      p.move.vel.x = Math.cos(heading) * speed;
      p.move.vel.y = Math.sin(heading) * speed;
      p.move.heading = heading;
      p.sprite.setPosition(x, y);
    };
    const quiet = () => { ctx.chase.reset(); h.teleport(gs, ctx, 7, 51); step(20); };
    const mulberry = seed => () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const slotOf = p => grabs.slots[p.index];

    // ---- Lorenz starts on skates
    quiet();
    become('lorenz');
    gs.mountStartVehicle(player);
    step(2);
    const skatesSvc = gs.skates;
    const vehicleLine = ui.hud.get('status').vehicle.text;
    assert('Lorenz starts on skates (no fallback to running): vehicle, mounted, own rider look, HUD line',
      player.character.startVehicle === 'skates' && player.startVehicle === 'skates' && player.vehicle === 'skates' && skatesSvc.isMounted(0) && player.sprite.texture.key.startsWith('player-lorenz-skates') && vehicleLine === ctx.t('hud.vehicle', { name: ctx.t('vehicle.skates') }), `${player.vehicle} ${player.sprite.texture.key} "${vehicleLine}"`);
    assert('the town has lying skates to pick up and two buses on the main road', skatesSvc.parked.filter(b => b.visible).length >= 2 && grabs.pool.filter(t => t.active).length === 2 && grabs.pool.every(t => !t.active || (t.y > 54 * 16 && t.y < 58 * 16)));

    // ---- measured speeds and acceleration
    const real = ctx.surfaces.at;
    const asProfile = (id, fn) => { const keep = player.vehicle; player.move.setProfile(id, profiles[id]); const r = fn(); player.move.setProfile(keep, profiles[keep]); return r; };
    const measure = (id, surface) => asProfile(id, () => {
      ctx.surfaces.at = () => surface;
      place(player, T(7), T(51));
      intent.move.x = 1;
      let top = 0;
      for (let i = 0; i < 100; i++) { step(1); top = Math.max(top, player.move.velSpeed); }
      intent.move.x = 0;
      delete ctx.surfaces.at;
      step(1);
      return top;
    });
    const timeTo60 = id => asProfile(id, () => {
      ctx.surfaces.at = () => 'asphalt';
      place(player, T(7), T(51));
      intent.move.x = 1;
      let n = 0;
      while (player.move.velSpeed < 60 && n < 200) { step(1); n++; }
      intent.move.x = 0;
      delete ctx.surfaces.at;
      step(1);
      return n;
    });
    const speeds = {};
    for (const s of ['asphalt', 'concrete', 'cobble', 'grass']) for (const id of ['skates', 'skateboard', 'bike', 'foot']) speeds[`${id}/${s}`] = measure(id, s);
    const sp = (id, s) => speeds[`${id}/${s}`];
    const designed = sp('skates', 'asphalt') / (sk.maxSpeed * player.move.speedMult);
    assert('skates are faster than walking on asphalt and concrete, at the designed speed', sp('skates', 'asphalt') > sp('foot', 'asphalt') * 1.3 && sp('skates', 'concrete') > sp('foot', 'concrete') * 1.3 && Math.abs(designed - 1) < 0.05, `asphalt ${sp('skates', 'asphalt').toFixed(0)} vs foot ${sp('foot', 'asphalt').toFixed(0)}`);
    assert('on cobble and grass they are clearly slower than skateboard, bike and walking', ['cobble', 'grass'].every(s => ['skateboard', 'bike', 'foot'].every(id => sp('skates', s) < sp(id, s) * 0.8)), `cobble ${sp('skates', 'cobble').toFixed(0)}/${sp('skateboard', 'cobble').toFixed(0)}/${sp('bike', 'cobble').toFixed(0)}, grass ${sp('skates', 'grass').toFixed(0)}/${sp('skateboard', 'grass').toFixed(0)}/${sp('bike', 'grass').toFixed(0)}`);
    const t60 = { skates: timeTo60('skates'), skateboard: timeTo60('skateboard'), bike: timeTo60('bike') };
    assert('they pick up speed quicker than skateboard and bike', t60.skates < t60.skateboard && t60.skates < t60.bike, JSON.stringify(t60));
    assert('the surface lookup is untouched afterwards', ctx.surfaces.at === real);

    // ---- the hop, push-off and glide poses
    quiet();
    ctx.surfaces.at = () => 'asphalt'; // the spawn is on grass
    place(player, T(7), T(51));
    intent.move.x = 1;
    const poseSeen = new Set();
    for (let i = 0; i < 70; i++) { step(1); poseSeen.add(player.sprite.texture.key.replace('player-lorenz-skates', '') || 'glide'); }
    assert('accelerating shows alternating push-offs, then the glide pose at speed', poseSeen.has('-pushA') && poseSeen.has('-pushB') && poseSeen.has('glide'), [...poseSeen].join(','));
    intent.jump = true;
    step(1);
    intent.jump = false;
    let lifted = 0;
    for (let i = 0; i < 12; i++) { step(1); lifted = Math.max(lifted, player.y - player.sprite.y); }
    assert('the jump intent is a small hop (lifted sprite, crouch pose, trick:ollie)', lifted > sk.trick.ollie.height * 0.6 && of('trick:ollie').some(e => e.phase === 'start' && e.player === 0), `lift ${lifted.toFixed(1)}`);
    intent.move.x = 0;
    step(40);
    delete ctx.surfaces.at;

    // ---- skates can grind a rail with the same trick system
    const slot = ctx.tricks.forPlayer(0);
    ctx.surfaces.at = () => 'asphalt';
    const railX = ctx.map.objects.find(o => o.id === 'park-rail-long').points[0][0] * 16; // the skatepark's long rail, y 656
    ctx.chase.reset();
    ctx.chase.lvl.enabled = false; // the park is bully turf; this is only about the rail
    h.teleport(gs, ctx, Math.floor((railX - 44) / 16), 41);
    step(15);
    place(player, railX - 44, 656, 110);
    const mag = 110 / (sk.maxSpeed * player.move.speedMult);
    let ground = false;
    for (let f = 0; f < 200 && !ground; f++) {
      intent.move.x = mag;
      intent.jump = player.x >= railX - 20 && !skatesSvc.riders[0].skate.air && slot.state !== 'grind' && f < 60;
      step(1);
      ground = slot.state === 'grind';
    }
    intent.jump = false;
    for (let f = 0; f < 60 && slot.state === 'grind'; f++) step(1);
    intent.move.x = 0;
    assert('hop onto a rail grinds it with sparks and scores (TrickSystem works for skates)', ground && slot.combo.tricks.includes('grind') && fx.spark > 0, `${slot.combo.tricks}`);
    delete ctx.surfaces.at;
    for (let n = 0; slot.combo.tricks.length && n < 400; n++) step(1);
    ctx.chase.lvl.enabled = true;
    ctx.chase.reset();

    // ---- grab: hold interact in the rear zone
    quiet();
    const bus = grabs.pool.find(t => t.active);
    const setBus = x => { bus.s = x - 112; bus.heading = 0; step(1); }; // on the straight eastbound lane (the heading would need a moment to ease there)
    const behind = (gap, speed = bus.speed) => place(player, bus.x - bus.kcfg.length / 2 - gap, bus.y, speed, 0);
    setBus(420);
    place(player, bus.x + 90, bus.y, 100, 0); // ahead in the lane: the faster bus catches up
    intent.move.x = 1;
    intent.hold = true; // held early: the bus is near, so this is not a dismount
    grabs.random = () => 0.999;
    const sparks0 = fx.spark;
    const frames = [];
    for (let i = 0; i < 400 && !player.grabbing; i++) { step(1); frames.push(i); }
    assert('holding interact early is a grab, not a dismount: the bus catches up and the rider hangs on (grab:start)', player.grabbing && player.vehicle === 'skates' && of('grab:start').length === 1 && of('grab:start')[0].player === 0 && of('grab:start')[0].kind === 'bus' && of('trick:grab').some(e => e.phase === 'start'), `after ${frames.length} frames, grabbing ${player.grabbing}`);
    assert('a toast explains it once (grab.hint)', of('ui:toast').filter(e => e.key === 'grab.hint').length === 1);
    step(60);
    const lorenzTop = sk.maxSpeed * player.move.speedMult;
    assert('towed at the bus speed: clearly above the skates top speed, same direction', Math.abs(player.move.velSpeed - bus.speed) < bus.speed * 0.06 && player.move.velSpeed > lorenzTop * 1.1 && Math.abs(player.move.heading - bus.heading) < 0.15, `${player.move.velSpeed.toFixed(0)} vs bus ${bus.speed} / top ${lorenzTop.toFixed(0)}, heading ${player.move.heading.toFixed(2)} vs ${bus.heading.toFixed(2)}`);
    const ropeLen = Math.hypot(bus.x - bus.kcfg.length / 2 - player.x, bus.y - player.y);
    assert('the rider hangs on a rope behind the handle, in the grab pose with sparks, rope and risk bar drawn', Math.abs(ropeLen - cfg.ropeLength) < 6 && player.sprite.texture.key === 'player-lorenz-skates-grab' && fx.spark > sparks0 + 2 && grabs.drawn && slotOf(player).g.risk >= 0, `rope ${ropeLen.toFixed(1)}, sparks +${fx.spark - sparks0}`);
    assert('interact while hanging on does not get off the skates', (() => { intent.interact = true; step(1); intent.interact = false; return player.vehicle === 'skates' && player.grabbing; })());

    // steering sideways swings it a little
    const lat = () => { const c = Math.cos(bus.heading); const s = Math.sin(bus.heading); return -(player.x - bus.x) * s + (player.y - bus.y) * c; };
    const lat0 = lat();
    intent.move.y = 1;
    let swing = 0;
    for (let i = 0; i < 30; i++) { step(1); swing = Math.max(swing, Math.abs(lat() - lat0)); }
    assert('steering sideways swings the rider on the rope, within the swing limit', swing > 4 && swing <= cfg.swingMax + 3 && player.grabbing, `${swing.toFixed(1)} px`);
    intent.move.y = 0;
    step(30);
    assert('and it swings back when the stick is let go', Math.abs(lat() - lat0) < 4);
    const risk1 = slotOf(player).g.risk;
    step(30);
    assert('the risk meter rises over time', slotOf(player).g.risk > risk1 && slotOf(player).g.risk > 0, `${risk1.toFixed(3)} -> ${slotOf(player).g.risk.toFixed(3)}`);

    // ---- release: letting go of the button
    intent.hold = false;
    step(2);
    let end = of('grab:end').at(-1);
    assert('letting go of interact releases (grab:end release) and the ride counts as a Style trick', !player.grabbing && end.reason === 'release' && end.player === 0 && end.time > 1.5 && of('style:trick').some(e => e.id === 'grab' && e.points > 0), `${end?.reason} after ${end?.time?.toFixed(2)}s`);
    intent.move.x = 0;
    step(30);

    // ---- release by jumping: ollie off with the bonus
    for (let n = 0; slot.combo.tricks.length && n < 400; n++) step(1); // the chain banks, so this ride scores on its own
    quiet();
    setBus(420);
    behind(25);
    intent.hold = true;
    intent.move.x = 1;
    step(40);
    const hanging = player.grabbing;
    intent.jump = true;
    step(1);
    intent.jump = false;
    step(2);
    end = of('grab:end').at(-1);
    const ride = of('style:trick').filter(e => e.id === 'grab').at(-1);
    const hop = skatesSvc.riders[0].skate;
    const expect = trCfg.tricks.grab.points + trCfg.tricks.grab.perSecond * end.time + trCfg.grab.jumpBonus;
    assert('a jump ollies off the bus: grab:end jump, an ollie in the air, a bus ride trick with the jump bonus', hanging && end.reason === 'jump' && hop.air > 0 && Math.abs(ride.points - expect) < 3, `${end?.reason}, air ${hop.air.toFixed(2)}, ${ride?.points} vs ${expect.toFixed(1)}`);
    intent.hold = false;
    intent.move.x = 0;
    step(60);

    // ---- failure: comic stumble, no harm
    quiet();
    const money = ctx.state.shared.money;
    setBus(420);
    behind(25);
    intent.hold = true;
    intent.move.x = 1;
    grabs.random = () => 0;
    for (let i = 0; i < 120 && !of('grab:end').some(e => e.reason === 'fail'); i++) step(1);
    const started = of('grab:start').length;
    const failedAt = player.move.velSpeed;
    end = of('grab:end').find(e => e.reason === 'fail');
    assert('under bad luck the grip fails after the grace period (grab:end fail), with a toast', !!end && end.time >= cfg.failure.grace && of('ui:toast').some(e => e.key === 'grab.fail') && started >= 1, `${end?.reason} ${end?.time?.toFixed(2)}`);
    assert('the rider tumbles: spinning sprite, stumbling flag, comic pose', player.stumbling && !player.grabbing);
    const rot0 = player.sprite.rotation;
    step(8);
    const spun = Math.abs(player.sprite.rotation - rot0) > 0.3;
    intent.hold = false;
    intent.move.x = 0;
    step(30);
    const slowed = player.move.velSpeed;
    assert('a brief slowdown follows (stumble speed cap) and the sprite spun', spun && slowed < sk.maxSpeed * cfg.stumble.speedMult + 15 && slowed < failedAt * 0.5, `${failedAt.toFixed(0)} -> ${slowed.toFixed(0)}`);
    step(Math.ceil(cfg.stumble.time * 60));
    assert('no harm: still alive, same money, back on skates, stumble over', player.alive && ctx.state.shared.money === money && player.vehicle === 'skates' && !player.stumbling && !player.pinned);

    // ---- no regrab while the button stays down; the button must be let go first
    quiet();
    setBus(420);
    behind(25);
    grabs.random = () => 0.999;
    intent.hold = true;
    step(30);
    const first = of('grab:start').length;
    intent.hold = false;
    step(2);
    setBus(420);
    behind(25);
    intent.hold = true;
    step(30);
    assert('after letting go, pressing again in the zone grabs again', of('grab:start').length === first + 1 && player.grabbing);
    intent.hold = false;
    step(5);
    intent.hold = true;
    step(5);
    intent.hold = false;
    step(1);

    // ---- seeded failure odds: cobble is worse, the perk helps (the grab on the real entity and controller)
    const trial = (seed, surface, perk) => {
      const rnd = mulberry(seed);
      const old = player.perks.busGrabBonus;
      player.perks.busGrabBonus = perk;
      grabs.random = rnd;
      if (surface) ctx.surfaces.at = () => surface;
      let fails = 0;
      const n = 24;
      for (let k = 0; k < n; k++) {
        const base = of('grab:end').length;
        quiet();
        setBus(120);
        behind(25);
        intent.hold = false;
        step(2);
        intent.hold = true;
        intent.move.x = 0;
        for (let i = 0; i < 600 && !(of('grab:end').length > base); i++) {
          if (i > 3 && !player.grabbing && of('grab:start').length === of('grab:end').length) break;
          step(1);
        }
        if (of('grab:end')[base]?.reason === 'fail') fails++;
        intent.hold = false;
        step(Math.ceil(cfg.stumble.time * 60) + 4);
      }
      delete ctx.surfaces.at;
      player.perks.busGrabBonus = old;
      return fails / n;
    };
    const asphalt = trial(5, null, 0);
    const cobble = trial(5, 'cobble', 0);
    assert('failure odds with seeded randomness: asphalt sometimes fails, cobble nearly always', asphalt > 0.05 && asphalt < 0.85 && cobble >= 0.75 && cobble > asphalt, `asphalt ${asphalt.toFixed(2)}, cobble ${cobble.toFixed(2)}`);

    // the perk lowers the accumulated risk (deterministic: no roll ever fails), measured on the same ride
    const riskAfter = perk => {
      player.perks.busGrabBonus = perk;
      grabs.random = () => 0.999;
      quiet();
      setBus(120);
      behind(25);
      intent.hold = false;
      step(2);
      intent.hold = true;
      step(100);
      const r = slotOf(player).g.risk;
      intent.hold = false;
      step(3);
      return r;
    };
    const lorenzPerk = player.character.perks.busGrabBonus;
    const rPlain = riskAfter(0);
    const rLorenz = riskAfter(lorenzPerk);
    assert('the perk busGrabBonus lowers the failure risk of the same ride (Lorenz vs a neutral kid)', rLorenz > 0 && rLorenz < rPlain * 0.9, `${rPlain.toFixed(3)} vs ${rLorenz.toFixed(3)}`);
    player.perks.busGrabBonus = lorenzPerk;

    // ---- an early press far from any bus still gets off the skates; the next press mounts the nearest lying pair
    quiet();
    place(player, T(7), T(51));
    step(2);
    intent.interact = true;
    step(1);
    intent.interact = false;
    assert('far from a bus the interact press dismounts the skates as usual', player.vehicle === 'foot' && !skatesSvc.isMounted(0));
    const pair = skatesSvc.parked.find(b => b.visible && Math.hypot(b.x - player.x, b.y - player.y) < 4);
    place(player, pair.x, pair.y);
    step(2);
    intent.interact = true;
    step(1);
    intent.interact = false;
    assert('walking to the lying skates and pressing interact puts them on again', player.vehicle === 'skates' && skatesSvc.isMounted(0) && player.sprite.texture.key.startsWith('player-lorenz-skates'));

    // ---- co-op: each player has their own grab
    if (ctx.players.length < 2) gs.addDebugPlayer();
    const p2 = ctx.players[1];
    if (!skatesSvc.isMounted(1)) { if (gs.bikes.isMounted(1)) gs.bikes.dismount(p2); if (gs.skateboards.isMounted(1)) gs.skateboards.dismount(p2); skatesSvc.giveBoard(p2); }
    const i2 = ctx.input.intents[1];
    quiet();
    place(p2, T(7), T(51));
    grabs.random = () => 0.999;
    setBus(420);
    behind(25);
    place(p2, bus.x - bus.kcfg.length / 2 - 300, bus.y, 0, 0); // far behind: out of reach
    intent.hold = true;
    step(20);
    const grabbedOne = player.grabbing && !p2.grabbing && !grabs.claims(1);
    i2.hold = true;
    step(5);
    const stillNotP2 = !p2.grabbing;
    place(p2, bus.x - bus.kcfg.length / 2 - 25, bus.y + 4, bus.speed, 0);
    step(15);
    const both = player.grabbing && p2.grabbing && of('grab:start').at(-1).player === 1 && slotOf(player).target === slotOf(p2).target;
    intent.hold = false;
    step(3);
    const only2 = !player.grabbing && p2.grabbing && of('grab:end').at(-1).player === 0;
    i2.hold = false;
    step(3);
    assert('co-op: one hangs on while the other cannot reach, then both, and each lets go on its own', grabbedOne && stillNotP2 && both && only2 && !p2.grabbing && of('grab:end').at(-1).player === 1 && of('grab:end').at(-1).reason === 'release');

    // ---- leaving the map ends a grab (no stuck state); then back to the neutral kid
    quiet();
    setBus(420);
    behind(25);
    intent.hold = true;
    step(15);
    const hung = player.grabbing;
    ctx.events.emit('world:leave', { map: 'town' });
    assert('leaving the map ends the grab (reason map)', hung && !player.grabbing && of('grab:end').at(-1).reason === 'map');
    intent.hold = false;
    intent.move.x = 0;
    ctx.particles.emit = emit;
    grabs.random = Math.random;
    delete ctx.surfaces.at;
    if (skatesSvc.isMounted(1)) skatesSvc.dismount(p2);
    ctx.state.replace(before);
    ctx.characters.apply(player);
    player.setVehicle('foot');
    quiet();
    skatesSvc.unloadMap(); // back to the map's own lying skates: the starter pair and the dropped one are gone
    skatesSvc.loadMap();
    assert('neutral kid restored on foot', player.vehicle === 'foot' && player.sprite.texture.key === 'player' && player.character === null && !player.grabbing && !player.stumbling);
  }
};
