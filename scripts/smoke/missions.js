// Smoke scenario: the missions of stories 9.7 and 9.8 (grandma's eggs, the stolen bike, the lost homework, the races,
// the Kirmes range and the friendship arc) on the quest runner.
// Registered in scripts/smoke/index.js. Puts state, screens and the player back.
import { wantedKinds } from '../../ai/chaseLogic.js';

export const missions = {
  name: 'missions',
  run(game, assert, env) {
    const { step, ctx, gs, ui, player } = env;
    const q = ctx.quests;
    const log = [];
    for (const n of ['mission:started', 'mission:step', 'mission:done', 'mission:failed', 'ui:toast', 'homework:done']) ctx.events.on(n, e => log.push([n, e]));
    const count = (n, pred = () => true) => log.filter(e => e[0] === n && pred(e[1])).length;
    const top = () => ui.screens.top();
    const ts = ctx.map.tileSize;
    const data0 = ctx.state.data;
    const home0 = { x: player.x, y: player.y, vehicle: player.vehicle };
    const arrow = ui.hud.get('objective').arrow;
    const tap = () => { step(1); env.press('jump'); };
    const go = (tx, ty) => { player.teleport((tx + 0.5) * ts, (ty + 0.5) * ts); gs.snapCamera(); step(3); };
    const active = id => ctx.state.shared.quests.active.find(e => e.id === id);
    const reset = (patch = {}) => { ui.screens.clear(); ctx.state.replace({ ...ctx.state.data, shared: { ...ctx.state.shared, quests: { active: [], done: [] }, ...patch } }); step(2); };
    for (const ride of gs.mountables) if (ride.isMounted(0)) ride.dismount(player);
    reset();

    // ---- grandma: the eggs break, the mission fails kindly and can be played again
    q.start('grandma');
    tap();
    assert('the call starts the mission with three eggs of lives', !!active('grandma') && active('grandma').lives === 3 && count('mission:started', e => e.id === 'grandma') === 1);
    q.onEvent('traffic:hit', { player: 0 }); // straight to the runner: the real event would also upset the chase
    assert('before the groceries are picked up nothing can break', active('grandma').lives === 3);
    go(36, 87);
    assert('the groceries are picked up: next, grandma', active('grandma').step === 1 && arrow.quest?.id === 'grandma');
    q.onEvent('traffic:hit', { player: 0 }); // straight to the runner: the real event would also upset the chase
    assert('a bump costs an egg and a toast says how many are left', active('grandma').lives === 2 && count('ui:toast', e => e.key === 'mission.grandma.hit' && e.params.n === 2) === 1);
    q.onEvent('player:caught', { player: 0 }); // straight to the runner: the real event would also upset the chase
    q.onEvent('bully:bump', {}); // straight to the runner: the real event would also upset the chase
    assert('with no eggs left the mission fails, kindly, and is not done', !active('grandma') && count('mission:failed', e => e.id === 'grandma') === 1 && !ctx.state.shared.quests.done.includes('grandma') && top()?.id === 'message');
    tap();
    go(10, 51); // away from the pick-up, so the new run starts at its first step
    q.start('grandma');
    tap();
    assert('it can be started again with fresh eggs', active('grandma')?.lives === 3 && active('grandma').step === 0, JSON.stringify(ctx.state.shared.quests));
    go(36, 87);
    const money0 = ctx.state.shared.money;
    go(14, 12);
    assert('delivering the groceries pays the reward', count('mission:done', e => e.id === 'grandma' && e.kind === 'help') === 1 && ctx.state.shared.money === money0 + 500 && ctx.state.shared.quests.done.includes('grandma'), `${money0} -> ${ctx.state.shared.money}`);
    tap();

    // ---- the stolen bike: the theft starts it, the arrow follows the hideout, recovering it ends it
    reset();
    const hx = 20;
    const hy = 21;
    ctx.state.dispatch('flags.set', { key: 'stolenBike', value: { hideout: 'smoke', x: (hx + 0.5) * ts, y: (hy + 0.5) * ts, bikeId: 'bike1', map: ctx.world.id } });
    ctx.events.emit('mission:trigger', { id: 'stolen-bike' });
    assert('the theft starts the rescue by itself with a phone toast and without freezing the world', !!active('stolen-bike') && count('mission:started', e => e.id === 'stolen-bike') === 1 && !top() && !ctx.frozen && count('ui:toast', e => e.key === 'mission.stolen-bike.intro' && e.style === 'phone') === 1);
    assert('the arrow follows the hideout', arrow.quest?.id === 'stolen-bike' && Math.abs(arrow.gx - (hx + 0.5) * ts) < 1 && Math.abs(arrow.gy - (hy + 0.5) * ts) < 1);
    const m1 = ctx.state.shared.money;
    ctx.events.emit('bike:recovered', { player: 0, bikeId: 'bike1', hideoutId: 'smoke' });
    assert('getting the bike back ends the mission with its reward and a phone toast, again without a screen', count('mission:done', e => e.id === 'stolen-bike') === 1 && ctx.state.shared.money === m1 + 100 && !active('stolen-bike') && !top() && !ctx.frozen && count('ui:toast', e => e.key === 'mission.stolen-bike.done' && e.style === 'phone') === 1);
    step(1);
    ctx.state.dispatch('flags.set', { key: 'stolenBike', value: null });

    // ---- the lost homework: search with the stick, bring it to school
    reset();
    const ordnung0 = ctx.state.players[0].kopfnoten.ordnung;
    q.start('lost-homework');
    tap();
    assert('the hunt starts at the search step', active('lost-homework')?.step === 0 && arrow.quest?.id === 'lost-homework');
    ctx.events.emit('homework:found', { player: 0 });
    assert('finding the homework moves on to school', active('lost-homework').step === 1);
    go(78, 13);
    assert('handing it in finishes the mission and raises Ordnung', count('mission:done', e => e.id === 'lost-homework') === 1 && count('homework:done') === 1 && ctx.state.players[0].kopfnoten.ordnung > ordnung0, `${ordnung0} -> ${ctx.state.players[0].kopfnoten.ordnung}`);
    tap();
    go(10, 51);
    reset({ flags: { ...ctx.state.shared.flags, lostHomeworkFound: true } });
    q.start('lost-homework');
    tap();
    assert('when the homework was found earlier the hunt starts at the hand-in', active('lost-homework')?.step === 1, JSON.stringify([ctx.state.shared.quests, ctx.state.shared.flags.lostHomeworkFound]));

    // ---- the skate race: gates in order on wheels, within the time
    reset();
    const raceOf = id => q.cfg.missions.find(m => m.id === id).steps[1].race;
    const gates = id => raceOf(id).points;
    const skateRace = raceOf('skate-race');
    gs.skateboards.giveBoard(player);
    q.start('skate-race');
    tap();
    go(50, 37);
    assert('rolling to the start line begins the race: the arrow shows the first gate and a clock', active('skate-race')?.step === 1 && arrow.quest?.live && arrow.questLine.text.includes('1/4') && arrow.questLine.text.includes('s)'), arrow.questLine.text);
    step(30);
    go(50, 43);
    assert('a gate out of order does not count', arrow.questLine.text.includes('1/4'), arrow.questLine.text);
    const moneyRace = ctx.state.shared.money;
    for (const [x, y] of gates('skate-race')) go(x, y);
    assert('all gates in time win the race, the reward and the prize vehicle event', count('mission:done', e => e.id === 'skate-race') === 1 && ctx.state.shared.money === moneyRace + 250 && log.some(e => e[0] === 'mission:done' && e[1].id === 'skate-race'), `${moneyRace} -> ${ctx.state.shared.money}`);
    tap();
    reset();
    q.start('skate-race');
    tap();
    go(50, 37);
    step(60 * (skateRace.seconds + 10)); // the harness runs a few percent fewer frames than the wall clock says
    assert('with the clock run out the race is lost, kindly, and can be started again', !active('skate-race') && count('mission:failed', e => e.id === 'skate-race') === 1 && top()?.id === 'message' && !ctx.state.shared.quests.done.includes('skate-race'), JSON.stringify({ q: ctx.state.shared.quests, race: q.race, top: top()?.id, failed: count('mission:failed'), frozen: ctx.frozen }));
    tap();
    q.start('skate-race');
    tap();
    assert('and the next try starts with a fresh clock', active('skate-race')?.step === 0);

    // ---- the bike race wants the bike
    reset();
    gs.skateboards.giveBoard(player);
    q.start('bike-race');
    tap();
    go(44, 53);
    go(60, 53);
    assert('a skateboard does not count in the bike race', active('bike-race')?.step === 1 && arrow.questLine.text.includes('1/5'), arrow.questLine.text);
    for (const [x, y] of gates('bike-race')) go(x, y);
    assert('all gates on a skateboard still do not win the bike race (the bike counts: see check-quests)', !!active('bike-race') && !ctx.state.shared.quests.done.includes('bike-race') && count('mission:done', e => e.id === 'bike-race') === 0);

    // ---- the Kirmes range: five cans with the slingshot near the stall, nothing else counts
    reset();
    for (const ride of gs.mountables) if (ride.isMounted(0)) ride.dismount(player);
    q.start('kirmes-range');
    tap();
    go(5, 40);
    assert('at the stall the shooting starts', active('kirmes-range')?.step === 1);
    const can = (x, y, source = 'slingshot', kind = 'can') => ({ prop: { kind, body: { position: { x: (x + 0.5) * ts, y: (y + 0.5) * ts } } }, source });
    q.onEvent('prop:hit', can(4, 35, 'bike'));
    q.onEvent('prop:hit', can(40, 20));
    assert('cans hit by something else or far from the stall do not count', count('ui:toast', e => e.key === 'quest.count') === 0 && active('kirmes-range').step === 1);
    for (const [x, y] of [[2, 35], [4, 35], [6, 35], [8, 35]]) q.onEvent('prop:hit', can(x, y));
    assert('every hit says how many are down', count('ui:toast', e => e.key === 'quest.count' && e.params.total === 5) === 4);
    const moneyK = ctx.state.shared.money;
    q.onEvent('prop:hit', can(3, 37));
    assert('the fifth can ends the mission with its prize', count('mission:done', e => e.id === 'kirmes-range') === 1 && ctx.state.shared.money === moneyK + 400);
    tap();

    // ---- the friendship arc: three missions in order, each one leaves a bully out of the chase
    reset();
    const kindsAt = lvl => wantedKinds(ctx.chase.cfg.level, lvl, false, 3, ctx.state.shared.flags.friendship ?? 0).length;
    assert('without friends the chase wants its usual bullies', kindsAt(1) === 1 && kindsAt(2) === 3);
    assert('the second mission cannot start before the first is done', !q.start('friendship-2') && !active('friendship-2'));
    q.start('friendship-1');
    tap();
    q.onEvent('loot:collected', { kind: 'coin' });
    q.onEvent('loot:collected', { kind: 'candy' });
    assert('only candy counts for the peace offering', active('friendship-1').step === 0);
    q.onEvent('loot:collected', { kind: 'candy' });
    assert('two candies move on to the skatepark', active('friendship-1').step === 1);
    go(52, 41);
    tap();
    assert('the first friendship is saved and a bully is measurably left out of the low chase', ctx.state.shared.flags.friendship === 1 && kindsAt(1) === 0 && kindsAt(2) === 2, `${kindsAt(1)} ${kindsAt(2)}`);
    q.start('friendship-2');
    tap();
    q.onEvent('lesson:completed', {});
    go(88, 17);
    tap();
    assert('the second one: a lesson, then the schoolyard', ctx.state.shared.flags.friendship === 2 && kindsAt(2) === 1, `${ctx.state.shared.flags.friendship}`);
    q.start('friendship-3');
    tap();
    for (let i = 0; i < 3; i++) q.onEvent('bike:bell', { player: 0 });
    go(50, 37);
    tap();
    assert('the third makes them friends: at the highest Aerger one bully still comes', ctx.state.shared.flags.friendship === 3 && kindsAt(2) === 1 && kindsAt(1) === 0 && ctx.state.shared.quests.done.includes('friendship-3'));

    // ---- put everything back
    ui.screens.clear();
    ctx.state.replace(data0);
    for (const pl of ctx.players) ctx.characters.refresh(pl); // the speed modifiers follow the restored attributes (a replace does not refresh them)
    ctx.events.emit('state:changed', { path: 'shared.quests', action: 'smoke' });
    player.teleport(home0.x, home0.y);
    if (home0.vehicle === 'bike') gs.bikes.giveBike(player);
    else if (home0.vehicle === 'skateboard') gs.skateboards.giveBoard(player);
    else if (home0.vehicle === 'skates') gs.skates.giveBoard(player);
    gs.snapCamera();
    step(3);
    assert('the missions scenario leaves the world running and nothing open', !ctx.frozen && ctx.state.shared.quests.active.length === 0 && !arrow.quest);
  }
};
