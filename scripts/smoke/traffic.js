// Smoke scenario: buses hit players comically (story 5.6, AD-23). Registered in scripts/smoke/index.js.
// A bus drives into a standing kid: one hit with the tumble, stars, coin spill, stamina loss, stun and the invulnerability
// window (no chain hit), the coins can be picked up again and run out after 20 s; riding into the bus's side hits and flings the
// bike, board and skates (they lie there, mountable again); a slow bus does not hit; the rear grab zone is safe and the grab
// still works; a pedestrian and a dog next to the bus are untouched (the pedestrian steps aside early) and no body force
// ever lands on people or animals; co-op players are hit on their own, a pinned or caught one is not.
import { CAT } from '../../physics/categories.js';
import { inRearZone } from '../../vehicles/grabLogic.js';
import { classifyHit } from '../../vehicles/trafficLogic.js';

const PLAYER_MASK = CAT.NPC | CAT.PROP | CAT.STATIC | CAT.SENSOR;

export const traffic = {
  name: 'traffic',
  run(game, assert, env) {
    const { h, step, until } = env;
    // a fresh single-player run with traffic on: earlier scenarios may have left co-op or a restarted scene behind
    game.trafficOff = false;
    const prev = game.scene.getScene('Game');
    prev.ctx.state.dispatch('coop.set', { on: false });
    prev.scene.restart();
    step(4);
    const gs = game.scene.getScene('Game');
    const ctx = gs.ctx;
    if (ctx.world.id === 'home') ctx.world.load('town', 'from-home');
    ctx.input.update = () => {};
    const intent = ctx.input.intent;
    intent.aim = null;
    const player = ctx.players[0];
    const T = t => h.tilePx(ctx, t);
    const live = n => ctx.pools.byName.get(n).live();
    const cfg = gs.cache.json.get('traffic');
    const grab = gs.cache.json.get('grab');
    const grabs = ctx.grabs;
    const tr = ctx.traffic;
    const slotOf = p => tr.slots[p.index];
    const rides = gs.mountables;
    const log = [];
    const handlers = ['traffic:hit', 'sfx:play', 'ui:toast', 'loot:collected', 'grab:start', 'grab:end', 'npc:react'].map(n => {
      const fn = e => log.push([n, e]);
      ctx.events.on(n, fn);
      return [n, fn];
    });
    const of = n => log.filter(e => e[0] === n).map(e => e[1]);
    const hits = () => of('traffic:hit');
    const fx = { stars: 0, dust: 0 };
    const emit = ctx.particles.emit;
    ctx.particles.emit = function (name, ...a) { if (name in fx) fx[name]++; return emit.call(this, name, ...a); };
    const Body = Phaser.Physics.Matter.Matter.Body;
    const applyForce = Body.applyForce;
    const forced = [];
    Body.applyForce = function (b, ...a) { forced.push(b.collisionFilter.category); return applyForce.call(this, b, ...a); };
    const bodies = () => Phaser.Physics.Matter.Matter.Composite.allBodies(gs.matter.world.localWorld).filter(b => ![CAT.STATIC, CAT.NPC, CAT.ANIMAL].includes(b.collisionFilter.category)).length;
    const place = (p, x, y, speed = 0, heading = 0) => {
      gs.matter.body.setPosition(p.body, { x, y });
      gs.matter.body.setVelocity(p.body, { x: (Math.cos(heading) * speed) / 60, y: (Math.sin(heading) * speed) / 60 });
      p.move.speed = p.move.velSpeed = speed;
      p.move.vel.x = Math.cos(heading) * speed;
      p.move.vel.y = Math.sin(heading) * speed;
      p.move.heading = heading;
      p.sprite.setPosition(x, y);
    };
    const onFoot = p => { for (const r of rides) if (r.isMounted(p.index)) r.dismount(p); };
    const idle = p => !tr.tumbling(p.index) && slotOf(p).hit.safe <= 0;
    const calm = () => { ctx.chase.reset(); for (const p of ctx.players) { place(p, T(7), T(51)); onFoot(p); } step(2); };
    const [bus, other] = grabs.pool.filter(t => t.active);
    const speed0 = bus.speed;
    const cruises = grabs.pool.map(t => t.cruise);
    for (const t of grabs.pool) { t.testNoYield = true; if (t !== bus) t.speed = t.cruise = 0; }
    // Deliberately force contact here; normal yielding and recovery have their own open-world scenario.
    const setBus = x => { bus.s = x - 112; bus.heading = 0; bus.speed = bus.cruise = speed0; step(1); };
    const lat = p => (p.y - bus.y) * Math.cos(bus.heading);
    ctx.state.dispatch('wallet.earn', { cents: 400, reason: 'smoke' });
    if (ctx.players.length < 2) gs.addDebugPlayer();
    const p2 = ctx.players[1];
    onFoot(p2);

    // ---- a bus drives into a standing kid
    calm();
    player.move.stamina = 1;
    setBus(420);
    place(player, bus.x + 200, bus.y);
    const money0 = ctx.state.shared.money;
    const sparks = fx.stars;
    const found = until(() => hits().length > 0, 200);
    const hit = hits()[0];
    const slot = slotOf(player);
    const lost = money0 - ctx.state.shared.money;
    const coins = ctx.loot.items.filter(i => i.active && i.kind === 'coin');
    const lineText = tr.bubbles.items.find(b => b.owner === slot.anchor)?.text.text;
    assert('a bus driving into a standing kid hits it once: traffic:hit with the vehicle, speed and direction', found >= 0 && hits().length === 1 && hit.player === 0 && hit.vehicleId === bus.id && hit.kind === 'front' && Math.abs(hit.speed - speed0) < 10 && Math.abs(hit.direction) < 0.05, JSON.stringify(hit));
    assert('the tumble starts at once (flying phase), the bus is not stopped, honk and hit sounds are hooks only', tr.tumbling(0) && bus.speed === speed0 && of('sfx:play').some(e => e.name === 'bus-horn') && of('sfx:play').some(e => e.name === 'traffic-hit'));
    assert('the bus honks (HUPP bubble) and the kid says one of three funny lines in a bubble', tr.bubbles.items.some(b => b.owner === bus && b.text.text === ctx.t('traffic.honk')) && [1, 2, 3].some(i => lineText === ctx.t(`traffic.hit.${i}`)), `${lineText}`);
    assert('stars burst out; a few cents drop out of the pocket via the wallet (20 to 50) as pickup coins worth exactly that', fx.stars > sparks && lost >= 20 && lost <= 50 && hit.lost === lost && coins.length >= 3 && coins.length <= 5 && coins.reduce((s, c) => s + c.data.cents, 0) === lost && coins.every(c => c.life === 20), `lost ${lost}, ${coins.length} coins`);
    assert('the tank loses stamina', Math.abs(player.move.stamina - (1 - cfg.stun.stamina)) < 0.02, `${player.move.stamina}`);
    const from = { x: hit.x, y: hit.y };
    step(21);
    assert('mid-flight the kid is up in the air over a shadow and spinning, moving along the bus direction and off its lane', player.sprite.y < player.y - 6 && slot.shadow?.visible && Math.abs(player.sprite.rotation) > 0.3 && player.x > from.x + 10 && Math.abs(lat(player)) > bus.kcfg.width / 2, `lift ${(player.y - player.sprite.y).toFixed(1)}, dx ${(player.x - from.x).toFixed(0)}`);
    until(() => slot.hit.phase === 2, 60);
    step(2);
    const landed = Math.hypot(player.x - from.x, player.y - from.y);
    assert('it lands about the launch distance away, sprawled on the ground in a stun with stars over its head', slot.hit.phase === 2 && Math.abs(landed - Math.hypot(cfg.launch.forward, cfg.launch.side)) < 6 && Math.abs(Math.abs(player.sprite.rotation) - Math.PI / 2) < 0.3 && Math.abs(player.sprite.y - player.y) < 0.5 && player.move.velSpeed < 1, `${landed.toFixed(1)} px, rot ${player.sprite.rotation.toFixed(2)}`);
    const starsLie = fx.stars;
    intent.move.x = 1;
    step(30);
    assert('while it lies it cannot be steered and the stars keep circling', Math.abs(player.x - slot.pose.x) < 1 && fx.stars > starsLie, `${(player.x - slot.pose.x).toFixed(1)}`);
    intent.move.x = 0;
    until(() => !tr.tumbling(0), 120);
    assert('it gets up (upright again, shadow gone) and the invulnerability window starts', !tr.tumbling(0) && player.sprite.rotation === 0 && !slot.shadow.visible && Math.abs(slot.hit.safe - cfg.invulnerable) < 0.1 && player.body.collisionFilter.mask === PLAYER_MASK);
    // invulnerable: the bus right on top of it does nothing
    place(player, bus.x + 30, bus.y);
    assert('a bus touching it now would be a hit', classifyHit(bus.x, bus.y, bus.heading, bus.kcfg.length, bus.kcfg.width, bus.kcfg.zone, cfg.kinds.bus, player.x, player.y, 5) === 'front');
    step(10);
    assert('invulnerable after the get-up: no chain hit', hits().length === 1 && !tr.tumbling(0), `${hits().length}`);
    // stun: slowed down while it keeps running
    place(player, T(7), T(51));
    const cap = player.profiles.foot.maxSpeed * player.move.speedMult;
    intent.move.x = 1;
    let top = 0;
    for (let i = 0; i < 45; i++) { step(1); top = Math.max(top, player.move.velSpeed); }
    assert('for a while it only limps along at a fraction of its top speed', slot.hit.stun > 0 && top > 4 && top <= cap * (cfg.stun.speedMult + 0.15), `${top.toFixed(0)} of ${cap.toFixed(0)}`);
    intent.move.x = 0;
    // the spilled coins can be collected again
    const money1 = ctx.state.shared.money;
    for (const c of coins) { place(player, c.x, c.y); step(2); }
    assert('walking over the spilled coins gets the money back (loot:collected)', ctx.state.shared.money === money0 && of('loot:collected').filter(e => e.kind === 'coin').length >= coins.length && money1 === money0 - lost, `${ctx.state.shared.money} of ${money0}`);
    until(() => idle(player), 200);
    // after the window it can be hit again; this time the coins are left to expire
    setBus(420);
    place(player, bus.x + 90, bus.y);
    until(() => hits().length > 1, 200);
    const second = hits()[1];
    assert('once the window is over a bus hits again (second traffic:hit)', second && second.player === 0 && hits().length === 2 && second.lost > 0);
    const left = ctx.loot.items.filter(i => i.active && i.kind === 'coin').length;
    step(60 * 3);
    ctx.state.dispatch('wallet.earn', { cents: 1, reason: 'smoke' });
    until(() => idle(player), 400);
    place(player, T(7), T(51));
    step(60 * 21);
    assert('coins nobody picks up are gone after 20 s', left >= 3 && ctx.loot.items.filter(i => i.active && i.kind === 'coin').length === 0);
    const bodies0 = bodies();
    const children0 = gs.children.list.length;

    // ---- a slow bus touching a kid does not hit
    calm();
    setBus(420);
    bus.speed = bus.cruise = 10;
    place(player, bus.x + 35, bus.y);
    const touching = classifyHit(bus.x, bus.y, bus.heading, bus.kcfg.length, bus.kcfg.width, bus.kcfg.zone, cfg.kinds.bus, player.x, player.y, 5);
    const n0 = hits().length;
    step(30);
    assert('a bus creeping below the speed threshold touches without a hit', touching === 'front' && hits().length === n0 && !tr.tumbling(0), `${touching}`);
    bus.speed = bus.cruise = speed0;

    // ---- pedestrian and dog next to the bus: untouched, the pedestrian steps aside early
    calm();
    setBus(420);
    for (const p of ctx.players) place(p, bus.x + 40, bus.y - 80); // the view (and so the pedestrian) stays near the road
    gs.snapCamera();
    ctx.crowd.fill(true);
    const npc = ctx.crowd.list.find(n => n.active && !n.sitting);
    const dog = ctx.dogs.spawn(bus.x + 150, bus.y + 6, 'CALM');
    gs.matter.body.setPosition(npc.body, { x: bus.x + 70, y: bus.y + 6 });
    npc.cool = 0;
    npc.state = 'WALK';
    const reacts = of('npc:react').length;
    const dogAt = { x: dog.x, y: dog.y };
    let fastest = 0;
    forced.length = 0;
    for (let i = 0; i < 90; i++) { step(1); fastest = Math.max(fastest, Math.hypot(npc.body.velocity.x, npc.body.velocity.y) * 60); }
    assert('a bus coming up behind a pedestrian makes it step aside early (npc:react, REACT state)', of('npc:react').length > reacts && npc.active, `${of('npc:react').length - reacts}`);
    assert('the bus drove through without hitting anybody: the pedestrian was never shoved, the dog did not move, no force touched people or animals', hits().length === n0 && fastest < 130 && Math.hypot(dog.x - dogAt.x, dog.y - dogAt.y) < 0.5 && dog.active && !forced.some(c => [CAT.NPC, CAT.ANIMAL, CAT.BULLY].includes(c)), `${fastest.toFixed(0)} px/s, forces ${forced.length}`);
    dog.deactivate?.();
    assert('the bus bodies are sensors: they never collide with pedestrians or animals', grabs.pool.every(t => t.body.isSensor && !(t.body.collisionFilter.mask & (CAT.NPC | CAT.ANIMAL))));

    // ---- riding into the side hits; the vehicle is flung off and lies there to be mounted again
    for (const [id, ride, give] of [['bike', gs.bikes, p => gs.bikes.giveBike(p)], ...gs.rollers.map(ride => [ride.id, ride, p => ride.giveBoard(p)])]) {
      calm();
      give(player);
      player.move.speedMult = 1; // the timing of the crossing is tuned for the plain profile speed, whoever the kid is
      step(2);
      const item = ride.riders[0].mounted;
      setBus(420);
      place(player, bus.x + 45, bus.y + 45, 110, -Math.PI / 2);
      intent.move.y = -1;
      const before = hits().length;
      const when = until(() => hits().length > before, 120);
      intent.move.y = 0;
      const e = hits()[before];
      const at = { x: item.x, y: item.y };
      assert(`${id}: riding into the side of the bus hits (traffic:hit side) and throws the kid off`, when >= 0 && e.kind === 'side' && e.speed > cfg.minSpeed && player.vehicle === 'foot' && tr.tumbling(0), `${e?.kind} ${e?.speed?.toFixed(0)} player ${player.x | 0},${player.y | 0} v ${player.move.velSpeed | 0} bus ${bus.x | 0},${bus.y | 0} ${player.vehicle}`);
      step(70);
      const rest = { x: item.x, y: item.y };
      step(6);
      assert(`${id}: the ${id} was flung off and slid away to a stop where it lies on the ground`, item.visible && Math.hypot(rest.x - at.x, rest.y - at.y) > 20 && Math.hypot(item.x - rest.x, item.y - rest.y) < 0.01 && !ride.isMounted(0) && ride.parked.includes(item), `${Math.hypot(rest.x - at.x, rest.y - at.y).toFixed(0)} px`);
      until(() => idle(player), 400);
      place(player, item.x, item.y);
      intent.interact = true;
      step(1);
      intent.interact = false;
      assert(`${id}: after getting up the kid mounts it again`, player.vehicle === id && ride.isMounted(0) && !item.visible,
        JSON.stringify({vehicle:player.vehicle,distance:Math.hypot(player.x-item.x,player.y-item.y),near:rides.map(r=>({id:r.id,...r.nearest(player)})).map(r=>({id:r.id,dist:r.dist})),grabs:grabs.claims(0)}));
      onFoot(player);
    }

    // ---- the rear grab zone is safe, the grab still works
    calm();
    gs.skates.giveBoard(player);
    step(2);
    setBus(420);
    grabs.random = () => 0.999;
    const n1 = hits().length;
    place(player, bus.x - bus.kcfg.length / 2 - 40, bus.y, 210, 0);
    intent.move.x = 1;
    let zone = 0;
    let zoneHit = false;
    for (let i = 0; i < 40; i++) {
      step(1);
      if (inRearZone(bus.x, bus.y, bus.heading, bus.kcfg.length, grab.targets.bus.zone, player.x, player.y)) { zone++; if (hits().length > n1) zoneHit = true; }
    }
    assert('skating fast through the rear zone does not hit (the zone is safe)', zone >= 3 && !zoneHit, `${zone} frames in the zone`);
    calm();
    gs.skates.giveBoard(player);
    step(2);
    setBus(420);
    place(player, bus.x - bus.kcfg.length / 2 - 25, bus.y, bus.speed, 0);
    intent.hold = true;
    step(20);
    assert('hanging on to the bus from behind works as before: no hit, towed along', player.grabbing && hits().length === n1 && !tr.tumbling(0) && of('grab:start').length >= 1 && Math.abs(player.move.velSpeed - speed0) < speed0 * 0.1);
    const afterGrab = hits().length;
    step(40);
    assert('the whole ride stays hit-free', player.grabbing && hits().length === afterGrab);
    intent.hold = false;
    intent.move.x = 0;
    step(4);
    grabs.random = Math.random;
    onFoot(player);

    // ---- co-op: players are hit independently; a pinned or caught player is not hit
    calm();
    setBus(420);
    place(player, bus.x + 90, bus.y);
    until(() => tr.tumbling(0), 200);
    assert('co-op: only the kid in front of the bus is hit, the other one far away is untouched', of('traffic:hit').at(-1).player === 0 && !tr.tumbling(1) && slotOf(p2).hit.safe === 0);
    step(25);
    setBus(420);
    place(p2, bus.x + 90, bus.y);
    until(() => tr.tumbling(1), 200);
    assert('the second kid is hit on its own while the first one is further along in its own tumble timeline', of('traffic:hit').at(-1).player === 1 && tr.tumbling(0) && slotOf(player).hit.phase > slotOf(p2).hit.phase, `${slotOf(player).hit.phase} vs ${slotOf(p2).hit.phase}`);
    until(() => idle(player) && idle(p2), 600);
    setBus(420);
    place(p2, T(7), T(51));
    place(player, bus.x + 40, bus.y);
    player.pinned = true;
    const n2 = hits().length;
    step(10);
    player.pinned = false;
    assert('a pinned (caught) kid is not hit', hits().length === n2 && !tr.tumbling(0));
    setBus(420);
    place(player, bus.x + 90, bus.y);
    until(() => tr.tumbling(0), 200);
    step(20);
    gs.caught.trigger(0);
    assert('being caught while tumbling ends the tumble cleanly (upright, normal collisions)', !tr.tumbling(0) && player.sprite.rotation === 0 && player.body.collisionFilter.mask === PLAYER_MASK && !slotOf(player).shadow.visible);
    gs.caught.respawn(0);
    until(() => idle(player), 400);

    // ---- everything is cleaned up, nothing leaked or pushed
    calm();
    step(120);
    assert('the bubbles, flung vehicles and tumbles are all over; no bodies leaked', live('trafficBubbles') === 0 && live('traffic-slides') === 0 && !ctx.players.some(p => tr.tumbling(p.index)) && bodies() === bodies0, `bodies ${bodies0} -> ${bodies()}`);
    assert('no body force was applied to people or animals during the whole scenario', !forced.some(c => [CAT.NPC, CAT.ANIMAL, CAT.BULLY].includes(c)), `${forced.length} forces`);
    assert('the display list only grew by the lying vehicles of the kids', gs.children.list.length - children0 < 14, `${gs.children.list.length - children0}`);

    for (const [n, fn] of handlers) ctx.events.off(n, fn);
    Body.applyForce = applyForce;
    ctx.particles.emit = emit;
    bus.speed = speed0;
    other.speed = speed0;
    grabs.pool.forEach((t, i) => { t.speed = t.cruise = cruises[i]; delete t.testNoYield; });
    game.trafficOff = true;
    tr.enabled = false;
    ctx.crowd.clear();
    for (const p of ctx.players) { onFoot(p); p.move.stamina = 1; }
    for (const svc of [gs.parking, ...rides]) { svc.unloadMap(); svc.loadMap(); }
    calm();
  }
};
