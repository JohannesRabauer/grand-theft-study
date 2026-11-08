// Smoke scenario: input prompts follow the device (story 14.2). Registered in scripts/smoke/index.js. At the Pfand machine the prompt names F for a
// keyboard, Y for a gamepad and a hand for touch, switching with the input type; the kid is put back.
export const prompts = {
  name: 'prompts',
  run(game, assert, env) {
    const { step, ctx, gs, player } = env;
    if (ctx.map.indoor) { assert('the prompts scenario starts in the town', false); return; }
    const home = { x: player.x, y: player.y };
    for (const ride of gs.mountables) if (ride.isMounted(0)) ride.dismount(player);
    const ts = ctx.map.tileSize;
    const m = ctx.activities.machine();
    player.teleport((m.x + 0.5) * ts, (m.y + 0.5) * ts + 8);
    gs.snapCamera();
    const type0 = ctx.input.type;
    const text = type => { ctx.input.type = type; ctx.activities.labels[0].actText = null; step(3); return ctx.activities.labels[0].text; };
    const kb = text('keyboard');
    const pad = text('gamepad');
    const touch = text('touch');
    assert('a keyboard prompt names F, a gamepad prompt Y, touch a hand', kb.startsWith('F') && pad.startsWith('Y') && touch.startsWith('Hand'), `${kb} | ${pad} | ${touch}`);
    assert('and each still names the action', [kb, pad, touch].every(s => s.length > 4));
    ctx.input.type = type0;
    player.teleport(home.x, home.y);
    gs.snapCamera();
    step(3);
  }
};
