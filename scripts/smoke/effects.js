// Smoke scenario: the Effekte setting (story 16.15). Registered in scripts/smoke/index.js. Full, reduced and off change the passes and caps
// at once (no reload), the choice is saved through the state action (flag `effects`, which also sets reducedMotion) and mirrored to the
// device (localStorage) and the gameplay caps stay (the rows of the pause overlay and the parent settings are checked in the `parent` and `pause` scenarios). Put back at the end.
import { setEffects } from '../../ui/settingsRows.js';

export const effects = {
  name: 'effects',
  run(game, assert, env) {
    const { step, ctx } = env;
    const gs = game.scene.getScene('Game');
    const q = ctx.quality;
    const flags = () => ctx.state.shared.flags;
    const before = { mode: q.effects, flag: flags().effects, motion: flags().reducedMotion };
    const stored = () => { try { return localStorage.getItem('schulweg.effects'); } catch { return null; } };
    const base = { ...q.tier };
    step(2);

    setEffects(ctx, 'full');
    const full = q.tier;
    step(2);
    assert('full keeps the tier as the data file has it', q.effects === 'full' && flags().effects === 'full' && flags().reducedMotion === false && full.maxParticles >= 150, `${q.effects}`);

    setEffects(ctx, 'reduced');
    step(2);
    const red = q.tier;
    assert('reduced: no bloom, fewer particles and lights, the mood stays', red.postFx.bloomTaps === 0 && red.maxParticles <= full.maxParticles && red.maxLights <= full.maxLights && red.lightMap === full.lightMap && red.shadows === full.shadows, JSON.stringify(red.postFx));
    assert('reduced is saved in the slot and reducedMotion follows', flags().effects === 'reduced' && flags().reducedMotion === true && ctx.motion.reduced === true, JSON.stringify(flags().effects));
    assert('the choice is kept on the device for the next start', stored() === 'reduced', `${stored()}`);
    if (gs.postFx.webgl && full.postFx.bloomTaps > 0) assert('no bloom pass any more', !gs.postFx.names.includes('SchulwegBloom'), gs.postFx.names.join());

    setEffects(ctx, 'off');
    step(2);
    const off = q.tier;
    assert('off: no light map, no passes, no shadows, no light pool', off.lightMap === false && off.shadows === false && off.maxLights === 0 && !off.atmosphere.pass && !off.postFx.grade && !off.postFx.vignette, JSON.stringify(off.postFx));
    assert('the light map and the camera passes are really gone', !ctx.lights.mapActive && !gs.postFx.active && !gs.lightMap.enabled, `${ctx.lights.mapActive} ${gs.postFx.names.join()}`);
    assert('off keeps the gameplay caps (NPCs, bullies, props, render size)', off.maxNPCs === full.maxNPCs && off.maxBullies === full.maxBullies && off.maxProps === full.maxProps && off.renderScale === full.renderScale);
    assert('the particle total follows the smaller cap', ctx.particles.live() <= off.maxParticles, `${ctx.particles.live()} / ${off.maxParticles}`);
    step(60);

    setEffects(ctx, 'full');
    step(2);
    assert('full brings everything back at once', q.tier.maxParticles === base.maxParticles && q.tier.lightMap === base.lightMap && q.tier.postFx.bloomTaps === base.postFx.bloomTaps && flags().reducedMotion === false, q.effects);
    assert('a bad mode changes nothing', !q.setEffects('max') && q.effects === 'full' && ctx.state.dispatch('settings.effects', { value: 'max' }) === false && flags().effects === 'full');

    // put back (the state is frozen: only actions change it)
    setEffects(ctx, before.mode);
    ctx.state.dispatch('settings.reducedMotion', { value: before.motion ?? false });
    step(2);
  }
};
