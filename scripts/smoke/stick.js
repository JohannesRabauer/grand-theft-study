// Smoke scenario: the stick and its targets (story 6.2, AD-24). Registered in scripts/smoke/index.js.
// Q/E reaches the stick (HUD "Stock"), a swing smashes a box and a crate (debris, coin loot that goes into the wallet when collected),
// shakes bushes until they drop their daily loot (wallet coins, the lost-homework flag, slingshot ammo, a sticker event; once per
// day), flings a cone, rings a doorbell (Ding-Dong, the neighbor steps out, shouts, chases, gives up laughing; a second ring by
// interact lets him catch the player harmlessly), bursts the pinata after its hits, and a slingshot shot pops a kirmes balloon
// that respawns. A swing aimed at a pedestrian, a bully and a dog right in front of the player hits nothing and changes nothing.
export const stick = {
  name: 'stick',
  run(game, assert, env) {
    const { h, step, until } = env;
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
    const belt = player.toolbelt;
    const tool = belt.tools.find(t => t.id === 'stick');
    const cfg = gs.cache.json.get('tool').stick;
    const ncfg = gs.cache.json.get('neighbors');
    const T = t => h.tilePx(ctx, t);
    const { state } = ctx;
    const log = [];
    for (const n of ['stick:hit', 'tool:swing', 'prop:hit', 'prop:broken', 'bush:loot', 'sticker:found', 'homework:found', 'loot:collected', 'doorbell:ring', 'neighbor:alert', 'neighbor:caught', 'neighbor:giveup', 'pinata:hit', 'pinata:burst', 'balloon:popped', 'ammo:pickup']) ctx.events.on(n, e => log.push([n, e]));
    const of = n => log.filter(e => e[0] === n).map(e => e[1]);
    const money = () => state.shared.money;
    const flags = () => state.shared.flags;
    const text = () => ui.hud.get('tool').tool.text;
    const bubbles = () => ctx.swingTargets.doorbell.bubbles.items.filter(b => b.owner).map(b => b.text.text);
    const emitterAlive = name => ctx.particles.emitters[name].emitter.getAliveParticleCount();
    const standAt = (x, y, frames = 12) => {
      gs.matter.body.setPosition(player.body, { x, y });
      gs.matter.body.setVelocity(player.body, { x: 0, y: 0 });
      player.move.speed = player.move.velSpeed = 0;
      player.sprite.setPosition(x, y);
      gs.cameras.main.centerOn(x, y);
      step(frames);
    };
    const swing = (tx, ty) => {
      intent.aim = { x: tx, y: ty };
      intent.toolUse = true;
      step(1);
      intent.toolUse = false;
      step(Math.ceil(cfg.cooldown * 60) + 1);
    };
    // collect everything lying around: walk onto each active drop
    const collectAll = () => {
      step(Math.ceil(ctx.loot.cfg.popSeconds * 60) + 2); // they land first
      for (const it of ctx.loot.items.filter(i => i.active)) {
        standAt(it.x, it.y, 2);
        step(2);
      }
    };
    ctx.chase.reset();
    player.mods.spread = 0;
    for (const s of [gs.bikes, gs.skateboards, gs.skates]) if (s.isMounted(0)) s.dismount(player); // the start vehicle of the character: interact would dismount it
    step(2);

    // ---- Q/E reaches the stick, HUD says Stock
    assert('the stick is the third tool of the belt', belt.tools[2] === tool && belt.tools.length === 3);
    belt.cycle(1);
    belt.cycle(1);
    assert('two steps on the belt select the stick', belt.current === tool);
    assert('HUD shows "Stock" and ready', text() === ctx.t('hud.toolStatus', { name: ctx.t('tool.stick'), status: ctx.t('tool.status.ready') }) && text().startsWith('Stock'), text());

    // ---- a cone is flung
    const cone = ctx.props.props.find(p => p.kind === 'cone' && p.id === 'p1');
    const coneStart = { x: cone.body.position.x, y: cone.body.position.y };
    standAt(coneStart.x - 14, coneStart.y);
    const hitsBefore = of('stick:hit').length;
    intent.aim = { x: coneStart.x, y: coneStart.y };
    intent.toolUse = true;
    step(1);
    intent.toolUse = false;
    step(3);
    const drawing = tool.fxOn && tool.swing > 0;
    step(Math.ceil(cfg.cooldown * 60));
    assert('the swoosh is drawn during the swing and cleared afterwards', drawing && !tool.fxOn && tool.swing === 0);
    assert('a swing emits tool:swing and hits the cone', of('tool:swing').length === 1 && of('stick:hit').length === hitsBefore + 1 && of('stick:hit').at(-1).kind === 'prop', JSON.stringify(of('stick:hit').at(-1)));
    assert('prop:hit comes from the stick', of('prop:hit').some(e => e.source === 'stick' && e.player === 0));
    step(20);
    assert('the cone flies away from the player', Math.hypot(cone.body.position.x - coneStart.x, cone.body.position.y - coneStart.y) > 12 && cone.body.position.x > coneStart.x, `${(cone.body.position.x - coneStart.x).toFixed(1)} px`);

    // ---- a cardboard box: one swing, paper scraps and maybe a coin
    const box = ctx.props.props.find(p => p.kind === 'box' && p.id === 'p26');
    const bx = box.body.position.x;
    const by = box.body.position.y;
    ctx.loot.rng = () => 0; // always hides a coin
    standAt(bx - 14, by);
    const cash0 = money();
    swing(bx, by);
    assert('one swing smashes the box: prop:broken, paper scraps in the air', !box.alive && of('prop:broken').some(e => e.prop === box && e.source === 'stick') && emitterAlive('paper') > 0, `alive ${box.alive}, paper ${emitterAlive('paper')}`);
    const coinDrop = ctx.loot.items.find(i => i.active && i.kind === 'coin');
    assert('it hid a coin: a collectible drop pops out', !!coinDrop);
    step(40);
    standAt(coinDrop.x, coinDrop.y, 4);
    assert('walking over the coin puts the cents in the wallet', money() > cash0 && of('loot:collected').some(e => e.kind === 'coin' && e.cents === money() - cash0), `${money() - cash0} cents`);

    // ---- a crate takes two swings, wood splinters
    const crate = ctx.props.props.find(p => p.kind === 'crate' && p.id === 'p10');
    const cx = crate.body.position.x;
    const cy = crate.body.position.y;
    standAt(cx - 16, cy);
    swing(cx, cy);
    assert('the first swing dents the crate: it is still there', crate.alive && crate.hp === 1, `hp ${crate.hp}`);
    swing(crate.body.position.x, crate.body.position.y);
    assert('the second smashes it: wood splinters', !crate.alive && emitterAlive('debris') > 0 && of('prop:broken').some(e => e.prop === crate), `alive ${crate.alive}`);
    ctx.loot.unloadMap();

    // ---- bushes: whack three times for the daily drop
    const bushes = ctx.swingTargets.bush;
    const bush = id => bushes.items.find(b => b.id === id);
    const whack3 = b => {
      standAt(b.x + 14, b.y, 6);
      for (let i = 0; i < 3; i++) swing(b.x, b.y);
    };
    const day = state.shared.clock.day;
    const b1 = bush('bush-1');
    bushes.rng = () => 0; // first table entry: coins
    const cash1 = money();
    swing(b1.x, b1.y);
    whack3(b1);
    assert('whacking a bush shakes it and throws leaves', of('bush:loot').length === 1 && emitterAlive('leaves') > 0, `${of('bush:loot').length} drops`);
    assert('the third whack dropped coins, the bush is flagged for today', of('bush:loot')[0].item === 'coins' && flags()[b1.flag] === day, JSON.stringify(of('bush:loot')[0]));
    collectAll();
    assert('the coins go through wallet.earn', money() > cash1, `${money() - cash1} cents`);
    const loots = of('bush:loot').length;
    whack3(b1);
    assert('a bush gives out only once per day: more whacks only shake it', of('bush:loot').length === loots && ctx.loot.items.every(i => !i.active), `${of('bush:loot').length - loots} more`);
    const b2 = bush('bush-2');
    bushes.rng = () => 0.6; // homework (garden table: 58 to 64 percent)
    whack3(b2);
    assert('a bush can hide the lost homework', of('bush:loot').at(-1).item === 'homework' && !flags().lostHomeworkFound);
    collectAll();
    assert('collecting it sets flags.lostHomeworkFound and homework:found', flags().lostHomeworkFound === true && of('homework:found').length === 1);
    const b3 = bush('bush-3');
    bushes.rng = () => 0.4; // ammo (garden table: 30 to 50 percent)
    const sling = belt.tools.find(t => t.id === 'slingshot');
    sling.ammo = 2;
    whack3(b3);
    collectAll();
    assert('ammo from a bush refills the slingshot', of('bush:loot').at(-1).item === 'ammo' && sling.ammo > 2 && of('ammo:pickup').length >= 1, `ammo ${sling.ammo}`);
    const b4 = bush('bush-4');
    bushes.rng = () => 0.55; // sticker
    whack3(b4);
    collectAll();
    assert('a sticker emits sticker:found (stub for epic 10)', of('sticker:found').length === 1 && of('sticker:found')[0].source === 'bush');
    sling.ammo = sling.cfg.startAmmo;

    // ---- doorbell: swing, Ding-Dong, the ding-dong-run
    const bell = ctx.swingTargets.doorbell.items[0];
    standAt(bell.x, bell.walkY);
    const ringsBefore = of('doorbell:ring').length;
    swing(bell.x, bell.y);
    assert('swinging at the bell rings it (doorbell:ring with the house)', of('doorbell:ring').length === ringsBefore + 1 && of('doorbell:ring').at(-1).houseId === bell.houseId && of('doorbell:ring').at(-1).player === 0);
    assert('a "Ding-Dong!" bubble shows', bubbles().includes(ctx.t('stick.ding')), bubbles().join('|'));
    const wait = until(() => of('neighbor:alert').length === 1, 120);
    assert('the door opens and neighbor:alert follows', wait >= 0 && of('neighbor:alert')[0].houseId === bell.houseId && bell.door.texture.key === 'door-open', `${wait}`);
    assert('the neighbor steps out as a pooled sprite and shouts', ctx.pools.byName.get('neighbors').live() === 1 && bell.neighbor.sprite.visible && bubbles().includes(ctx.t('stick.neighborShout')), bubbles().join('|'));
    const nb0 = { x: bell.neighbor.x, y: bell.neighbor.y };
    gs.matter.body.setPosition(player.body, { x: nb0.x + 90, y: nb0.y });
    player.sprite.setPosition(nb0.x + 90, nb0.y);
    step(60);
    const gap = Math.hypot(player.x - bell.neighbor.x, player.y - bell.neighbor.y);
    assert('he chases at walking speed (slower than a sprint)', gap < 90 && bell.neighbor.x - nb0.x > 20 && bell.neighbor.x - nb0.x < ncfg.speed * 1.5 + 2, `moved ${(bell.neighbor.x - nb0.x).toFixed(1)} px`);
    standAt(nb0.x + 400, nb0.y, 1);
    const gave = until(() => of('neighbor:giveup').length === 1, 600);
    assert('after about six seconds he gives up and laughs', gave >= 0 && bubbles().includes(ctx.t('stick.neighborLaugh')), `${gave}`);
    const done = until(() => !bell.neighbor, 240);
    assert('then he goes back in: sprite pooled again, door shut', done >= 0 && ctx.pools.byName.get('neighbors').live() === 0 && bell.door.texture.key === 'door-closed');

    // interact next to another bell; stand still and he catches the player harmlessly
    const bell2 = ctx.swingTargets.doorbell.items[1];
    standAt(bell2.x, bell2.walkY);
    const cash2 = money();
    intent.interact = true;
    step(1);
    intent.interact = false;
    assert('pressing interact next to a bell rings it too', of('doorbell:ring').at(-1).houseId === bell2.houseId);
    const caught = until(() => of('neighbor:caught').length === 1, 240);
    assert('standing still: "Erwischt!" and nothing else happens', caught >= 0 && bubbles().includes(ctx.t('stick.neighborCaught')) && !player.pinned && money() === cash2, `${caught}`);
    step(Math.ceil((ncfg.timing.giveUpSeconds + 0.5) * 60));
    assert('he laughs and goes home', !bell2.neighbor && ctx.pools.byName.get('neighbors').live() === 0);

    // ---- the pinata
    const pin = ctx.swingTargets.pinata.items[0];
    standAt(pin.x, pin.y + 16);
    const hp = pin.state.max;
    for (let i = 0; i < hp - 1; i++) swing(pin.x, pin.y);
    assert('each whack wobbles it: pinata:hit, no burst yet', of('pinata:hit').length === hp - 1 && of('pinata:burst').length === 0 && pin.sprite.visible);
    swing(pin.x, pin.y);
    assert('the last whack bursts it: pinata:burst, confetti, candies, coins and a sticker', of('pinata:burst').length === 1 && !pin.sprite.visible && emitterAlive('confetti') > 0 && ctx.loot.items.filter(i => i.active && i.kind === 'candy').length === 7 && ctx.loot.items.some(i => i.active && i.kind === 'coin') && ctx.loot.items.some(i => i.active && i.kind === 'sticker'));
    assert('one burst per day: the flag holds today', flags()[pin.flag] === state.shared.clock.day);
    const cash3 = money();
    collectAll();
    assert('the candies and coins are worth a few cents, the sticker emits an event', money() - cash3 >= 7 * 5 && of('sticker:found').some(e => e.source === 'pinata'), `${money() - cash3} cents`);
    swing(pin.x, pin.y);
    assert('a burst pinata is not hit again', of('pinata:burst').length === 1 && of('pinata:hit').length === hp);

    // ---- people and animals are never touched by a swing
    standAt(T(3), T(55));
    const ex = player.x + 10;
    const placeAt = (b, dy) => { gs.matter.body.setPosition(b, { x: ex, y: player.y + dy }); gs.matter.body.setVelocity(b, { x: 0, y: 0 }); };
    const npc = ctx.crowd.list.find(n => n.active);
    const dog = ctx.dogs.spawn(ex, player.y + 4, 'CALM');
    const bully = ctx.chase.spawn('foot');
    const keep = () => { placeAt(dog.body, 4); placeAt(npc.body, -4); if (bully) placeAt(bully.body, 0); };
    keep();
    const npcState = npc.state;
    const dogBefore = { x: dog.x, y: dog.y };
    const swings = of('tool:swing').length;
    const hits0 = of('stick:hit').length;
    const propHits = of('prop:hit').length;
    intent.aim = { x: ex + 20, y: player.y };
    for (let i = 0; i < Math.ceil(cfg.cooldown * 60) + 2; i++) { keep(); intent.toolUse = i === 0; step(1); }
    intent.toolUse = false;
    assert('the swing happened but its query returned no target at all', of('tool:swing').length === swings + 1 && of('tool:swing').at(-1).hits === 0 && of('stick:hit').length === hits0 && of('prop:hit').length === propHits, JSON.stringify(of('tool:swing').at(-1)));
    assert('pedestrian, bully and dog are unchanged: no state change, no push', !!npc && !!bully && npc.state === npcState && dog.state === 'CALM' && dog.active && Math.hypot(dog.x - dogBefore.x, dog.y - dogBefore.y) < 1.5, `${npc?.state} ${dog.state}`);
    assert('the query never lists a body that is not a prop or wall', tool.hits.items.slice(0, tool.hits.n).every(i => !i.body || [0x10, 0x20].includes(i.body.collisionFilter.category)));
    ctx.dogs.unloadMap();
    ctx.chase.reset();

    // ---- kirmes balloon popped by the slingshot
    belt.cycle(1);
    assert('E wraps from the stick to the slingshot', belt.current === sling);
    const balloon = ctx.balloons.items.find(b => b.color === 'green');
    assert('balloons are PROP sensor bodies: static, sensor, in the PROP category', balloon.body.isStatic && balloon.body.isSensor && balloon.body.collisionFilter.category === 0x10);
    standAt(balloon.x, balloon.y + 80);
    const popped0 = of('balloon:popped').length;
    intent.aim = { x: balloon.x, y: balloon.y };
    intent.toolUse = true;
    step(Math.ceil(0.5 * 60));
    intent.toolUse = false;
    const popFrames = until(() => balloon.state.popped, 120);
    assert('a slingshot shot pops it: balloon:popped with the color, confetti', popFrames >= 0 && of('balloon:popped').length === popped0 + 1 && of('balloon:popped').at(-1).color === 'green' && of('balloon:popped').at(-1).player === 0 && emitterAlive('confetti') > 0, `${popFrames}`);
    assert('the popped balloon is gone and hit by nothing', !balloon.sprite.visible && balloon.body.collisionFilter.mask === 0);
    balloon.state.left = 0.05;
    step(6);
    assert('after the timeout it floats back', !balloon.state.popped && balloon.sprite.visible && balloon.body.collisionFilter.mask === 0x10 + 0x20 + 0x01 + 0x02 + 0x04 + 0x08 + 0x80);

    // ---- clean up for later scenarios
    ctx.loot.unloadMap();
    ctx.chase.reset();
    intent.aim = null;
    h.teleport(gs, ctx, 7, 51);
    step(30);
    assert('pools are back to rest: loot, neighbors and bubbles', ctx.pools.byName.get('lootDrops').live() === 0 && ctx.pools.byName.get('neighbors').live() === 0 && ctx.pools.byName.get('doorBubbles').live() === 0);
  }
};
