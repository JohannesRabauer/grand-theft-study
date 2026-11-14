// Smoke scenario: driving, solid vehicles, car paint and the zoom stops (story 17.x). Registered in scripts/smoke/index.js.
// The camera rests on exact zoom stops on the Medium and High tiers (out after a moment of speed, back after a moment of calm, no
// flicker at the threshold) and world labels keep their screen size; cars come in several colours; a vehicle brakes smoothly for a
// kid standing in its lane, stops before it without a hit and drives on when the lane is free; a kid cannot stand inside a car;
// traffic far from every player never jumps.
export const driving = {
  name: 'driving',
  run(game, assert, env) {
    const { h, step } = env;
    const prevOff = game.trafficOff;
    game.trafficOff = false;
    const prev = game.scene.getScene('Game');
    prev.ctx.state.dispatch('coop.set', { on: false });
    prev.scene.restart();
    step(4);
    const gs = game.scene.getScene('Game');
    const ctx = gs.ctx;
    if (ctx.world.id !== 'town') ctx.world.load('town', 'from-home');
    ctx.input.update = () => {};
    const player = ctx.players[0];
    const cam = gs.cameras.main;
    const scale = ctx.res.scale;
    const grabs = ctx.grabs;
    const cfg = grabs.cfg.yield;
    const T = t => h.tilePx(ctx, t);
    step(4);

    // ---- the zoom stops
    const ladder = gs.zoomCfg.ladder;
    const origRig = gs.rig.update.bind(gs.rig);
    let speed = 0;
    gs.rig.update = dt => { origRig(dt); gs.focus.speed = speed; };
    player.teleport(T(60), T(56));
    gs.snapCamera();
    step(90);
    assert('standing still the camera rests on the first zoom stop', Math.abs(cam.zoom - scale * ladder.steps[0]) < 1e-6, `${cam.zoom}`);
    if (scale >= 2) {
      speed = ladder.outAbove + 20;
      step(Math.ceil(ladder.holdOut * 60) + 8);
      assert('riding fast starts the zoom out only after a short hold', gs.zoomOut === true && cam.zoom < scale * ladder.steps[0]);
      step(120);
      assert('the camera settles on the second zoom stop exactly (crisp)', cam.zoom === scale * ladder.steps[1] && Number.isInteger(cam.zoom), `${cam.zoom}`);
      const text = gs.worldText.list.find(t => t.scene && t.__wt && t.scrollFactorX === 1);
      assert('world labels keep their size on screen when zoomed out', !!text && Math.abs(text.__wt.k - ladder.steps[0] / ladder.steps[1]) < 1e-6 && Math.abs(text.scaleX - text.__wt.sx * text.__wt.k) < 1e-6, text ? `${text.__wt.k}` : 'no text');
      let toggles = 0, last = gs.zoomOut;
      for (let i = 0; i < 240; i++) {
        speed = (ladder.outAbove + ladder.inBelow) / 2 + Math.sin(i / 4) * 8;
        step(1);
        if (gs.zoomOut !== last) { toggles++; last = gs.zoomOut; }
      }
      assert('speed hovering between the thresholds does not flip the zoom', toggles === 0, `${toggles} flips`);
      speed = 0;
      step(Math.ceil(ladder.holdIn * 60) + 150);
      assert('and the camera is back on the first stop after a while of calm', cam.zoom === scale * ladder.steps[0], `${cam.zoom}`);
    }
    gs.rig.update = origRig;

    // ---- car paint
    const cars = grabs.pool.filter(t => t.active && t.kind === 'car');
    const keys = new Set(cars.map(t => t.sprite.texture.key));
    assert('cars come in several colours', cars.length >= 4 && keys.size >= 4 && [...keys].every(k => /^car-\d+$/.test(k)), [...keys].join());

    // ---- traffic far from everybody never jumps
    player.teleport(T(20), T(10));
    step(30);
    const watch = grabs.pool.filter(t => t.active);
    const last = watch.map(t => ({ x: t.x, y: t.y }));
    let jump = 0, stopped = 0;
    const rec = watch.map(t => t.recoveries);
    for (let f = 0; f < 60 * 25; f++) {
      step(1);
      watch.forEach((t, i) => { jump = Math.max(jump, Math.hypot(t.x - last[i].x, t.y - last[i].y)); last[i] = { x: t.x, y: t.y }; if (t.speed === 0 && t.lane !== 'main-road') stopped++; });
    }
    assert('no vehicle ever moves faster than its cruise speed from one frame to the next (nothing pops in or out)', jump <= Math.max(...watch.map(t => t.cruise)) / 60 + 0.5, `${jump.toFixed(2)} px/frame`);
    assert('and a free road never brings a vehicle to a halt (the main road has cones and a crate in its lanes, shoved aside once)', stopped === 0 && watch.every((t, i) => t.recoveries === rec[i]), `${stopped} stopped frames`);

    // ---- a kid in the lane: smooth braking, a stop before it, no hit, then on again
    const lane = grabs.pool.filter(t => t.active && t.lane === 'main-road');
    const car = lane.find(t => t.kind === 'car');
    for (const o of lane) if (o !== car) o.active = false; // isolate the one car (put back below)
    car.s = 400;
    car.speed = car.cruise;
    step(2);
    let hits = 0;
    const onHit = () => hits++;
    ctx.events.on('traffic:hit', onHit);
    player.teleport(car.x + 240, car.y);
    gs.snapCamera();
    let maxDrop = 0, prevSpeed = car.speed;
    for (let f = 0; f < 60 * 6; f++) {
      step(1);
      maxDrop = Math.max(maxDrop, prevSpeed - car.speed);
      prevSpeed = car.speed;
    }
    const nose = player.x - (car.x + car.kcfg.length / 2);
    assert('a vehicle stops before a kid standing in its lane, without a hit', car.speed === 0 && nose > 0 && nose < cfg.stopGap + 12 && hits === 0, `speed ${car.speed}, nose gap ${nose.toFixed(1)}, hits ${hits}`);
    assert('it braked smoothly (never more than the brake limit in a frame)', maxDrop <= cfg.brake / 60 + 1e-6, `${(maxDrop * 60).toFixed(0)} px/s2`);
    player.teleport(car.x + 240, car.y - 220); // out of the lane
    let resumed = 0;
    for (let f = 0; f < 60 * 4; f++) { step(1); resumed = Math.max(resumed, car.speed); }
    assert('and drives on once the lane is free', resumed > car.cruise * 0.8, `${resumed.toFixed(0)} px/s`);

    // ---- solid hull: a kid placed inside a car that stands is not hit but pushed out
    const cruise = car.cruise;
    car.cruise = car.speed = 0;
    step(2);
    player.teleport(car.x + 3, car.y + 2);
    step(2);
    const dx = player.x - car.x, dy = player.y - car.y;
    const along = dx * Math.cos(car.heading) + dy * Math.sin(car.heading);
    const lat = -dx * Math.sin(car.heading) + dy * Math.cos(car.heading);
    assert('a kid cannot stand inside a car: pushed out of the hull', hits === 0 && (Math.abs(along) > car.kcfg.length / 2 || Math.abs(lat) > car.kcfg.width / 2), `hits ${hits}, along ${along.toFixed(1)}, lat ${lat.toFixed(1)}`);
    car.cruise = cruise;
    ctx.events.off('traffic:hit', onHit);
    for (const o of lane) o.active = true;
    player.teleport(T(20), T(10));
    step(30);
    game.trafficOff = prevOff;
  }
};
