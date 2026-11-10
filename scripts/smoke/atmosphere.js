// Smoke scenario: the atmosphere passes (story 16.12). Registered in scripts/smoke/index.js. Fog fades in and out without a jump and the camera pass
// is on only while a layer shows; rain wets the ground and it dries again; every tier switch takes its layer away; nothing here reads Math.random.
// The weather, the tier switches and the test flags are put back.
export const atmosphere = {
  name: 'atmosphere',
  run(game, assert, env) {
    const { step, ctx } = env;
    const gs = game.scene.getScene('Game');
    const atm = gs.atmosphere;
    const post = gs.postFx;
    if (ctx.map.indoor || !atm) { assert('the atmosphere scenario starts outdoors', false); return; }
    const sw = ctx.quality.tier.atmosphere;
    const saved = { ...sw };
    const state = ctx.weather.state;
    const L = atm.L;
    ctx.weather.state = 'clear';
    step(300);

    // fog: eases in without a jump, the camera pass comes with it, and it eases out again
    ctx.weather.state = 'fog';
    let worst = 0;
    let last = L.fog;
    for (let i = 0; i < 360; i++) { step(1); worst = Math.max(worst, Math.abs(L.fog - last)); last = L.fog; }
    assert('fog fades in over seconds, never in one step', L.fog > 0.95 && worst < 0.02, `fog ${L.fog.toFixed(2)}, biggest step ${worst.toFixed(4)}`);
    assert('the haze is a thin one (the kids stay readable)', atm.haze.density > 0.2 && atm.haze.density <= 0.5, `${atm.haze.density}`);
    assert('cloud shadows give way to the fog', L.clouds < 0.05, `${L.clouds}`);
    if (post.atmosphereAllowed) assert('the grade pass carries the fog', post.names.includes('SchulwegGrade') && atm.haze.density > 0.2, post.names.join());
    else assert('Low and Canvas draw the fog as a bank under the light map', !!atm.sheets && atm.sheets.fog.visible, `${atm.sheets?.fog.visible}`);
    ctx.weather.state = 'clear';
    step(400);
    assert('and fades out again', L.fog === 0, `${L.fog}`);

    // rain: the ground gets wet (slowly), the veil shows, drying follows
    ctx.weather.state = 'rain';
    step(400);
    assert('rain wets the ground', atm.wet > 0.1 && atm.wet < 1, `${atm.wet.toFixed(2)}`);
    assert('the sheen pool never passes the tier cap', atm.spr.filter(s => s.visible).length <= sw.wet, `${atm.spr.filter(s => s.visible).length} / ${sw.wet}`);
    assert('rain brings the distant veil on tiers that draw it', sw.curtain ? L.curtain > 0.5 : L.curtain === 0, `${L.curtain}`);
    game.ripplesOff = false;
    step(240);
    const rings = atm.rip.filter(s => s.visible).length;
    assert('rain rings stay inside the pool', rings <= Math.min(sw.ripples, atm.rip.length) && atm.ripLive === rings, `${rings} / ${sw.ripples}, counted ${atm.ripLive}`);
    game.ripplesOff = true;
    ctx.weather.state = 'clear';
    step(700);
    assert('the rings are gone once the rain stops', atm.rip.filter(s => s.visible).length === 0 && atm.ripLive === 0);
    const wetPeak = atm.wet;
    step(300);
    assert('the ground dries again', atm.wet < wetPeak, `${wetPeak.toFixed(2)} -> ${atm.wet.toFixed(2)}`);

    // the tier switches: each takes its layer away
    ctx.weather.state = 'fog';
    Object.assign(sw, saved, { fog: false });
    step(300);
    assert('switching fog off takes the fog away', L.fog === 0, `${L.fog}`);
    Object.assign(sw, saved, { clouds: false, mist: false, curtain: false });
    ctx.weather.state = 'clear';
    step(300);
    assert('switching clouds and mist off takes them away', L.clouds === 0 && L.mist === 0, `${L.clouds} ${L.mist}`);
    Object.assign(sw, saved, { wet: 0, reflections: 0, ripples: 0 });
    ctx.weather.state = 'rain';
    step(120);
    assert('switching wet ground, reflections and rings off hides them', !atm.spr.some(s => s.visible) && !atm.refl.some(s => s.visible) && !atm.rip.some(s => s.visible));

    // put everything back
    Object.assign(sw, saved);
    ctx.weather.state = 'clear';
    step(900);
    assert('everything is back to where it was', L.fog === 0 && L.curtain === 0 && atm.wet < 0.5, `fog ${L.fog} curtain ${L.curtain} wet ${atm.wet.toFixed(2)}`);
    ctx.weather.state = state;
    step(2);
  }
};
