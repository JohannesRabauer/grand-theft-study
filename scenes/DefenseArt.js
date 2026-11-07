// Procedural art for the karate defense (story 6.3): per kid (the three characters and the neutral kid) a block pose
// `player-<id>-block` (arms crossed in front), a Kiai pose `player-<id>-kiai` (wide stance, mouth open, fists at the hips) and a
// dodge roll `player-<id>-dodge` (a tucked ball), all drawn from the same figure and palette as the walking sprite
// (scenes/CharacterArt.js) on the 24x32 grid and scaled to the render class like the other kid art; plus the `p-star` particle
// of a dizzy bully. White belt at the waist (the white belt is the baseline).
import { figure } from './HiResArt.js';
import { ScaledPen } from './NpcArt.js';
import { look, DEFAULT_KID } from './CharacterArt.js';

const OUT = '#16161e';
const SKIN = '#f2c9a0';
const SHOE = '#2c2018';

const NEUTRAL = {
  ...DEFAULT_KID, straps: '#e8c24a', zip: '#f6b3ab',
  hair: p => { p.ell('#5a3a1e', 12, 4.5, 6.5, 3.5); p.px('#5a3a1e', 6, 5, 2, 4); p.px('#5a3a1e', 17, 5, 2, 3); p.px('#7a5230', 9, 2, 4, 1); }
};

function belt(p, color = '#f4f4f4') {
  p.px(color, 4, 20, 16, 2);
  p.px('#d0d0d0', 11, 20, 2, 4);
}

// Block: the forearms cross in front of the chest, a small glint on the guard.
function block(p, o) {
  figure(p, o);
  belt(p);
  p.px(o.jacket, 3, 9, 4, 6);
  p.px(o.jacket, 17, 9, 4, 6);
  p.px(o.jacketDark, 5, 13, 14, 3);
  p.px(o.jacketLight, 5, 13, 14, 1);
  p.px(SKIN, 2, 8, 4, 3);
  p.px(SKIN, 18, 8, 4, 3);
  p.px('#ffffff', 9, 12, 2, 1);
  p.px('#ffffff', 10, 11, 1, 3);
}

// Kiai: legs apart, fists at the hips, a big open shout.
function kiai(p, o) {
  figure(p, o);
  p.c.clearRect(0, 20 * p.f, p.w, p.h);
  p.px(o.pants, 6, 20, 12, 3);
  p.px(o.pants, 3, 22, 5, 6);
  p.px(o.pants, 16, 22, 5, 6);
  p.px(SHOE, 2, 27, 6, 2);
  p.px(SHOE, 16, 27, 6, 2);
  belt(p);
  p.px(SKIN, 2, 18, 3, 3);
  p.px(SKIN, 19, 18, 3, 3);
  p.px('#5a1a1a', 10, 11, 4, 3);
  p.px('#ffffff', 11, 11, 2, 1);
  p.px('#222222', 9, 7, 2, 1);
  p.px('#222222', 14, 7, 2, 1);
}

// Dodge: a tucked roll, head and shoes peeking out.
function dodge(p, o) {
  p.ell(o.jacketDark, 12, 22, 9.5, 8);
  p.ell(o.jacket, 12, 21, 9, 7.5);
  p.px(o.jacketLight, 6, 16, 5, 2);
  p.px('#f4f4f4', 5, 22, 14, 2);
  p.ell(SKIN, 16, 15, 4.5, 4);
  p.ell(o.hairLight, 15.5, 13.5, 4.5, 2.4);
  p.px('#222222', 18, 15, 1, 1);
  p.px(o.pants, 4, 26, 6, 3);
  p.px(SHOE, 3, 28, 4, 2);
}

function star(p) {
  p.px('#ffe14d', 3, 0, 2, 8);
  p.px('#ffe14d', 0, 3, 8, 2);
  p.px('#fff6b0', 3, 3, 2, 2);
  p.px('#ffe14d', 1, 1, 1, 1); p.px('#ffe14d', 6, 1, 1, 1); p.px('#ffe14d', 1, 6, 1, 1); p.px('#ffe14d', 6, 6, 1, 1);
}

export function makeDefenseArt(scene, cfg, scale) {
  const f = scale / 2;
  const kids = [...cfg.characters.map(c => [c.id, look(c)]), ['kid', NEUTRAL]];
  for (const [id, o] of kids) {
    for (const [pose, draw] of [['block', block], ['kiai', kiai], ['dodge', dodge]]) {
      const p = new ScaledPen(scene, `player-${id}-${pose}`, 24, 32, f);
      draw(p, o);
      if (scale > 1) p.outline(OUT);
      p.shadow(12, 29.5, 8, 2.5);
      p.done();
    }
  }
  const s = new ScaledPen(scene, 'p-star', 8, 8, f);
  star(s);
  s.done();
}
