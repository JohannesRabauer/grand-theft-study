// Smoke scenario: smooth motion (story 16.13). Registered in scripts/smoke/index.js. The walk and bike cycles pick their in-between frames,
// the door fade lives in the `worldDoors` scenario, shake and hit-stop come and go, and reducedMotion switches shake, hit-stop
// and squash off. Shake, hit-stop and the door fade are switched on only here (game.motionFxOff / game.transitionsOff) and put back at the end.
export const motion = {
  name: 'motion',
  run(game, assert, env) {
    const { step, ctx, intent } = env;
    const gs = game.scene.getScene('Game');
    const mo = ctx.motion;
    const p = ctx.players[0];
    if (!mo || !gs.motion) { assert('the motion systems exist', false); return; }
    const flagsBefore = ctx.state.shared.flags.reducedMotion;
    const savedFx = game.motionFxOff;
    game.motionFxOff = false;
    const start = { x: p.x, y: p.y };
    const foot = p.vehicle === 'foot';
    const base = p.textureFor(p.profiles[foot ? 'foot' : 'bike']);

    // walk (on foot) or pedal (on the bike) cycle: the in-between frames show while moving, the standing frame when still
    const seen = new Set();
    for (let i = 0; i < 90; i++) { intent.move.x = 1; step(1); seen.add(p.sprite.texture.key); }
    intent.move.x = 0;
    assert(`${foot ? 'walking' : 'riding'} shows in-between frames of the same character`, [...seen].some(k => k.startsWith(`${base}-`)) && ctx.res.scale > 0, [...seen].join());
    step(120);
    assert('standing still shows the standing figure', foot ? p.sprite.texture.key === base : p.sprite.texture.key.startsWith(base), p.sprite.texture.key);

    // shake: whole pixels, then back to nothing
    mo.shake('caught');
    let whole = true;
    let peak = 0;
    for (let i = 0; i < 12; i++) { step(1); whole = whole && Number.isInteger(mo.shakeX) && Number.isInteger(mo.shakeY); peak = Math.max(peak, Math.abs(mo.shakeX), Math.abs(mo.shakeY)); }
    assert('shake moves the camera by whole pixels', whole && peak >= 1, `peak ${peak}`);
    step(60);
    assert('and settles back to zero', mo.shakeX === 0 && mo.shakeY === 0 && !mo.shakeId);

    // hit-stop slows the world for a moment, then it runs normally again
    mo.hitStop('bump');
    const slowed = mo.timeScale(0.001) < 1;
    mo.stopT = 0;
    assert('hit-stop slows the world', slowed && mo.timeScale(0.016) === 1);

    // reducedMotion: no shake, no hit-stop, no squash (set through the state action)
    ctx.state.dispatch('settings.reducedMotion', { value: true });
    mo.shake('hit');
    mo.hitStop('hit');
    gs.motion.squash(0, 'rideLand');
    assert('reducedMotion switches shake, hit-stop and squash off', mo.reduced && !mo.shakeId && mo.timeScale(0.016) === 1 && !gs.motion.slot(0).sq);
    ctx.state.dispatch('settings.reducedMotion', { value: false });

    p.teleport(start.x, start.y);
    step(2);
    game.motionFxOff = savedFx;
    ctx.state.dispatch('settings.reducedMotion', { value: flagsBefore ?? false });
  }
};
