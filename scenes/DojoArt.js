// Procedural art of the dojo (story 6.4): the textures made once at boot (`belt-tag`, the waist tag tinted per belt; `sensei`, the
// master in a white gi with a black belt; `dojo-facade`, the building seen from the town street) and the Phaser graphics of the
// dojo interior (wall panel, scroll, banners, lanterns, mat edges, the belt rack), which entities/Dojo.js creates per map and
// destroys with it. The authoring grid of the textures is the 2x grid of NpcArt (a 24x32 figure is 12x16 world px at 2x).
import { hex } from '../render/baseMath.js';
import { darken, lighten, OUT } from './HiResArt.js';
import { ScaledPen, person } from './NpcArt.js';


function sensei(p, o) {
  person(p, o, 2);
  p.px(o.belt, 6, 20, 12, 2); // black belt over the gi
  p.px(o.belt, 11, 22, 2, 3);
  p.px('#d6d6d6', 10, 11, 1, 6); // the gi's crossed collar
  p.px('#d6d6d6', 13, 11, 1, 6);
}

function roof(p, W) {
  const tile = '#8b3a2f';
  p.px(darken(tile, 0.35), 0, 33, W, 5); // eave shadow
  for (let y = 5; y < 34; y++) {
    const inset = Math.round((34 - y) * 0.5);
    p.px(y % 7 === 6 ? darken(tile, 0.25) : tile, inset, y, W - 2 * inset, 1);
    for (let x = inset + (y % 14 < 7 ? 0 : 6); x < W - inset; x += 12) p.px(lighten(tile, 0.14), x, y, 1, 6);
  }
  p.px(darken(tile, 0.45), 18, 2, W - 36, 4); // ridge cap
  p.px(lighten(tile, 0.3), 18, 2, W - 36, 1);
  p.px(darken(tile, 0.2), 0, 31, W, 3);
}

function facade(p, W, H) {
  roof(p, W);
  p.px('#ebdfc4', 0, 38, W, H - 38); // plaster wall
  p.px('#cdbb97', 0, H - 8, W, 8);
  p.px('#5b3a22', 0, 38, W, 4); // beam under the roof
  for (const x of [0, 56, 136, W - 8]) p.px('#5b3a22', x, 38, 8, H - 38); // posts
  for (const x of [16, 144]) { // shoji windows
    p.px('#5b3a22', x - 2, 58, 36, 34);
    p.px('#f6efd8', x, 60, 32, 30);
    for (let i = 8; i < 32; i += 8) p.px('#b8a678', x + i, 60, 1, 30);
    for (let j = 10; j < 30; j += 10) p.px('#b8a678', x, 60 + j, 32, 1);
  }
  p.px('#5b3a22', 72, 52, 48, H - 52); // door frame and the dark doorway
  p.px('#2b1a10', 76, 56, 40, H - 56);
  p.px('#2a3f8f', 78, 56, 36, 20); // the noren curtain
  for (const x of [88, 98, 108]) p.px('#1c2c66', x, 58, 1, 18);
  p.px('#ffffff', 94, 62, 8, 8);
  p.px('#d6352b', 97, 65, 2, 2);
  p.px('#7a4b2a', 16, 44, W - 32, 14); // sign plank
  p.px('#e8b04b', 16, 44, W - 32, 1);
  p.px('#e8b04b', 16, 57, W - 32, 1);
  for (const x of [62, 128]) { // paper lanterns beside the door
    p.ell('#d6352b', x, 74, 6, 8);
    p.px('#8e1b13', x - 6, 72, 12, 1);
    p.px('#e8b04b', x - 2, 64, 4, 2);
  }
}

// Textures made once at boot. `cfg` is data/karate.json, `scale` the render class (1 on Low, 2 on Medium/High).
export function makeDojoArt(scene, cfg, scale) {
  const f = scale / 2;
  const finish = p => { if (scale > 1) p.outline(OUT); return p; };
  const tag = new ScaledPen(scene, 'belt-tag', 16, 4, f);
  tag.px('#ffffff', 0, 0, 16, 2);
  tag.px('#c9c9c9', 0, 1, 16, 1);
  tag.px('#ffffff', 7, 2, 2, 2);
  finish(tag).done();
  const master = new ScaledPen(scene, 'sensei', 24, 32, f);
  sensei(master, cfg.sensei);
  finish(master).shadow(12, 29.5, 8, 2.5);
  master.done();
  const W = 192;
  const H = 96;
  const front = new ScaledPen(scene, 'dojo-facade', W, H, f);
  facade(front, W, H);
  finish(front).done();
}

// ---------------------------------------------------------------- interior

const PLASTER = 0xebdfc4;
const WOOD = 0x5b3a22;

// The static dojo decoration of a map into `gfx` (depth between the floor and the people): the back wall of row 0, the sensei's
// scroll, banners, lanterns and the straw mats' edges with the dragon emblem. `roles` maps the `dojo` object roles to their objects.
export function drawInterior(gfx, map, roles) {
  const ts = map.tileSize;
  const W = map.rows[0].length * ts;
  gfx.fillStyle(PLASTER, 1).fillRect(ts, 0, W - 2 * ts, ts);
  gfx.fillStyle(0xcdbb97, 1).fillRect(ts, ts - 5, W - 2 * ts, 5);
  gfx.fillStyle(WOOD, 1).fillRect(ts, 0, W - 2 * ts, 2).fillRect(ts, ts - 2, W - 2 * ts, 2);
  for (let x = ts * 2; x < W - ts; x += ts * 4) gfx.fillStyle(WOOD, 1).fillRect(x, 0, 3, ts - 2);
  const s = roles.sensei;
  if (s) { // the scroll behind the sensei: a red sun and a calm brush stroke
    const cx = (s.x + 0.5) * ts;
    gfx.fillStyle(0xf3e9cf, 1).fillRect(cx - 14, 1, 28, 14).lineStyle(1, WOOD, 1).strokeRect(cx - 14.5, 1.5, 28, 14);
    gfx.fillStyle(0xc0392b, 1).fillCircle(cx, 7, 4);
    gfx.fillStyle(0x16161e, 1).fillRect(cx - 9, 11, 18, 1).fillRect(cx - 6, 12, 12, 1);
    for (const dx of [-3.2, 3.2]) gfx.fillStyle(0xc0392b, 1).fillRect((s.x + 0.5 + dx) * ts - 5, 1, 10, 12).fillStyle(0xe8b04b, 1).fillRect((s.x + 0.5 + dx) * ts - 5, 1, 10, 1).fillStyle(0xf3e9cf, 1).fillRect((s.x + 0.5 + dx) * ts - 1, 3, 2, 8);
  }
  const mats = roles.mats;
  if (mats) {
    gfx.lineStyle(1, 0x5a6b3a, 0.9);
    for (let r = 0; r < mats.h; r++) {
      for (let c = -(r % 2); c < mats.w; c += 2) {
        const x = Math.max(mats.x * ts, (mats.x + c) * ts);
        const w = Math.min((mats.x + mats.w) * ts, (mats.x + c + 2) * ts) - x;
        gfx.strokeRect(x + 0.5, (mats.y + r) * ts + 0.5, w - 1, ts - 1);
      }
    }
    const cx = (mats.x + mats.w / 2) * ts;
    const cy = (mats.y + mats.h / 2) * ts;
    gfx.lineStyle(2, 0xc0392b, 0.8).strokeCircle(cx, cy, ts * 1.3).fillStyle(0xc0392b, 0.35).fillCircle(cx, cy, ts * 0.55);
  }
  for (const lx of [ts * 3, W - ts * 3]) { // paper lanterns on the wall
    gfx.fillStyle(0xffe9a8, 0.25).fillCircle(lx, ts + 2, 12);
    gfx.fillStyle(0xd6352b, 1).fillRect(lx - 4, ts - 3, 8, 10).fillStyle(0xe8b04b, 1).fillRect(lx - 3, ts - 5, 6, 2);
  }
}

// The belt rack (a wooden rod on the wall with one belt per rank): belts up to `earnedIndex` are marked with a star.
export function drawRack(gfx, rack, ts, belts, earnedIndex) {
  gfx.clear();
  const x0 = rack.x * ts;
  const w = rack.w * ts;
  gfx.fillStyle(WOOD, 1).fillRect(x0, 4, w, 3).fillRect(x0, 2, 2, 8).fillRect(x0 + w - 2, 2, 2, 8);
  const gap = w / belts.length;
  belts.forEach((b, i) => {
    const x = x0 + gap * (i + 0.5);
    gfx.fillStyle(hex(b.color), 1).fillRect(x - 2, 7, 4, 13).fillStyle(0x000000, 0.25).fillRect(x + 1, 7, 1, 13).fillStyle(hex(b.color), 1).fillRect(x - 3, 17, 6, 3);
    if (i <= earnedIndex) gfx.fillStyle(0xffe14d, 1).fillRect(x - 1, 23, 2, 2).fillRect(x - 2, 24, 4, 1);
  });
}
