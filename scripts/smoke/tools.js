// Smoke scenario: throwing stick and dog fetch (story 6.1, AD-24). Registered in scripts/smoke/index.js.
// Q/E reaches the throwing stick, a calm-air throw lands at the configured distance (Kilian's perk stretches it, a crosswind shifts it,
// the HUD and aim dots follow), it topples a ball, a frisbee and a kite stuck in trees, makes the trash can's noise carry
// further, passes bully, pedestrian and dog without touching them (engine contacts are checked), is thrown only once until the
// owner walks over it again, and a spawned chasing dog fetches it, carries it back and drops it near the thrower.
export const throwingStick = {
  name: 'throwingStick',
  run(game, assert, env) {
    const { h, step, until } = env;
    // a fresh single-player run: earlier scenarios may have left co-op or a restarted scene behind
    const prev = game.scene.getScene('Game');
    prev.ctx.state.dispatch('coop.set', { on: false });
    prev.scene.restart();
    step(4);
    const gs = game.scene.getScene('Game');
    const ui = game.scene.getScene('UI');
    const ctx = gs.ctx;
    ctx.input.update = () => {};
    const intent = ctx.input.intent;
    intent.aim = null;
    const player = ctx.players[0];
    const T = t => h.tilePx(ctx, t);
    const press = key => { intent[key] = true; step(1); intent[key] = false; };
    const live = name => ctx.pools.byName.get(name).live();
    const cfg = gs.cache.json.get('tool').throwingStick;
    const belt = player.toolbelt;
    const tool = belt.tools.find(t => t.id === 'throwing-stick');
    const stick = tool.stick;
    const { surfaces } = ctx;
    const log = [];
    const count = n => log.filter(e => e[0] === n).length;
    for (const n of ['tool:throw', 'stick:landed', 'stick:pickup', 'prop:hit', 'dog:fetch-start', 'dog:fetch-done', 'tool:changed']) ctx.events.on(n, e => log.push([n, e]));
    const of = n => log.filter(e => e[0] === n).map(e => e[1]);
    const become = id => { ctx.state.dispatch('player.setCharacter', { player: 0, character: id }); ctx.characters.apply(player); player.mods.spread = 0; }; // exact aim: no Zielen scatter
    const quiet = () => { ctx.chase.reset(); intent.aim = null; intent.move.x = intent.move.y = 0; };
    const wind = ctx.wind;
    const setWind = (x, y) => { wind.update = () => {}; wind.vector.x = x; wind.vector.y = y; wind.strength = Math.hypot(x, y); };
    const free = (x, y) => !surfaces.solid(surfaces.at(x, y));
    const standAt = (x, y) => {
      gs.matter.body.setPosition(player.body, { x, y });
      gs.matter.body.setVelocity(player.body, { x: 0, y: 0 });
      player.move.speed = player.move.velSpeed = 0;
      player.sprite.setPosition(x, y);
      gs.cameras.main.centerOn(x, y);
      step(25);
    };
    // hold toolUse for `power` (0..1) towards (tx, ty), then let go
    const throwAt = (tx, ty, power) => {
      intent.aim = { x: tx, y: ty };
      intent.toolUse = true;
      step(Math.ceil(power * cfg.chargeSeconds * 60) + 1);
      intent.toolUse = false;
      step(1);
    };
    const landed = () => until(() => stick.state === 'landed', 240);
    const fetchBack = () => { // walk onto the stick lying around
      standAt(stick.x, stick.y);
      return stick.state === 'held';
    };
    quiet();
    player.mods.spread = 0;
    setWind(0, 0);

    // ---- Q/E reaches the stick, HUD says ready
    assert('the belt holds slingshot, throwing stick and stick, in that order', belt.tools.map(t => t.id).join() === 'slingshot,throwing-stick,stick');
    press('toolNext');
    assert('E selects the throwing stick', belt.current === tool && of('tool:changed').at(-1).id === 'throwing-stick');
    assert('HUD shows the stick as ready', ui.hud.get('tool').tool.text === ctx.t('hud.toolStatus', { name: ctx.t('tool.throwing-stick'), status: ctx.t('tool.status.ready') }), ui.hud.get('tool').tool.text);
    press('toolNext');
    assert('E again reaches the close-range stick', belt.current.id === 'stick');
    press('toolNext');
    assert('E once more wraps to the slingshot', belt.current.id === 'slingshot');
    press('toolPrev');
    press('toolPrev');
    assert('Q twice goes back to the throwing stick', belt.current === tool);

    // ---- a full-power throw in calm air along the open main road
    become('lorenz');
    standAt(T(3), T(55));
    const x0 = player.x;
    const y0 = player.y;
    const calmAim = () => ({ x: x0 + 100, y: y0 });
    intent.aim = calmAim();
    intent.toolUse = true;
    step(30);
    assert('charging draws the aim dots and the stick stays in the hand', live('stickDots') > 0 && stick.state === 'held' && tool.charging);
    step(34);
    intent.toolUse = false;
    step(1);
    const throw1 = of('tool:throw');
    assert('release throws: tool:throw at full power, stick in flight, ammo gone', throw1.length === 1 && throw1[0].player === 0 && throw1[0].power >= 0.99 && stick.state === 'flying' && tool.ammo === 0, JSON.stringify(throw1));
    assert('dots are gone and the HUD says in the air', live('stickDots') === 0 && ui.hud.get('tool').tool.text.includes(ctx.t('tool.status.flying')), ui.hud.get('tool').tool.text);
    step(2);
    const lift = tool.sprite.y;
    assert('the stick spins in the air with a shadow below', tool.sprite.visible && tool.sprite.rotation !== 0 && tool.shadow.y > lift && live('stick') === 1, `${lift} vs ${tool.shadow.y}`);
    intent.toolUse = true;
    step(70);
    intent.toolUse = false;
    step(1);
    assert('only one throw until it is picked up again', of('tool:throw').length === 1);
    assert('it comes down: stick:landed at the configured distance', landed() >= 0 && of('stick:landed').length === 1, `${stick.state}`);
    const d1 = of('stick:landed')[0].dist;
    assert(`calm air, full power lands ${cfg.maxRange} px away`, Math.abs(d1 - cfg.maxRange) < 4 && Math.abs(stick.y - y0) < 4, `${d1.toFixed(1)} px, dy ${(stick.y - y0).toFixed(1)}`);
    assert('it lies on the ground as a pooled sprite and the HUD says so', tool.sprite.visible && ui.hud.get('tool').tool.text.includes(ctx.t('tool.status.ground')) && live('stick') === 1);
    standAt(stick.x - 40, stick.y);
    assert('it stays on the ground while the owner is away (no lifetime)', stick.state === 'landed');
    intent.aim = null;
    assert('walking over it picks it up again', fetchBack() && of('stick:pickup').length === 1 && tool.ammo === 1 && live('stick') === 0 && !tool.sprite.visible);

    // ---- Kilian's perk stretches the throw, a crosswind shifts it
    become('kilian');
    const perk = player.perks.stickThrowRange;
    standAt(T(3), T(55));
    throwAt(player.x + 100, player.y, 1);
    landed();
    const d2 = of('stick:landed')[1].dist;
    assert(`The stickThrowRange perk ${perk} stretches it to ${(cfg.maxRange * perk).toFixed(0)} px`, perk > 1 && Math.abs(d2 - cfg.maxRange * perk) < 5, `${d2.toFixed(1)} px`);
    fetchBack();
    become('lorenz');
    setWind(0, 1);
    standAt(T(3), T(55));
    const wy0 = player.y;
    throwAt(player.x + 100, player.y, 1);
    landed();
    const drift = stick.y - wy0;
    assert('a wind from the north drifts it south', drift > 25 && drift < 70 && Math.abs(of('stick:landed')[2].dist - cfg.maxRange) < 50, `drift ${drift.toFixed(1)} px`);
    fetchBack();
    setWind(1, 0);
    standAt(T(3), T(55));
    throwAt(player.x + 100, player.y, 1);
    landed();
    assert('a tail wind carries it further', of('stick:landed')[3].dist > cfg.maxRange + 15, `${of('stick:landed')[3].dist.toFixed(1)} px`);
    fetchBack();
    setWind(0, 0);

    // ---- people and animals are never touched
    const body = tool.body;
    const touched = [];
    const watch = ev => { for (const p of ev.pairs) if (p.bodyA === body || p.bodyB === body) touched.push((p.bodyA === body ? p.bodyB : p.bodyA).collisionFilter.category); };
    gs.matter.world.on('collisionstart', watch);
    gs.matter.world.on('collisionactive', watch);
    standAt(T(3), T(55));
    const ex = player.x + 8;
    const placeAt = (b, dx) => { gs.matter.body.setPosition(b, { x: ex + dx, y: player.y }); gs.matter.body.setVelocity(b, { x: 0, y: 0 }); };
    const npc = ctx.crowd.list.find(n => n.active);
    const dog = ctx.dogs.spawn(ex + 120, player.y, 'CALM');
    const bully = ctx.chase.spawn('foot');
    const hitsBefore = count('prop:hit');
    const dogBefore = { x: dog.x, y: dog.y };
    const hold = () => { // keep them exactly on the line of flight
      placeAt(dog.body, 120);
      placeAt(npc.body, 60);
      if (bully) placeAt(bully.body, 180);
    };
    intent.aim = { x: ex + 100, y: player.y };
    intent.toolUse = true;
    for (let i = 0; i < 64; i++) { hold(); step(1); }
    intent.toolUse = false;
    const flyFrames = until(() => stick.state === 'landed', 240, hold);
    gs.matter.world.off('collisionstart', watch);
    gs.matter.world.off('collisionactive', watch);
    const d3 = of('stick:landed')[4].dist;
    assert('bully, pedestrian and dog on the flight line change nothing: lands at full range, no prop hit', !!npc && !!bully && flyFrames >= 0 && Math.abs(d3 - cfg.maxRange) < 4 && count('prop:hit') === hitsBefore, `${d3.toFixed(1)} px, hits ${count('prop:hit') - hitsBefore}`);
    assert('the engine reported no contact with anything but props or walls', touched.every(c => c === 0x10 || c === 0x20), JSON.stringify(touched));
    assert('the dog was not hurt or moved: still calm and standing on its spot', dog.active && dog.state === 'CALM' && Math.hypot(dog.x - dogBefore.x, dog.y - dogBefore.y) < 1);
    assert('the stick body is a PROJECTILE masking only props and walls', body.collisionFilter.category === 0x80 && body.collisionFilter.mask === 0);
    ctx.dogs.unloadMap();
    ctx.chase.reset();
    fetchBack();

    // ---- topples a ball, frisbees and a kite; a trash can is heard further
    // a spot `dist` px from the prop with free ground in between: where to stand, and the aim point (the prop)
    const approach = (p, dist) => {
      const px = p.body.position.x;
      const py = p.body.position.y;
      for (let a = 0; a < 16; a++) {
        const ang = (a * Math.PI) / 8;
        const sx = px + Math.cos(ang) * dist;
        const sy = py + Math.sin(ang) * dist;
        let ok = free(sx, sy);
        for (let d = 24; ok && d < dist; d += 4) ok = free(px + Math.cos(ang) * d, py + Math.sin(ang) * d);
        if (ok) return { x: sx, y: sy };
      }
      return null;
    };
    // a throw that lands on the target: a high arc flies over props lying on the ground, only the landing spot hits them
    const landingPower = dist => (dist - cfg.minRange - 4) / (cfg.maxRange - cfg.minRange);
    const shoot = (p, dist, power = 0.8) => {
      const spot = approach(p, dist);
      if (!spot) return null;
      standAt(spot.x, spot.y);
      const before = of('prop:hit').length;
      throwAt(p.body.position.x, p.body.position.y, power);
      until(() => of('prop:hit').length > before || stick.state === 'landed', 240);
      landed();
      step(5);
      return of('prop:hit').slice(before).find(e => e.prop === p) ?? null;
    };
    const frisbee = ctx.props.props.find(p => p.kind === 'frisbee' && p.body.isStatic);
    const kite = ctx.props.props.find(p => p.kind === 'kite-stuck' && p.body.isStatic);
    const ball = ctx.props.props.filter(p => p.kind === 'ball').find(p => approach(p, 130));
    const sameFrisbees = ctx.props.props.filter(p => p.kind === 'frisbee').length;
    assert('the town has two frisbees and a kite stuck in trees', sameFrisbees === 2 && !!kite && !!frisbee && surfaces.at(frisbee.body.position.x, frisbee.body.position.y) === 'tree');
    const hitF = shoot(frisbee, 110);
    fetchBack();
    assert('the stick topples the frisbee: prop:hit from the stick, it leaves its perch', !!hitF && hitF.source === 'stick' && hitF.player === 0 && !frisbee.body.isStatic, JSON.stringify(hitF && { s: hitF.source }));
    step(90);
    assert('the frisbee falls to the ground (out of the tree)', free(frisbee.body.position.x, frisbee.body.position.y), `${surfaces.at(frisbee.body.position.x, frisbee.body.position.y)}`);
    const hitK = shoot(kite, 110);
    fetchBack();
    assert('the stick brings down the kite stuck in a tree', !!hitK && !kite.body.isStatic && hitK.source === 'stick');
    step(90);
    assert('the kite ends up on the ground too', free(kite.body.position.x, kite.body.position.y));
    const bx = ball.body.position.x;
    const by = ball.body.position.y;
    const hitB = shoot(ball, 130, landingPower(130));
    fetchBack();
    assert('a ball lying on the ground is knocked away by the stick', !!hitB && Math.hypot(ball.body.position.x - bx, ball.body.position.y - by) > 3, `${hitB ? 'hit' : 'no hit'} ${Math.hypot(ball.body.position.x - bx, ball.body.position.y - by).toFixed(1)} px`);

    // a trash can: the bullies' hearing radius is bigger than the base radius
    const can = ctx.props.props.find(p => p.kind === 'trashcan');
    const base = ctx.props.cfg.kinds.trashcan.hitRadius;
    const listener = ctx.chase.spawn('foot'); // beyond the plain trash can radius, inside the thrown-stick one, not looking
    const awayX = can.body.position.x + (base + 60) * (can.body.position.x > T(48) ? -1 : 1);
    gs.matter.body.setPosition(listener.body, { x: awayX, y: can.body.position.y });
    ctx.chase.fsm.enter(listener, 'IDLE');
    listener.sees = false;
    const hitT = shoot(can, 120, landingPower(120));
    fetchBack();
    assert('the trash can clatter carries further for a thrown stick (bigger prop:hit radius)', !!hitT && hitT.radius > base && hitT.radius === base * cfg.hitRadiusMul, `${hitT && hitT.radius} vs ${base}`);

    assert('the far-away bully heard it and goes to look (DISTRACTED)', listener.state === 'DISTRACTED', listener.state);
    ctx.chase.reset();

    // ---- dog fetch: a chasing dog brings the stick back to the thrower
    quiet();
    standAt(T(3), T(55));
    const homeX = player.x;
    const homeY = player.y;
    const fetcher = ctx.dogs.spawn(homeX + 24, homeY + 10, 'CHASE');
    step(10);
    const startsBefore = of('dog:fetch-start').length;
    setWind(0, 0);
    throwAt(homeX + 100, homeY, 0.5);
    const sawCarried = { value: false, status: '' };
    const fetched = until(() => of('dog:fetch-done').length > 0, 900, () => {
      if (stick.state === 'carried' && !sawCarried.value) { sawCarried.value = true; sawCarried.status = ui.hud.get('tool').tool.text; }
    });
    const start = of('dog:fetch-start').at(-1);
    const done = of('dog:fetch-done').at(-1);
    assert('a chasing dog starts the fetch as soon as the stick lands in range', of('dog:fetch-start').length === startsBefore + 1 && start.player === 0 && start.dog === fetcher);
    assert('it picks the stick up and carries it visibly (HUD: the dog has it)', sawCarried.value && sawCarried.status.includes(ctx.t('tool.status.dog')), sawCarried.status);
    assert('dog:fetch-done: stick dropped near the thrower, lying there to collect', fetched >= 0 && done.dog === fetcher && stick.state === 'landed' && Math.hypot(stick.x - homeX, stick.y - homeY) < 24, `${fetched} frames, ${Math.hypot(stick.x - homeX, stick.y - homeY).toFixed(1)} px`);
    assert('the dog is happy: hearts burst and it is still unharmed', fetcher.active && fetcher.fetch.phase === 'HAPPY');
    step(Math.ceil(gs.cache.json.get('dogs').kinds['neighbor-dog'].fetch.happy * 60) + 20);
    assert('and then it calms down', fetcher.state === 'CALM' && !fetcher.fetch.active && stick.dog === null);
    standAt(stick.x, stick.y);
    assert('the owner collects the returned stick and can throw again', stick.state === 'held' && tool.ammo === 1);
    ctx.dogs.unloadMap();

    // a calm dog ignores the stick; the owner picking it up first cancels a fetch
    const calm = ctx.dogs.spawn(homeX + 30, homeY + 10, 'CALM');
    throwAt(homeX + 100, homeY, 0.5);
    landed();
    step(30);
    assert('a calm dog does not fetch', stick.state === 'landed' && calm.state === 'CALM' && !calm.fetch.active);
    calm.state = 'CHASE';
    step(6);
    assert('as soon as it chases, it goes for the stick', calm.state === 'FETCH');
    standAt(stick.x, stick.y);
    step(5);
    assert('the owner got there first: the dog drops out and calms down, the stick is in hand', stick.state === 'held' && calm.state === 'CALM' && stick.dog === null);
    ctx.dogs.unloadMap();

    // ---- clean up for later scenarios
    delete wind.update;
    ctx.characters.apply(player);
    ctx.chase.reset();
    h.teleport(gs, ctx, 7, 51);
    step(30);
    assert('stick and dog pools are back to rest', live('stick') === 0 && live('stickDots') === 0 && live('neighborDogs') === 0);
  }
};
