// Smoke scenario: the audio service (story 13.1). Registered in scripts/smoke/index.js. With the real Web Audio of the browser: nothing plays
// before the first gesture, a (simulated) pointer press wakes the context, a scripted event plays its sound, a flood of events never exceeds
// the voice cap, and switching sound off in the flag silences it. The saved state is put back.
export const audio = {
  name: 'audio',
  run(game, assert, env) {
    const { step, ctx } = env;
    const data0 = ctx.state.data;
    const a = ctx.audio;
    const heard = [];
    ctx.events.on('audio:played', e => heard.push(e.name));
    assert('the audio service exists with the real Web Audio of the browser', !!a && !!a.AC);
    const woke = a.unlocked;
    const refused0 = a.refused;
    ctx.events.emit('sfx:play', { name: 'coin' });
    if (!woke) assert('before the first gesture nothing plays', heard.length === 0 && a.refused === refused0 + 1 && !a.unlocked);
    window.dispatchEvent(new Event('pointerdown'));
    step(2);
    assert('the first gesture wakes the audio context', a.unlocked && a.shared.ac.state !== undefined);
    const n0 = heard.length;
    ctx.events.emit('sfx:play', { name: 'coin' });
    ctx.events.emit('sfx:play', { name: 'nothing' });
    assert('an event plays its sound, an unknown name does nothing', heard.length === n0 + 1 && heard.at(-1) === 'coin');
    for (let i = 0; i < 60; i++) ctx.events.emit('sfx:play', { name: 'thud' });
    assert('a flood of sounds never exceeds the voice cap', a.pool.active(a.shared.ac.currentTime) <= a.cfg.voiceCap && a.pool.dropped > 0, `${a.pool.active(a.shared.ac.currentTime)} voices, ${a.pool.dropped} dropped`);
    ctx.state.dispatch('flags.set', { key: 'audioMuted', value: true });
    const n1 = heard.length;
    ctx.events.emit('sfx:play', { name: 'coin' });
    assert('sound switched off in the settings is silent', heard.length === n1);
    ctx.state.dispatch('flags.set', { key: 'audioMuted', value: false });
    ctx.state.replace(data0);
    step(2);
  }
};
