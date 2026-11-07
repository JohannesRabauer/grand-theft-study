// Smoke scenarios: characters. Each export is { name, run(game, assert, env) }; registered in scripts/smoke/index.js.
// CAP-12: attribute modifiers show up in measured top speed and stamina, the three looks differ, growth hooks raise
// attributes and growth survives a save and load (into an in-memory storage, so no real save slot is touched).
import { SaveSlots } from '../../state/SaveSlots.js';

const memoryStorage = () => {
  const m = new Map();
  return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
};

export const characters = {
  name: 'characters',
  run(game, assert, env) {
    const { h, step, intent, ctx, gs, player } = env;
    const before = ctx.state.data;
    const ids = ctx.characters.cfg.characters.map(c => c.id);
    const quiet = () => { ctx.chase.reset(); h.teleport(gs, ctx, 7, 51); step(20); };
    const become = id => { ctx.state.dispatch('player.setCharacter', { player: 0, character: id }); ctx.characters.apply(player); player.move.stamina = 1; player.move.exhausted = false; };
    const hash = key => { const img = game.textures.get(key).getSourceImage(); const c = img.getContext('2d'); let s = 0; const d = c.getImageData(0, 0, img.width, img.height).data; for (let i = 0; i < d.length; i += 7) s = (s * 31 + d[i]) | 0; return s; };

    // ---- measured top speed (sprinting on foot) and stamina (frames of sprinting until exhausted)
    const speed = {};
    const frames = {};
    for (const id of ids) {
      quiet();
      become(id);
      intent.move.x = 1;
      intent.sprint = true;
      let top = 0;
      for (let i = 0; i < 40; i++) { step(1); top = Math.max(top, player.move.velSpeed); }
      speed[id] = top;
      quiet();
      become(id);
      intent.move.x = 0.05; // moving (above the dead zone) but hardly any distance
      let n = 0;
      while (!player.move.exhausted && n < 700) { step(1); n++; }
      frames[id] = n;
      intent.move.x = 0;
      intent.sprint = false;
    }
    const fmt = o => ids.map(id => `${id} ${o[id].toFixed ? o[id].toFixed(1) : o[id]}`).join(', ');
    assert('top speed follows Tempo: Mehmet > Jonas > Lena', speed.mehmet > speed.jonas && speed.jonas > speed.lena, fmt(speed));
    assert('Mehmet is about 24% faster than Lena (Tempo 9 vs 5)', Math.abs(speed.mehmet / speed.lena - 1.24) < 0.06, (speed.mehmet / speed.lena).toFixed(3));
    assert('stamina lasts with Ausdauer: Mehmet > Lena, Lena = Jonas', frames.mehmet > frames.lena * 1.2 && Math.abs(frames.jonas - frames.lena) < 3, fmt(frames));

    // ---- identity: distinct looks, start vehicles, bully weights, perks
    become('lena');
    assert('Lena looks like Lena and starts on the bike, bullies weight her up', player.sprite.texture.key === 'player-lena' && player.startVehicle === 'bike' && player.bullyWeight > 1 && player.perks.aimPrecision > 0, `${player.sprite.texture.key}/${player.startVehicle}/${player.bullyWeight}`);
    become('mehmet');
    assert('Mehmet: own look, starts on his skateboard, trick and stick perks', player.sprite.texture.key === 'player-mehmet' && player.startVehicle === 'skateboard' && player.perks.trickMultiplier > 1 && player.perks.stickThrowRange > 1);
    become('jonas');
    assert('Jonas: own look, starts on skates, bus and talk perks', player.sprite.texture.key === 'player-jonas' && player.startVehicle === 'skates' && player.perks.busGrabBonus > 0 && player.perks.talkDownBonus > 0);
    player.setVehicle('bike');
    assert('the bike look is the character own', player.sprite.texture.key === 'player-jonas-bike');
    player.setVehicle('foot');
    const looks = ['player-lena', 'player-mehmet', 'player-jonas', 'player-lena-bike', 'player-mehmet-bike', 'player-jonas-bike', 'player'];
    assert('every walk and bike look is a different picture', new Set(looks.map(hash)).size === looks.length);
    assert('scatter order Lena < Jonas < Mehmet (Zielen and precision perk)', (become('lena'), player.mods.spread) < (become('jonas'), player.mods.spread) && player.mods.spread < (become('mehmet'), player.mods.spread));

    // ---- growth hooks and persistence
    become('mehmet');
    const a0 = { ...player.attrs };
    ctx.events.emit('style:banked', { player: 0, points: 90 });
    ctx.events.emit('quiz:correct', { player: 0 });
    ctx.events.emit('lesson:done', { player: 0 });
    ctx.events.emit('karate:belt', { player: 0 });
    ctx.events.emit('prop:hit', { source: 'slingshot', player: 0, dist: 90 });
    ctx.events.emit('prop:hit', { source: 'slingshot', player: 0, dist: 10 });
    const a1 = player.attrs;
    assert('matching activities raise tempo, wissen, ordnung and zielen (by fractions)', a1.tempo > a0.tempo && a1.wissen > a0.wissen && a1.ordnung > a0.ordnung && a1.zielen > a0.zielen && a1.tempo - a0.tempo < 1, `${a0.tempo}->${a1.tempo}, ${a0.wissen}->${a1.wissen}`);
    assert('a slingshot hit too close does not count, charme and ausdauer stay', Math.abs(a1.zielen - a0.zielen - 0.12) < 1e-9 && a1.charme === a0.charme && a1.ausdauer === a0.ausdauer);
    const hit = env.events.filter(e => e[0] === 'prop:hit' && e[1].source === 'slingshot').pop();
    assert('a real slingshot hit reports its source, shooter and distance (info)', true, hit ? `${hit[1].source} p${hit[1].player} ${hit[1].dist.toFixed(0)}px` : 'no real hit this run');
    const speedAfter = player.move.speedMult;
    const store = new SaveSlots(ctx.state, { on() {}, emit() {} }, memoryStorage());
    const grownTempo = a1.tempo;
    assert('saved', store.save(1));
    become('lena');
    assert('a different character resets to its base', player.attrs.tempo === 5);
    assert('loaded', store.load(1));
    ctx.characters.apply(player);
    assert('growth persists through save and load, modifiers follow', player.attrs.tempo === grownTempo && player.character.id === 'mehmet' && Math.abs(player.move.speedMult - speedAfter) < 1e-9, `${player.attrs.tempo} ${player.move.speedMult.toFixed(3)}`);

    // ---- back to the neutral kid the later scenarios expect
    ctx.state.replace(before);
    ctx.characters.apply(player);
    intent.move.x = 0;
    intent.sprint = false;
    quiet();
    assert('neutral kid restored (default look, no modifiers)', player.sprite.texture.key === 'player' && player.move.speedMult === 1 && player.character === null);
  }
};
