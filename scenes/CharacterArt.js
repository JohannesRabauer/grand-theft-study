// Procedural art for the playable characters (CAP-12): the same figure and bike drawers as the default kid
// (HiResArt.js), parametrised by the palette of each character in data/characters.json, so the three differ in
// outfit colours, hair style and accessory. Per character it makes `player-<id>` (walking), `player-<id>-bike`
// (riding), `player-<id>-skate` plus `-crouch` and `-manual` (skateboard poses) and `portrait-<id>` (character select card). Drawn on the 24x32 / 40x24 authoring grids and scaled to
// the render class like the pedestrians (NpcArt.js): 2x with outline on Medium/High, 1x on Low.
import { figure, bike, skate, OUT, lighten } from './HiResArt.js';
import { ScaledPen } from './NpcArt.js';

const DARK = '#2a2a35';

// Hair behind and around the head on the front-facing figure (head centre 12,7).
const HAIR = {
  ponytail(p, o) {
    p.ell(o.hair, 12, 4.5, 6.5, 3.5); p.px(o.hair, 6, 5, 2, 4); p.px(o.hair, 17, 5, 2, 3);
    p.px(o.hair, 19, 6, 3, 7); p.px(o.hairLight, 20, 7, 1, 4); p.px(o.straps, 19, 6, 3, 1);
    p.px(o.hairLight, 9, 2, 5, 1);
  },
  short(p, o) {
    p.ell(o.hair, 12, 4, 6.3, 3); p.px(o.hair, 6, 5, 1, 3); p.px(o.hair, 18, 5, 1, 3);
    p.px(o.hairLight, 9, 2, 5, 1);
  },
  curly(p, o) {
    p.ell(o.hair, 12, 3.6, 7.2, 4); p.ell(o.hair, 6.2, 5, 2.2, 2.6); p.ell(o.hair, 17.8, 5, 2.2, 2.6);
    p.ell(o.hair, 9, 1.2, 2.6, 2); p.ell(o.hair, 15, 1.2, 2.6, 2); p.px(o.hair, 5, 6, 2, 4); p.px(o.hair, 18, 6, 2, 4);
    p.px(o.hairLight, 8, 2, 2, 1); p.px(o.hairLight, 14, 1, 2, 1);
  }
};

// Drawn after the eyes: things worn on the face and head.
const WORN = {
  glasses(p) {
    for (const x of [8, 13]) { p.px(DARK, x, 7, 4, 1); p.px(DARK, x, 10, 4, 1); p.px(DARK, x, 8, 1, 2); p.px(DARK, x + 3, 8, 1, 2); }
    p.px(DARK, 12, 8, 1, 1);
  },
  headband(p, o) { p.px(o.straps, 6, 3, 12, 2); p.px(lighten(o.straps, 0.4), 7, 3, 5, 1); },
  headphones(p, o) {
    p.px(DARK, 6, 1, 12, 1); p.px(DARK, 5, 2, 1, 5); p.px(DARK, 18, 2, 1, 5);
    p.px(DARK, 3, 6, 3, 5); p.px(DARK, 18, 6, 3, 5); p.px(o.straps, 3, 7, 1, 3); p.px(o.straps, 20, 7, 1, 3);
  }
};

// The same, seen from above for the rider (head centre 17.5,12 on the 40x24 grid, facing right).
const TOP = {
  ponytail(p, o) { p.px(o.hair, 8, 11, 5, 3); p.px(o.straps, 12, 11, 1, 3); },
  short() {},
  curly(p, o) { p.ell(o.hair, 17, 12, 5.6, 5.8); p.px(o.hairLight, 14, 8, 4, 1); p.px(o.hairLight, 13, 12, 2, 1); },
  glasses() {},
  headband(p, o) { p.px(o.straps, 17, 7, 2, 10); },
  headphones(p) { p.px(DARK, 16, 7, 1, 10); p.px(DARK, 15, 5, 4, 3); p.px(DARK, 15, 16, 4, 3); }
};

function look(c) {
  const o = c.palette;
  return {
    ...o,
    hair: p => HAIR[o.hairStyle](p, o),
    brows: p => WORN[o.accessory](p, o)
  };
}

function ride(c) {
  const o = c.palette;
  return { ...o, rider: true, cap: p => { TOP[o.hairStyle](p, o); TOP[o.accessory](p, o); } };
}

const BOARD = { frame: '#e8a33a', frameDark: '#a8701c' };
const POSES = ['', '-crouch', '-manual'];
const DEFAULT_KID = { jacket: '#e0483c', jacketDark: '#b2352c', jacketLight: '#f06a5c', pants: '#2a3f8f', hair: '#5a3a1e', hairLight: '#7a5230' };

export function makeCharacterArt(scene, cfg, scale) {
  const f = scale / 2;
  const finish = p => { if (scale > 1) p.outline(OUT); return p; };
  // Boards and rider poses; the rider has no baked shadow because the sprite lifts off it (entities/Skateboards.js)
  const board = new ScaledPen(scene, 'skateboard', 40, 24, f);
  skate(board, BOARD);
  finish(board).shadow(20, 18.5, 15, 2.5, 0.25);
  board.done();
  const shade = new ScaledPen(scene, 'skate-shadow', 40, 24, f);
  shade.ell('rgba(0,0,0,0.28)', 20, 12, 15, 4.5);
  shade.done();
  const poses = (id, o) => POSES.forEach(suffix => {
    const rider = new ScaledPen(scene, `${id}${suffix}`, 40, 24, f);
    skate(rider, { ...BOARD, ...o, rider: true, pose: suffix.slice(1) || 'roll' });
    finish(rider).done();
  });
  poses('player-skate', DEFAULT_KID);
  for (const c of cfg.characters) {
    const walk = new ScaledPen(scene, `player-${c.id}`, 24, 32, f);
    figure(walk, look(c));
    finish(walk).shadow(12, 29.5, 8, 2.5);
    walk.done();

    const rider = new ScaledPen(scene, `player-${c.id}-bike`, 40, 24, f);
    bike(rider, ride(c));
    finish(rider).shadow(20, 20.5, 16, 2.5, 0.25);
    rider.done();

    poses(`player-${c.id}-skate`, ride(c));

    const portrait = new ScaledPen(scene, `portrait-${c.id}`, 24, 32, f);
    portrait.ell(c.palette.backdrop, 12, 16, 11.5, 15.5);
    figure(portrait, look(c));
    finish(portrait);
    portrait.done();
  }
}
