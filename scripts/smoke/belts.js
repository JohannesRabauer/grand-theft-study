// Smoke scenario: belt effects (story 6.5). Registered in scripts/smoke/index.js after `defense`. A white belt has no aura and gets no Mut back
// from a parry; a blue belt stumbles a chasing bully that comes close (once per cooldown) and gets Mut back from a perfect parry. The belt row is
// swapped in the controller for the test and put back afterwards. Takes the live scene (an earlier scenario restarted it).
import { ST } from '../../defense/defenseCore.js';

export const belts = {
  name: 'belts',
  run(game, assert, env) {
    const { step } = env;
    const gs = game.scene.getScene('Game');
    const ctx = gs.ctx;
    const player = ctx.players[0];
    const cfg = game.cache.json.get('karate');
    const row = id => cfg.belts.find(b => b.id === id);
    const stats0 = ctx.defense.stats.bind(ctx.defense);
    const log = [];
    for (const n of ['defense:aura', 'bully:stumble']) ctx.events.on(n, e => log.push([n, e]));
    const count = n => log.filter(e => e[0] === n).length;
    const slot = ctx.defense.forPlayer(0);
    for (const ride of [gs.bikes, gs.skateboards, gs.skates]) if (ride.isMounted(0)) ride.dismount(player);
    ctx.chase.reset();
    ctx.chase.lvl.lockout = 0;
    step(3);
    const bully = () => {
      ctx.chase.lvl.set(1, 'smoke');
      step(2);
      const b = ctx.chase.bullies.find(o => o.active);
      gs.matter.body.setPosition(b.body, { x: player.x + 14, y: player.y });
      gs.matter.body.setVelocity(b.body, { x: 0, y: 0 });
      b.alerted = false;
      ctx.chase.fsm.enter(b, 'CHASE');
      return b;
    };

    // ---- white belt: no aura
    ctx.defense.stats = () => row('white');
    let b = bully();
    step(20);
    assert('a white belt has no aura: the close bully is not stumbled by it', count('defense:aura') === 0);
    ctx.chase.reset();
    step(5);

    // ---- blue belt: aura
    ctx.defense.stats = () => row('blue');
    ctx.chase.lvl.lockout = 0;
    b = bully();
    step(6);
    assert('a blue belt stumbles a chasing bully that comes close', count('defense:aura') === 1 && b.state === 'STUMBLE', `${count('defense:aura')} ${b.state}`);
    const first = count('defense:aura');
    step(20);
    assert('the aura rests before it works again', count('defense:aura') === first);
    ctx.chase.reset();
    step(5);

    // ---- parry gives Mut back only from the belt that has it
    for (const [id, gives] of [['white', false], ['blue', true]]) {
      ctx.defense.stats = () => row(id);
      ctx.chase.lvl.lockout = 0;
      const pb = bully();
      Object.assign(slot, { state: ST.BLOCK, t: 0.05, mut: 0.5 });
      ctx.defense.contact(0, pb);
      assert(`${id} belt: a perfect parry ${gives ? 'gives Mut back' : 'gives nothing back'}`, gives ? Math.abs(slot.mut - (0.5 + row(id).parryMut)) < 1e-9 : slot.mut === 0.5, `${slot.mut}`);
      ctx.chase.reset();
      step(5);
    }

    ctx.defense.stats = stats0;
    Object.assign(slot, { state: ST.IDLE, t: 0, mut: 1 });
    ctx.chase.reset();
    step(5);
    assert('the belts scenario leaves the chase quiet', ctx.chase.level === 0 && !ctx.frozen);
  }
};
