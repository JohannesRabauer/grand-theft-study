// Smoke scenarios: coop. Each export is { name, run(game, assert, env) }; registered in scripts/smoke/index.js.
// AD-18: a real two-player start (coop flag), the tether and the camera rig on the commute route.
export const coopCommute = {
  name: 'coopCommute',
  run(game, assert, env) {
    const { h, step } = env;
    // ---- start a co-op run from the menu: Jonas (on foot) and Lena (her bike) ----
    const old = game.scene.getScene('Game').ctx;
    old.state.dispatch('player.setCharacter', { player: 0, character: 'jonas' });
    old.state.dispatch('coop.set', { on: true });
    old.events.emit('game:quit');
    step(4);
    game.scene.getScene('Menu').scene.start('Game');
    step(4);
    const gs = game.scene.getScene('Game');
    const ui = game.scene.getScene('UI');
    const ctx = gs.ctx;
    ctx.input.update = () => {};
    const [p1, p2] = ctx.players;
    const cam = gs.cameras.main;
    const scale = ctx.res.scale;
    assert('the coop flag starts two players with their own characters and intents', ctx.players.length === 2 && p1.character.id === 'jonas' && p2.character.id === 'lena' && ctx.input.intents[0] !== ctx.input.intents[1] && ctx.state.shared.flags.coop === true);
    assert('each starts with its own vehicle: P1 on foot, P2 on the bike', p1.vehicle === 'foot' && p2.vehicle === 'bike' && gs.bikes.isMounted(1) && !gs.bikes.isMounted(0));
    const spawn = ctx.map.objects.find(o => o.type === 'spawn' && o.id === 'player');
    const off = gs.zoomCfg.coop.spawnOffsets;
    const sx = (spawn.x + 0.5) * ctx.map.tileSize;
    assert('they start at the spawn offsets, side by side', Math.abs(p1.x - (sx + off[0][0])) < 1 && Math.abs(p2.x - (sx + off[1][0])) < 1 && Math.abs(p1.y - p2.y) < 1);
    assert('ctx.coop is active and the HUD has two status slices, one shared money line and one arrow', ctx.coop.active && ctx.coop.distance < 40 && ui.hud.has('status.0') && ui.hud.has('status.1') && ui.hud.has('tool.1') && ui.hud.has('money') && ui.hud.has('objective') && !ui.hud.has('objective.0'));
    assert('P2 sits on the right, P1 on the left', ui.hud.get('status.0').stamina.x < 100 && ui.hud.get('status.1').stamina.x > 380);
    assert('rings mark both players', gs.markers.rings.length === 2 && gs.markers.rings.every(r => r.visible));
    step(60);
    assert('the camera is centred between them at the base zoom', Math.abs(gs.focus.x - (p1.x + p2.x) / 2) < 1e-6 && Math.abs(cam.zoom - gs.zoomCfg.max * scale) < 1e-6, `zoom ${cam.zoom}`);

    // ---- both ride/walk the commute route; the tether holds them together and the camera keeps both in view ----
    const r1 = h.makeRouteRunner(ctx, 16, 9, 0);
    const r2 = h.makeRouteRunner(ctx, 16, 9, 1);
    const i1 = ctx.input.intents[0];
    const i2 = ctx.input.intents[1];
    i1.sprint = i2.sprint = true;
    let maxRatio = 0;
    let outOfView = 0;
    let minZoom = Infinity;
    let slowed = false;
    let frames = 0;
    // each follows the route and, once its last waypoint is reached, walks straight into the school goal
    const goal = ctx.map.objects.find(o => o.type === 'goal');
    const gx = (goal.x + goal.w / 2) * ctx.map.tileSize;
    const gy = (goal.y + goal.h / 2) * ctx.map.tileSize;
    const runners = [r1, r2];
    const finishing = [false, false];
    const steer = (i) => {
      const p = ctx.players[i];
      if (!finishing[i]) { runners[i](); finishing[i] = runners[i].done; return; }
      const dx = gx - p.x;
      const dy = gy - p.y;
      const l = Math.hypot(dx, dy) || 1;
      ctx.input.intents[i].move.x = dx / l;
      ctx.input.intents[i].move.y = dy / l;
    };
    for (; frames < 6000 && !(gs.zones.reached[0] && gs.zones.reached[1]); frames++) {
      steer(0);
      steer(1);
      step(1);
      maxRatio = Math.max(maxRatio, ctx.coop.tetherRatio);
      minZoom = Math.min(minZoom, cam.zoom / scale);
      slowed = slowed || p1.move.tetherMult < 0.9 || p2.move.tetherMult < 0.9;
      const v = cam.worldView;
      for (const p of ctx.players) if (p.x < v.x || p.x > v.right || p.y < v.y || p.y > v.bottom) outOfView++;
    }
    i1.sprint = i2.sprint = false;
    i1.move.x = i1.move.y = i2.move.x = i2.move.y = 0;
    assert('both reached the school', gs.zones.reached[0] === 1 && gs.zones.reached[1] === 1, `${frames} frames, reached ${gs.zones.reached[0]}/${gs.zones.reached[1]}, P1 ${p1.x.toFixed(0)},${p1.y.toFixed(0)} ${p1.vehicle}, P2 ${p2.x.toFixed(0)},${p2.y.toFixed(0)} ${p2.vehicle}, ratio ${ctx.coop.tetherRatio.toFixed(2)} mult ${p1.move.tetherMult.toFixed(2)}/${p2.move.tetherMult.toFixed(2)}`);
    assert('the tether kept them together (never far past the limit)', maxRatio < 1.1 && maxRatio > gs.zoomCfg.tether.soft, `max ratio ${maxRatio.toFixed(2)}`);
    assert('the tether slowed the faster one down on the way', slowed);
    assert('both stayed in view on every frame', outOfView === 0, `${outOfView} player-frames outside`);
    assert('the camera zoomed out to keep them in view', minZoom < gs.zoomCfg.max - 0.02 && minZoom >= gs.zoomCfg.min - 1e-6, `min zoom ${minZoom.toFixed(3)}`);

    // ---- one player held (caught frame, screen): the other may go on, the tether pulls gently ----
    step(60);
    p2.pinned = true;
    const startY = p1.y;
    i1.move.x = 0;
    i1.move.y = 1;
    let worst = 0;
    for (let n = 0; n < 600; n++) {
      step(1);
      worst = Math.max(worst, ctx.coop.tetherRatio);
    }
    i1.move.y = 0;
    assert('a pinned partner does not block: the other still moves and stays within the view limit', Math.abs(p1.y - startY) > 30 && worst < 1.3, `max ratio ${worst.toFixed(2)}`);
    p2.pinned = false;
    p2.move.tetherMult = 1;
    ctx.state.dispatch('coop.set', { on: false });
    step(2);
  }
};
