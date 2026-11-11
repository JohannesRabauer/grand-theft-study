// Procedural art for the playable characters (CAP-12): the same figure and bike drawers as the default kid
// (HiResArt.js), parametrised by the palette and look flags of each character in data/characters.json (hair style, glasses, eye colour,
// freckles), so the three differ in outfit colours, hair, face and accessory. Per character it makes `player-<id>` (walking), `player-<id>-bike`
// (riding), `player-<id>-skate` plus `-crouch` and `-manual` (skateboard poses), `player-<id>-skates` plus `-pushA`, `-pushB`, `-crouch` and `-grab` (inline skates, scenes/SkatesArt.js) and `portrait-<id>` (character select card). Drawn on the 24x32 / 40x24 authoring grids and scaled to
// the render class like the pedestrians (NpcArt.js): 2x with outline on Medium/High, 1x on Low.
import { figure, bike, skate, OUT } from './HiResArt.js';
import { ScaledPen } from './NpcArt.js';
import { skates } from './SkatesArt.js';
import { scooter } from './VehicleArt.js';

const DARK = '#2a2a35';

// Hair behind and around the head on the front-facing figure (head centre 12,7).
const HAIR = {
  short(p, o) {
    p.ell(o.hair, 12, 4, 6.3, 3); p.px(o.hair, 6, 5, 1, 3); p.px(o.hair, 18, 5, 1, 3);
    p.px(o.hairLight, 9, 2, 5, 1);
  },
  // down to the shoulders on both sides, a straight fringe
  shoulder(p, o) {
    p.ell(o.hair, 12, 4.2, 6.6, 3.6); p.px(o.hair, 5, 4, 3, 5); p.px(o.hair, 17, 4, 3, 5);
    p.px(o.hair, 5, 9, 2, 5); p.px(o.hair, 18, 9, 2, 5);
    p.px(o.hairLight, 9, 2, 5, 1); p.px(o.hairLight, 5, 6, 1, 6); p.px(o.hairLight, 18, 6, 1, 4);
  },
  // long, big, messy: tufts sticking out in every direction
  wild(p, o) {
    p.ell(o.hair, 12, 3.2, 7.6, 4.4); p.ell(o.hair, 6.5, 2, 2.4, 2.6); p.ell(o.hair, 12, 0.8, 2.8, 2.2); p.ell(o.hair, 17.5, 2, 2.4, 2.6);
    p.px(o.hair, 4, 4, 3, 8); p.px(o.hair, 17, 4, 3, 9); p.px(o.hair, 3, 8, 2, 4); p.px(o.hair, 20, 7, 2, 5); p.px(o.hair, 5, 12, 2, 2);
    p.px(o.hairLight, 8, 1, 3, 1); p.px(o.hairLight, 14, 0, 2, 1); p.px(o.hairLight, 4, 5, 1, 5); p.px(o.hairLight, 18, 5, 1, 4);
  }
};

const GLASSES = p => {
  for (const x of [8, 13]) { p.px(DARK, x, 7, 4, 1); p.px(DARK, x, 10, 4, 1); p.px(DARK, x, 8, 1, 2); p.px(DARK, x + 3, 8, 1, 2); }
  p.px(DARK, 12, 8, 1, 1);
};

const FRECKLES = [[7, 9], [17, 9], [8, 11], [10, 11], [14, 11], [16, 11]];

// The same, seen from above for the rider (head centre 17.5,12 on the 40x24 grid, facing right).
const TOP = {
  short() {},
  shoulder(p, o) { p.px(o.hair, 9, 9, 7, 6); p.px(o.hairLight, 10, 10, 4, 1); },
  wild(p, o) { p.ell(o.hair, 17, 12, 5.8, 6); p.px(o.hair, 10, 8, 4, 3); p.px(o.hair, 9, 13, 5, 3); p.px(o.hairLight, 14, 8, 4, 1); p.px(o.hairLight, 12, 14, 2, 1); }
};

// The look flags of data/characters.json (hairStyle, glasses, eyes, freckles) turned into figure options.
export function look(c) {
  const o = c.palette;
  const l = c.look;
  return {
    ...o,
    eyes: l.eyes,
    hair: p => HAIR[l.hairStyle](p, o),
    brows: p => {
      if (l.freckles) for (const [x, y] of FRECKLES) p.px('#a8532a', x, y, 1, 1);
      if (l.glasses) GLASSES(p);
    }
  };
}

function ride(c) {
  const o = c.palette;
  const l = c.look;
  return { ...o, rider: true, cap: p => { TOP[l.hairStyle](p, o); if (l.glasses) p.px(DARK, 23, 10, 1, 4); } };
}

const BOARD = { frame: '#e8a33a', frameDark: '#a8701c' };
const POSES = ['', '-crouch', '-manual'];
const SKATE_POSES = ['', '-pushA', '-pushB', '-crouch', '-grab'];
const NEW_RIDES = [
  { id: 'scooter', draw: scooter, palette: { frame: '#39b6c0', frameDark: '#21717c' }, poses: ['', '-crouch'] },
  { id: 'rollerblades', draw: skates, palette: { frame: '#548cec', frameDark: '#284d91', inline: true }, poses: ['', '-pushA', '-pushB', '-crouch'] }
];
export const DEFAULT_KID = { jacket: '#e0483c', jacketDark: '#b2352c', jacketLight: '#f06a5c', pants: '#2a3f8f', hair: '#5a3a1e', hairLight: '#7a5230' };

export function makeCharacterArt(scene, cfg, scale) {
  const f = scale / 2;
  // riders, boards and rides turn with the heading in game, the standing figure does not
  const finish = (p, turn = true) => p.lit(OUT, scale > 1, turn);
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
  const skatePoses = (id, o) => SKATE_POSES.forEach(suffix => {
    const rider = new ScaledPen(scene, `${id}${suffix}`, 40, 24, f);
    skates(rider, { ...BOARD, ...o, rider: true, pose: suffix.slice(1) });
    finish(rider).done();
  });
  const pair = new ScaledPen(scene, 'skates', 40, 24, f);
  skates(pair, BOARD);
  finish(pair).shadow(20, 20, 12, 2.5, 0.25);
  pair.done();
  poses('player-skate', DEFAULT_KID);
  skatePoses('player-skates', DEFAULT_KID);
  const newRidePoses = (prefix, o) => {
    for (const ride of NEW_RIDES) for (const suffix of ride.poses) {
      const p = new ScaledPen(scene, `${prefix}-${ride.id}${suffix}`, 40, 24, f);
      ride.draw(p, { ...ride.palette, ...o, rider: true, pose: suffix.slice(1) });
      finish(p).done();
    }
  };
  for (const ride of NEW_RIDES) {
    const p = new ScaledPen(scene, ride.id, 40, 24, f);
    ride.draw(p, ride.palette);
    finish(p).shadow(20, 20, 15, 2.5, 0.25);
    p.done();
  }
  newRidePoses('player', DEFAULT_KID);
  for (const c of cfg.characters) {
    const walk = new ScaledPen(scene, `player-${c.id}`, 24, 32, f);
    figure(walk, look(c));
    finish(walk, false).shadow(12, 29.5, 8, 2.5);
    walk.done();

    const rider = new ScaledPen(scene, `player-${c.id}-bike`, 40, 24, f);
    bike(rider, ride(c));
    finish(rider).shadow(20, 20.5, 16, 2.5, 0.25);
    rider.done();

    poses(`player-${c.id}-skate`, ride(c));
    skatePoses(`player-${c.id}-skates`, ride(c));
    newRidePoses(`player-${c.id}`, ride(c));

    const portrait = new ScaledPen(scene, `portrait-${c.id}`, 24, 32, f);
    portrait.ell(c.palette.backdrop, 12, 16, 11.5, 15.5);
    figure(portrait, look(c));
    if (scale > 1) portrait.outline(OUT);
    portrait.done();
  }
}
