// Smoke scenarios: crowd. Each export is { name, run(game, assert, env) }; registered in scripts/smoke/index.js.
import { CAT } from '../../physics/categories.js';

// pedestrians and dogs react to the bell and never meet projectiles
export const pedestrians = {
  name: 'pedestrians',
  run(game, assert, env) {
    const { step, count, live, player, ctx, gs, crowd } = env;
    // ---- pedestrians (AD-15) ----
    step(120);
    assert('pedestrians fill the town up to the Medium cap', crowd.liveCount >= 6 && crowd.liveCount <= ctx.quality.tier.maxNPCs && live('npcs') === crowd.liveCount, `${crowd.liveCount}/${ctx.quality.tier.maxNPCs}`);
    const victims = crowd.list.filter(n => n.active && !n.sitting).slice(0, 3);
    for (const [i, n] of victims.entries()) { n.cool = 0; gs.matter.body.setPosition(n.body, { x: player.x + 26 + i * 12, y: player.y - 8 + i * 12 }); }
    step(2);
    const reacts = count('npc:react');
    ctx.events.emit('bike:bell', { x: player.x, y: player.y });
    step(8);
    assert('a bell near pedestrians makes them step aside with a bubble', count('npc:react') >= reacts + victims.length && victims.every(n => n.state === 'REACT') && live('bubbles') > 0 && live('bubbles') <= 3, `${count('npc:react') - reacts} reacted, ${live('bubbles')} bubbles`);
    const line = crowd.bubbles.items.find(b => b.owner)?.text.text;
    assert('the shout is a translated line', ctx.i18n.lang === 'de' ? /[A-Za-z]/.test(line) && line !== 'npc.react.1' : true, line);
    step(150);
    assert('pedestrians resume and the bubbles go away', victims.every(n => n.state === 'WALK' || n.state === 'STAND') && live('bubbles') === 0, victims.map(n => n.state).join(','));
    const crowdBodies = [...crowd.list.map(n => n.body), ...crowd.dogs.map(d => d.body)];
    assert('pedestrian and dog bodies never meet projectiles', crowdBodies.every(b => !(b.collisionFilter.mask & CAT.PROJECTILE) && !(b.collisionFilter.category & CAT.PROJECTILE)));
  }
};

// crowd pools return to zero
export const crowdCleanup = {
  name: 'crowdCleanup',
  run(game, assert, env) {
    const { pools, live, crowd } = env;
    // ---- crowd cleanup ----
    crowd.clear();
    assert('crowd pools return to zero on cleanup', live('npcs') === 0 && live('dogs') === 0 && live('bubbles') === 0, `${live('npcs')}/${live('dogs')}/${live('bubbles')}`);
  }
};
