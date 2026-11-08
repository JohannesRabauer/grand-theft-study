// Smoke scenario: music themes and adaptive chase music (stories 13.2 and 13.3). Registered in scripts/smoke/index.js. With the real Web Audio:
// the sequencer starts once the audio is unlocked and schedules notes, the theme follows the phase and season at a phase boundary, the layers
// grow with the chase level and drop when it ends. The clock phase and the chase are put back.
export const music = {
  name: 'music',
  run(game, assert, env) {
    const { step, ctx } = env;
    const m = ctx.music;
    const themes = [];
    const layers = [];
    ctx.events.on('music:theme', e => themes.push(e));
    ctx.events.on('music:layers', e => layers.push(e));
    assert('the music service exists with a theme for the current phase', !!m && !!m.theme && m.theme.phase === ctx.day.phase, m?.theme?.id);
    window.dispatchEvent(new Event('pointerdown'));
    ctx.audio.unlock();
    step(2);
    assert('after the first gesture the sequencer runs', m.playing && ctx.audio.unlocked);
    const n0 = m.scheduled;
    m.tick();
    assert('it schedules notes ahead on the audio clock', m.scheduled > n0, `${m.scheduled} vs ${n0}`);

    // the theme follows the phase boundary
    const phase0 = ctx.day.phase;
    const other = ctx.day.cfg.phases.find(p => p.id !== phase0);
    const keep = { idx: ctx.day.phaseIndex };
    m.setTheme(other.id, other.season);
    assert('a phase boundary changes the theme', themes.length >= 1 && themes.at(-1).phase === other.id && themes.at(-1).season === other.season, JSON.stringify(themes.at(-1)));
    const t1 = themes.length;
    m.setTheme(other.id, other.season);
    assert('and nothing changes without a boundary', themes.length === t1);
    m.setTheme(phase0, ctx.day.season);

    // the chase layers
    ctx.chase.reset();
    ctx.chase.lvl.lockout = 0;
    const counts = [];
    for (const level of [0, 1, 3, 5]) {
      if (level) ctx.chase.lvl.set(level, 'smoke'); else ctx.chase.reset();
      step(2);
      m.tick();
      counts.push(`${ctx.chase.level}:${m.level}`); // the player may stand in turf, so level 0 can come back as 1 - the music must follow either way
    }
    assert('the chase level reaches the music: layers increase 1 to 5', counts.slice(1).join() === '1:1,3:3,5:5' && counts[0].split(':')[0] === counts[0].split(':')[1] && layers.some(l => l.level === 5 && l.layers === 5), counts.join());
    ctx.chase.reset();
    step(5);
    m.tick();
    assert('and drop when the chase ends', m.level === ctx.chase.level && m.level < 5 && layers.at(-1).level === m.level, `${m.level} ${ctx.chase.level}`);
    m.destroy();
    m.start();
    assert('the sequencer can be stopped and started again', m.playing);
  }
};
