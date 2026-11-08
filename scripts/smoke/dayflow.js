// Smoke scenario: afternoon, ride home, evening and bedtime (story 8.5). Registered in scripts/smoke/index.js. Switches the clock
// to story mode for the duration and puts world, clock, chase and saves back.
export const dayFlow = {
  name: 'dayFlow',
  run(game, assert, env) {
    const { step } = env;
    const gs = game.scene.getScene('Game'); // after the quit-and-second-run scenario the shared env points at the old game: take the live one
    const ctx = gs.ctx;
    const ui = game.scene.getScene('UI');
    const player = ctx.players[0];
    ctx.input.update = () => {};
    const intent = ctx.input.intents[0];
    for (const key of ['interact', 'jump', 'pause']) intent[key] = false;
    intent.move.x = intent.move.y = 0;
    const press = key => { intent[key] = true; step(1); intent[key] = false; };
    const df = ctx.dayFlow;
    const log = [];
    for (const n of ['day:gate', 'day:bedtime', 'day:morning', 'phase:ended', 'phase:started', 'state:saved', 'state:save-failed', 'ui:toast']) ctx.events.on(n, e => log.push([n, e]));
    const count = (n, pred = () => true) => log.filter(e => e[0] === n && pred(e[1])).length;
    const top = () => ui.screens.top();
    const arrow = ui.hud.get('objective').arrow;
    const ts = ctx.map.tileSize;
    const clock = (day, minute, phase) => ctx.state.dispatch('clock.set', { day, minute, phase });
    const tap = () => { step(1); press('jump'); };
    const mem = new Map();
    const storage = ctx.saves.storage;
    ctx.saves.storage = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) }; // the real autosave, into memory only: no real save is touched
    const saved = { get length() { return count('state:saved'); } };
    const slot0 = ctx.saves.activeSlot;
    const home0 = { x: player.x, y: player.y, vehicle: player.vehicle };
    for (const ride of gs.mountables) if (ride.isMounted(0)) ride.dismount(player);
    if (ctx.world.id !== 'town') ctx.world.load('town', 'from-home');
    ctx.day.mode = 'story';
    ctx.saves.activeSlot = 1;
    df.cfg.gate.chance = 1;
    const goal = ctx.map.objects.find(o => o.type === 'goal');

    // ---- the lessons are over: the afternoon starts at the school gate, where the big kids wait
    clock(5, 11 * 60 + 40, 'school');
    player.teleport((goal.x + 1.5) * ts, (goal.y + 3.5) * ts);
    gs.snapCamera();
    step(3);
    ctx.chase.reset();
    const direct = ctx.saves.save(1);
    const savedDirect = count('state:saved');
    ctx.day.advance('lessons-complete');
    step(2);
    assert('the afternoon starts with the autosave of the phase that ended', ctx.day.phase === 'afternoon' && count('phase:ended', e => e.phase === 'school') === 1 && saved.length === 2, JSON.stringify({ direct, savedDirect, phase: ctx.day.phase, mode: ctx.day.mode, ended: count('phase:ended'), saved: saved.length, failed: count('state:save-failed'), sameBus: ctx.saves.events === ctx.events, listeners: ctx.events.listenerCount('phase:ended'), appSaves: game.registry.get('app').saves === ctx.saves, slot: ctx.saves.activeSlot, clock: ctx.day.snapshot(), df: !!df }));
    assert('the big kids wait at the school gate: the Aerger level is up with a warning', count('day:gate', e => e.day === 5) === 1 && ctx.chase.level >= 1 && count('ui:toast', e => e.key === 'day.gate') === 1, `level ${ctx.chase.level}`);
    assert('on the way home the arrow points at the front door of home', df.objective()?.id === 'go-home' && arrow.quest?.id === 'go-home' && arrow.questLine.text.length > 2 && arrow.questLine.visible, arrow.questLine.text);
    const door = ctx.map.objects.find(o => o.id === 'door-home');
    assert('...and it is really the door of home', Math.abs(arrow.gx - (door.x + 0.5) * ts) < 1 && Math.abs(arrow.gy - (door.y + 0.5) * ts) < 1);
    ctx.chase.reset();
    ctx.day.advance('smoke');
    step(2);

    // ---- no ambush when nobody is near the gate, and none at home
    clock(6, 13 * 60 + 14, 'school');
    player.teleport(8 * ts, 51 * ts);
    gs.snapCamera();
    step(3);
    ctx.chase.reset();
    const gates0 = count('day:gate');
    ctx.day.advance('lessons-complete');
    step(2);
    assert('with the kids far from school no gate ambush happens', count('day:gate') === gates0 && ctx.chase.level === 0);

    // ---- the evening: it gets dark, bedtime is near
    ctx.day.advance('smoke-evening');
    step(2);
    assert('the evening begins with a toast and an autosave', ctx.day.phase === 'evening' && count('ui:toast', e => e.key === 'day.evening') >= 1 && saved.length >= 3);
    assert('the arrow still shows the way home', arrow.quest?.id === 'go-home');
    clock(6, 21 * 60 + 30, 'evening');
    ctx.events.emit('clock:tick', ctx.day.snapshot());
    assert('shortly before bedtime a toast says so', count('ui:toast', e => e.key === 'day.bedtimeSoon') === 1);

    // ---- bedtime: parents bring a kid who is out home; the next morning starts at home
    const saves0 = saved.length;
    ctx.day.advance('time');
    step(2);
    assert('the end of the evening opens the good-night message with the day summary and freezes the world', count('day:bedtime', e => e.day === 6 && e.atHome === false) === 1 && top()?.id === 'message' && ctx.frozen && top().body.text.includes('6'), top()?.id);
    assert('the autosave stored where the game continues: the next morning', saved.length === saves0 + 1 && ctx.day.day === 7 && ctx.day.phase === 'morning');
    assert('the message tells that Mum and Dad bring a kid who is out home', top().body.text.includes(ctx.t('day.bedtime.away')));
    tap();
    assert('the report card of the school year follows the good-night message', top()?.id === 'reportCard' && ctx.frozen);
    tap();
    assert('after the message and the report card the family is at home, on foot, and the morning begins', ctx.world.id === 'home' && !ctx.frozen && count('day:morning', e => e.day === 7) === 1 && player.vehicle === 'foot' && ctx.chase.level === 0);

    // ---- put everything back
    ctx.world.load('town', 'from-home');
    step(2);
    ctx.saves.storage = storage;
    ctx.saves.activeSlot = slot0;
    ctx.day.mode = 'freeplay';
    clock(1, 465, 'commute');
    df.cfg.gate.chance = 0.7;
    ctx.chase.reset();
    player.teleport(home0.x, home0.y);
    if (home0.vehicle === 'bike') gs.bikes.giveBike(player);
    else if (home0.vehicle === 'skateboard') gs.skateboards.giveBoard(player);
    else if (home0.vehicle === 'skates') gs.skates.giveBoard(player);
    gs.snapCamera();
    step(3);
    assert('the day flow scenario leaves the world running in the town', !ctx.frozen && ctx.world.id === 'town');
  }
};
