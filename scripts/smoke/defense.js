// Smoke scenario: karate defense (story 6.3, AD-24). Registered in scripts/smoke/index.js.
// A Kiai near chasing bullies makes them stumble back (a scripted step, no force) and takes Ärger 2 -> 1 (not at 0, not when no bully
// was reached, level 1 -> 0 ends the chase); pedestrians and dogs in range only gasp and are not moved; a perfectly timed block parries
// a contact and a later one blocks it (no caught frame), a roll dodges it, cooldowns hold, the HUD bar follows, the first trouble toasts
// the tip, and two kids defend independently.
export const defense = {
  name: 'defense',
  run(game, assert, env) {
    const { h, step, until } = env;
    // a fresh single-player run: earlier scenarios may have left co-op or a restarted scene behind
    const prev = game.scene.getScene('Game');
    prev.ctx.state.dispatch('coop.set', { on: false });
    prev.scene.restart();
    step(4);
    const gs = game.scene.getScene('Game');
    const ui = game.scene.getScene('UI');
    const ctx = gs.ctx;
    ctx.input.update = () => {};
    const intent = ctx.input.intent;
    intent.aim = null;
    const player = ctx.players[0];
    for (const ride of [gs.bikes, gs.skateboards, gs.skates]) if (ride.isMounted(0)) ride.dismount(player); // the defense poses are for a kid on foot
    const pose = n => `player-${player.character?.id ?? 'kid'}-${n}`;
    const T = t => h.tilePx(ctx, t);
    const cfg = gs.cache.json.get('karate');
    const white = cfg.belts[0];
    const log = [];
    for (const n of ['defense:kiai', 'defense:parry', 'defense:blocked', 'defense:dodge', 'bully:stumble', 'player:caught', 'chase:level', 'ui:toast']) ctx.events.on(n, e => log.push([n, e]));
    const of = n => log.filter(e => e[0] === n).map(e => e[1]);
    const slot = ctx.defense.forPlayer(0);
    const live = () => ctx.chase.bullies.filter(b => b.active);
    const quiet = () => { ctx.chase.reset(); intent.move.x = intent.move.y = 0; intent.defend = false; intent.kiai = false; };
    const standAt = (x, y, p = player) => {
      gs.matter.body.setPosition(p.body, { x, y });
      gs.matter.body.setVelocity(p.body, { x: 0, y: 0 });
      p.move.speed = p.move.velSpeed = 0;
      p.sprite.setPosition(x, y);
      gs.cameras.main.centerOn(x, y);
      step(25);
    };
    const put = (b, x, y) => {
      gs.matter.body.setPosition(b.body, { x, y });
      gs.matter.body.setVelocity(b.body, { x: 0, y: 0 });
      b.sprite.setPosition(x, y);
      ctx.chase.fsm.enter(b, 'CHASE');
      b.alerted = false;
    };
    const level = n => { ctx.chase.lvl.set(n, 'test'); return live(); };
    const press = key => { intent[key] = true; step(1); intent[key] = false; };
    const rest = () => step(Math.ceil((cfg.timing.kiaiTime + white.kiaiCooldown + 1) * 60)); // kiai cooldown, Mut refilled

    // ---- wiring
    assert('ctx.defense, player.defense and the Mut bar exist', !!ctx.defense && player.defense === slot && slot.state === 'IDLE' && slot.mut === 1 && !!ui.hud.get('defense'));
    assert('every player has defend and kiai intents', 'defend' in intent && 'kiai' in intent && 'defend' in ctx.input.intents[1]);
    quiet();
    standAt(T(3), T(55));
    ctx.state.dispatch('flags.set', { key: cfg.hint.flag, value: false });

    // ---- Kiai: bullies in range stumble, Ärger 2 -> 1, the tip toasts once
    const bullies = level(2);
    assert('level 2 brings three bullies; the first trouble toasts the tip', bullies.length >= 2 && of('ui:toast').some(e => e.key === 'toast.defenseHint') && ui.hud.get('toast').text.visible, `${bullies.length}`);
    const [a, b, far] = bullies;
    const px = player.x;
    const py = player.y;
    put(a, px + 40, py);
    put(b, px - 55, py);
    put(far, px + 200, py);
    const a0 = { x: a.x, y: a.y };
    const mut0 = slot.mut;
    const lvl0 = of('chase:level').length;
    press('kiai');
    assert('the shout stance starts: KIAI state, cooldown and Mut spent', slot.state === 'KIAI' && slot.kiaiCd > white.kiaiCooldown - 0.1 && slot.mut < mut0, `${slot.state} ${slot.kiaiCd} ${slot.mut}`);
    const k = of('defense:kiai').at(-1);
    assert('defense:kiai names the player, the radius and the two bullies in range (not the far one)', k && k.player === 0 && k.radius === white.kiaiRadius && k.affected.length === 2 && k.affected.includes(a.id) && k.affected.includes(b.id) && !k.affected.includes(far.id), JSON.stringify(k));
    assert('both stumble (state STUMBLE, bully:stumble twice), the far one carries on', a.state === 'STUMBLE' && b.state === 'STUMBLE' && far.state === 'CHASE' && of('bully:stumble').length === 2, `${a.state} ${b.state} ${far.state}`);
    assert('Ärger fell 2 -> 1 through the director (reason defend)', ctx.chase.level === 1 && of('chase:level').slice(lvl0).some(e => e.level === 1 && e.reason === 'defend'), `level ${ctx.chase.level}`);
    assert('the shout bubble, stars and the KIAI! burst are showing', ctx.defense.bubbles.items.some(i => i.owner === a) && ctx.defense.fx.slots[0].shoutT >= 0 && ctx.defense.fx.slots[0].ringT >= 0 && ctx.defense.fx.slots[0].text.visible);
    assert('the kid strikes the Kiai pose', player.sprite.texture.key === pose('kiai'), player.sprite.texture.key);
    step(Math.ceil(cfg.stumble.step * 60) + 6);
    const moved = Math.hypot(a.x - a0.x, a.y - a0.y);
    assert('a stumbles straight away from the kid by the scripted distance (no force: no velocity left)', Math.abs(moved - cfg.stumble.kiaiDistance) < 5 && a.x > a0.x - 2 && Math.hypot(a.body.velocity.x, a.body.velocity.y) < 0.5, `${moved.toFixed(1)} px`);
    assert('no catch, no caught frame, nobody hurt', of('player:caught').length === 0 && a.active && b.active && ctx.chase.bullies.every(x => x.state !== 'CAUGHT'));
    assert('the pose ends with the stance', slot.state !== 'KIAI' && player.sprite.texture.key !== pose('kiai'));
    assert('after the stumble the bullies come on again', until(() => a.state !== 'STUMBLE' && b.state !== 'STUMBLE', 120) >= 0 && a.state !== 'GIVE_UP', a.state);

    // ---- cooldown and Mut hold
    press('kiai');
    assert('a second Kiai during the cooldown does nothing', of('defense:kiai').length === 1 && slot.kiaiCd > 0);
    assert('the Mut bar follows (pixels drawn from the slot)', ui.hud.get('defense').key >= 0 && slot.mut < 1);
    const lvl1 = ctx.chase.level;
    quiet();
    rest();

    // ---- no bully in range: Ärger stays; level 0 stays 0
    level(2);
    for (const x of live()) put(x, px + 250, py);
    press('kiai');
    assert('a Kiai that reaches nobody does not lower Ärger', of('defense:kiai').length === 2 && of('defense:kiai').at(-1).affected.length === 0 && ctx.chase.level === 2, `level ${ctx.chase.level}`);
    quiet();
    rest();
    press('kiai');
    assert('at level 0 the Kiai changes nothing (level stays 0)', of('defense:kiai').length === 3 && of('defense:kiai').at(-1).affected.length === 0 && ctx.chase.level === 0 && lvl1 === 1);
    rest();

    // ---- level 1 -> 0: the chase ends, the stumbling bully finishes its step first and then walks off
    level(1);
    const [only] = live();
    put(only, px + 30, py);
    press('kiai');
    assert('at level 1 the Kiai ends the chase', ctx.chase.level === 0 && only.state === 'STUMBLE' && only.resume === 'GIVE_UP');
    step(Math.ceil(white.stumbleDuration * 60) + 6);
    assert('then the bully gives up', only.state === 'GIVE_UP' || !only.active, only.state);
    quiet();
    rest();

    // ---- pedestrians and dogs only gasp
    standAt(T(3), T(55));
    ctx.crowd.fill?.(true);
    const npc = ctx.crowd.list.find(n => n.active);
    const dog = ctx.dogs.spawn(player.x - 25, player.y + 5, 'CALM');
    const bully = level(2)[0];
    put(bully, player.x + 35, player.y);
    const place = (o, x, y) => { gs.matter.body.setPosition(o.body, { x, y }); gs.matter.body.setVelocity(o.body, { x: 0, y: 0 }); };
    place(npc, player.x + 20, player.y + 14);
    const npcAt = { x: npc.x, y: npc.y };
    const dogAt = { x: dog.x, y: dog.y };
    const npcState = npc.state;
    press('kiai');
    assert('the pedestrian and the dog gasp "Oha!"', ctx.defense.bubbles.items.some(i => i.owner === npc && i.text.text === ctx.t('defense.gasp')) && ctx.defense.bubbles.items.some(i => i.owner === dog && i.text.text === ctx.t('defense.gasp')));
    assert('they are not moved, pushed or put in a stumble', Math.hypot(npc.x - npcAt.x, npc.y - npcAt.y) < 2 && Math.hypot(dog.x - dogAt.x, dog.y - dogAt.y) < 1.5 && npc.state === npcState && dog.state === 'CALM' && of('bully:stumble').every(e => typeof e.bully === 'number'));
    assert('only the bully stumbled', of('defense:kiai').at(-1).affected.length === 1 && of('defense:kiai').at(-1).affected[0] === bully.id);
    ctx.dogs.unloadMap();
    quiet();
    rest();

    // ---- block: a perfectly timed contact is a parry, a later one a plain block, no caught frame
    standAt(T(3), T(55));
    level(1);
    const [p1] = live();
    put(p1, player.x + 60, player.y);
    const xp0 = ctx.state.players[0].xp;
    intent.defend = true;
    step(1);
    assert('holding defend raises the guard: BLOCK state and pose', slot.state === 'BLOCK' && player.sprite.texture.key === pose('block') && player.move.defenseMult < 1, `${slot.state}`);
    put(p1, player.x + 6, player.y);
    step(1);
    const parry = of('defense:parry').at(-1);
    assert('the contact right at the start is a parry: event, XP, no catch', !!parry && parry.player === 0 && of('player:caught').length === 0 && ctx.state.players[0].xp === xp0 + cfg.timing.parryXp, `xp ${ctx.state.players[0].xp}`);
    assert('the bully bounces back with a "Hmpf!"', p1.state === 'STUMBLE' && ctx.defense.bubbles.items.some(i => i.owner === p1 && i.text.text === ctx.t('defense.bully.block')) && of('bully:stumble').at(-1).reason === 'parry');
    step(Math.ceil(white.stumbleDuration * cfg.stumble.bounceScale * 60) + 4);
    assert('the guard is still up', slot.state === 'BLOCK');
    const mut1 = slot.mut;
    put(p1, player.x + 6, player.y);
    step(1);
    const blocked = of('defense:blocked');
    assert('a later contact is a plain block (costs Mut, not perfect), no caught frame', blocked.length === 2 && !blocked.at(-1).perfect && slot.mut < mut1 - cfg.mut.blockCost + 0.02 && of('player:caught').length === 0 && of('defense:parry').length === 1, `${slot.mut}`);
    intent.defend = false;
    step(Math.ceil((cfg.timing.recoverTime + 0.1) * 60));
    assert('letting go ends the guard and the pose', slot.state === 'IDLE' && player.sprite.texture.key !== pose('block') && player.move.defenseMult === 1);
    quiet();

    // ---- dodge: invulnerable roll along the walking direction, then the cooldown
    standAt(T(3), T(55));
    level(1);
    const [d1] = live();
    const x0 = player.x;
    intent.move.x = 1;
    press('defend');
    assert('defend while walking starts a roll: DODGE state, dodge event, invulnerable', slot.state === 'DODGE' && slot.invuln > 0 && of('defense:dodge').length === 1);
    let ok = true;
    for (let i = 0; i < Math.round(cfg.timing.dodgeTime * 60) - 2; i++) { put(d1, player.x + 2, player.y); step(1); ok = ok && of('player:caught').length === 0 && d1.state === 'CHASE'; }
    intent.move.x = 0;
    assert('a bully on top of the kid during the roll catches nothing', ok && of('player:caught').length === 0);
    put(d1, player.x + 250, player.y);
    step(Math.ceil((cfg.timing.dodgeGrace + cfg.timing.recoverTime) * 60) + 4);
    assert('the roll carried the kid about dodgeDistance and the dodge cooldown runs', player.x - x0 > white.dodgeDistance * 0.55 && player.x - x0 < white.dodgeDistance * 1.6 && slot.dodgeCd > 0, `${(player.x - x0).toFixed(1)} px, cd ${slot.dodgeCd.toFixed(2)}`);
    intent.move.x = 1;
    press('defend');
    intent.move.x = 0;
    assert('during the cooldown a press blocks instead of rolling', slot.state === 'BLOCK' && of('defense:dodge').length === 1);
    step(1);
    quiet();
    rest();

    // ---- two kids defend independently
    const p2 = game.addPlayer();
    step(4);
    const other = ctx.input.intents[1];
    const slot2 = ctx.defense.forPlayer(1);
    standAt(T(3), T(55), player);
    standAt(T(3) + 160, T(55), p2);
    level(1);
    const [c1] = live();
    put(c1, p2.x + 30, p2.y);
    other.kiai = true;
    step(1);
    other.kiai = false;
    assert('P2 shouts: only its slot and Mut change, P1 stays idle', slot2.state === 'KIAI' && slot.state === 'IDLE' && slot.mut === 1 && of('defense:kiai').at(-1).player === 1, `${slot2.state} ${slot.state}`);
    assert('a bully chasing either kid in P2\'s radius stumbles', c1.state === 'STUMBLE' && of('defense:kiai').at(-1).affected.includes(c1.id));
    step(Math.ceil((cfg.timing.kiaiTime + cfg.timing.recoverTime) * 60) + 8);
    other.defend = true;
    step(1);
    ctx.chase.lvl.set(1, 'test');
    put(c1, p2.x + 6, p2.y);
    step(1);
    other.defend = false;
    assert('P2 blocks a contact while P1 (idle, away) is untouched', of('defense:blocked').at(-1)?.player === 1 && of('player:caught').length === 0 && slot.state === 'IDLE');
    quiet();
    const [c3] = level(1);
    const caught = until(() => of('player:caught').length >= 1, 120, () => { put(c3, player.x + 5, player.y); });
    assert('an undefended kid is still caught the normal way', caught >= 0 && of('player:caught')[0].player === 0, `${caught}`);
    step(240);
    quiet();
  }
};
