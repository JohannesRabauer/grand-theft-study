// Smoke scenarios: skateboard (story 5.1, AD-23). Each export is { name, run(game, assert, env) }; registered in scripts/smoke/index.js.
// Mehmet starts on his board, measured top speeds per surface follow the profile and differ from bike and foot,
// the ollie clears a cone (no prop contact while airborne), the manual meter runs and ends softly, and the player can
// switch between board, foot and bike.
export const skateboard = {
  name: 'skateboard',
  run(game, assert, env) {
    const { h, step, intent, ctx, gs, player, count, ui, T } = env;
    const profiles = player.profiles;
    const sk = profiles.skateboard;
    const place = (x, y, speed = 0) => {
      gs.matter.body.setPosition(player.body, { x, y });
      gs.matter.body.setVelocity(player.body, { x: speed / 60, y: 0 });
      player.move.speed = speed;
      player.move.vel.x = speed;
      player.move.vel.y = 0;
      player.move.heading = 0;
      player.sprite.setPosition(x, y);
    };
    const press = key => { intent[key] = true; step(1); intent[key] = false; };
    const quiet = () => { ctx.chase.reset(); h.teleport(gs, ctx, 7, 51); step(20); };
    const become = id => { ctx.state.dispatch('player.setCharacter', { player: 0, character: id }); ctx.characters.apply(player); };
    const before = ctx.state.data;

    // ---- Mehmet starts on his board
    quiet();
    become('mehmet');
    gs.mountStartVehicle(player);
    step(2);
    const board = gs.skateboards;
    const vehicleLine = ui.hud.get('status').vehicle.text;
    assert('Mehmet starts on the board: vehicle, mounted state, own rider look, HUD line',
      player.vehicle === 'skateboard' && board.isMounted(0) && player.sprite.texture.key === 'player-mehmet-skate' && vehicleLine === ctx.t('hud.vehicle', { name: ctx.t('vehicle.skateboard') }), `${player.vehicle} ${player.sprite.texture.key} "${vehicleLine}"`);
    assert('the town has lying boards to pick up', board.parked.filter(b => b.visible).length >= 2);

    // ---- measured top speed per surface (the surface lookup is forced, the controller is the real one)
    const real = ctx.surfaces.at;
    const measure = surface => {
      ctx.surfaces.at = () => surface;
      place(T(7), T(51));
      intent.move.x = 1;
      let top = 0;
      for (let i = 0; i < 90; i++) { step(1); top = Math.max(top, player.move.velSpeed); }
      intent.move.x = 0;
      delete ctx.surfaces.at;
      step(1);
      return top;
    };
    const designed = (id, s) => profiles[id].maxSpeed * ctx.surfaces.props(s).speed[id] * (id === 'skateboard' ? player.move.speedMult : 1); // Mehmet's Tempo scales his own top speed
    const raw = (id, s) => profiles[id].maxSpeed * ctx.surfaces.props(s).speed[id];
    const rows = [];
    let ok = true;
    for (const s of ['asphalt', 'cobble', 'grass', 'puddle']) {
      const v = measure(s);
      const d = designed('skateboard', s);
      rows.push(`${s} ${v.toFixed(0)}/${d.toFixed(0)}`);
      ok = ok && Math.abs(v - d) / d < 0.08 && Math.abs(raw('skateboard', s) - raw('bike', s)) > 5 && Math.abs(raw('skateboard', s) - raw('foot', s)) > 5;
    }
    assert('measured board top speed per surface matches the design and differs from the bike', ok && ctx.surfaces.at === real, rows.join(', '));
    assert('cobble and grass are a strong penalty: slower than walking and than the bike', ['cobble', 'grass'].every(s => raw('skateboard', s) < raw('foot', s) && raw('skateboard', s) < raw('bike', s)));

    // ---- ollie clears a cone
    const cone = ctx.props.props.find(p => p.kind === 'cone' && ctx.surfaces.at(p.body.position.x, p.body.position.y) === 'concrete');
    const cx = cone.body.position.x;
    const cy = cone.body.position.y;
    const resetCone = () => {
      gs.matter.body.setPosition(cone.body, { x: cx, y: cy });
      gs.matter.body.setVelocity(cone.body, { x: 0, y: 0 });
      cone.cool = 0;
      cone.tipped = false;
    };
    let touched = false;
    const onContact = ev => { for (const p of ev.pairs) if ((p.bodyA === player.body && p.bodyB === cone.body) || (p.bodyB === player.body && p.bodyA === cone.body)) touched = true; };
    gs.matter.world.on('collisionstart', onContact);
    const pass = ollie => {
      touched = false;
      resetCone();
      h.teleport(gs, ctx, Math.floor((cx - 64) / ctx.map.tileSize), Math.floor(cy / ctx.map.tileSize)); // moves the camera too, so walls and props around stream in
      step(15);
      place(cx - 70, cy, 110);
      intent.move.x = 1;
      let lifted = 0;
      let maskFree = false;
      let fired = false;
      for (let i = 0; i < 150 && (player.x < cx + 45 || board.riders[0].skate.air > 0); i++) {
        intent.jump = ollie && !fired && player.x >= cx - 28;
        if (intent.jump) fired = true;
        step(1);
        lifted = Math.max(lifted, player.y - player.sprite.y);
        if ((player.body.collisionFilter.mask & 0x0010) === 0) maskFree = true;
      }
      intent.jump = false;
      intent.move.x = 0;
      return { moved: Math.hypot(cone.body.position.x - cx, cone.body.position.y - cy), lifted, maskFree, touched, passed: player.x >= cx + 40 };
    };
    const hitsBefore = count('prop:hit');
    const walk = pass(false);
    assert('without an ollie the cone is run over (pushed)', walk.touched && !walk.maskFree && count('prop:hit') > hitsBefore, `moved ${walk.moved.toFixed(1)}px`);
    const ollies = [];
    const onOllie = e => ollies.push(e);
    ctx.events.on('trick:ollie', onOllie);
    let bursts = 0;
    const burst = ctx.particles.surfaceBurst;
    ctx.particles.surfaceBurst = function (...a) { if (a[3] >= sk.fx.landDust) bursts++; return burst.apply(this, a); };
    const hitsMid = count('prop:hit');
    const jump = pass(true);
    ctx.events.off('trick:ollie', onOllie);
    gs.matter.world.off('collisionstart', onContact);
    ctx.particles.surfaceBurst = burst;
    assert('an ollie lifts the rider and skips the cone: not touched, no prop:hit', jump.lifted > sk.trick.ollie.height * 0.8 && jump.maskFree && !jump.touched && count('prop:hit') === hitsMid && jump.passed, `lift ${jump.lifted.toFixed(1)}px, touched ${jump.touched}`);
    assert('trick:ollie fires at take-off and at landing (with airtime) for player 0', ollies.length === 2 && ollies[0].phase === 'start' && ollies[1].phase === 'end' && ollies[1].airtime > 0.25 && ollies.every(e => e.player === 0), JSON.stringify(ollies.map(e => e.phase)));
    assert('landing restores collisions and kicks up dust', (player.body.collisionFilter.mask & 0x0010) !== 0 && bursts === 1, `${bursts} bursts`);

    // ---- manual: starts at speed, balance meter, ends softly
    quiet();
    ctx.surfaces.at = () => 'asphalt';
    place(T(7), T(51), 90);
    intent.move.x = 1;
    step(10);
    const manualEvents = [];
    const onManual = e => manualEvents.push(e);
    ctx.events.on('trick:manual', onManual);
    intent.manual = true;
    step(3);
    const rig = board.riders[0].skate;
    const started = rig.manual && player.sprite.texture.key === 'player-mehmet-skate-manual';
    const meter0 = rig.meter;
    step(10);
    assert('the manual starts in the sweet spot with the nose-up pose and a speed boost', started && rig.sweetNow && player.move.boostMult === sk.trick.manual.boost && rig.meter > meter0 && manualEvents[0]?.phase === 'start' && manualEvents[0].player === 0, `meter ${rig.meter.toFixed(2)}`);
    let n = 0;
    while (rig.manual && n < 200) { step(1); n++; }
    intent.manual = false;
    const end = manualEvents.find(e => e.phase === 'end');
    assert('held too long it tips over softly: back to rolling, no speed loss, vehicle unchanged', !rig.manual && end?.reason === 'over' && end.sweet > 0.2 && player.move.boostMult === 1 && player.move.velSpeed > 60 && player.vehicle === 'skateboard' && player.sprite.texture.key === 'player-mehmet-skate', `${end?.reason} after ${(end?.time ?? 0).toFixed(2)}s, speed ${player.move.velSpeed.toFixed(0)}`);
    ctx.events.off('trick:manual', onManual);
    intent.move.x = 0;
    delete ctx.surfaces.at;

    // ---- switching: board -> foot -> bike -> foot -> board
    quiet();
    const bike = gs.bikes.parked.find(b => b.visible);
    place(bike.x - 14, bike.y);
    step(2);
    const drop = { x: player.x, y: player.y };
    press('interact');
    assert('interact gets off the board (it stays on the ground) and does not mount the bike in the same press', player.vehicle === 'foot' && !board.isMounted(0) && !gs.bikes.isMounted(0) && board.parked.some(b => b.visible && Math.hypot(b.x - drop.x, b.y - drop.y) < 2));
    place(bike.x, bike.y);
    step(2);
    press('interact');
    assert('the next press takes the nearer bike', player.vehicle === 'bike' && gs.bikes.isMounted(0) && !board.isMounted(0));
    press('interact');
    place(drop.x, drop.y);
    step(2);
    press('interact');
    assert('walking to a lying board and pressing interact mounts it again', player.vehicle === 'skateboard' && board.isMounted(0) && player.sprite.texture.key === 'player-mehmet-skate');
    press('interact');
    assert('and off again (foot)', player.vehicle === 'foot' && player.move.boostMult === 1);

    // ---- a board can be dropped mid-ollie without leaving the player without collisions
    become('mehmet');
    gs.mountStartVehicle(player);
    step(2);
    press('jump');
    step(3);
    press('interact');
    assert('dismounting in the air restores collisions', player.vehicle === 'foot' && (player.body.collisionFilter.mask & 0x0010) !== 0);

    // ---- back to the neutral kid the later scenarios expect
    ctx.state.replace(before);
    ctx.characters.apply(player);
    player.setVehicle('foot');
    intent.move.x = 0;
    quiet();
    board.unloadMap(); // back to the map's own boards: the starter board and the one dropped here are gone
    board.loadMap();
    assert('neutral kid restored on foot', player.vehicle === 'foot' && player.sprite.texture.key === 'player' && player.character === null);
  }
};
