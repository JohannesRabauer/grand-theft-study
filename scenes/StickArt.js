// Procedural art for the stick's world (story 6.2): cardboard box, bush, house door and doorbell, the angry neighbor, the pinata
// with its party frame, kirmes balloons and stall, and the loot that pops out of bushes and the pinata. Drawn on a 2x
// authoring grid and scaled to the render class like scenes/ToolArt.js, so Low (1x) and Medium/High (2x, outlined) share one definition.
import { darken, lighten } from './HiResArt.js';
import { ScaledPen, person } from './NpcArt.js';

const OUT = '#16161e';

function box(p) {
  p.px('#7a5632', 0, 0, 20, 20);
  p.px('#c49a68', 1, 1, 18, 18);
  p.px('#d9b483', 1, 1, 18, 3);
  p.px('#a67c52', 9, 1, 2, 18); // tape
  p.px('#e8dcc4', 9, 1, 2, 5);
  p.px('#a67c52', 1, 12, 18, 1);
  p.px('#6b4a2c', 3, 14, 5, 2); // label
  p.px('#f4f0e6', 4, 14, 3, 1);
}

function bush(p) {
  const g = '#3f8f4a';
  p.ell(darken(g, 0.45), 16, 20, 15, 4); // shade on the ground
  p.ell(darken(g, 0.25), 9, 14, 8, 7);
  p.ell(darken(g, 0.25), 23, 14, 8, 7);
  p.ell(g, 16, 11, 11, 9);
  p.ell(lighten(g, 0.18), 12, 8, 6, 5);
  p.ell(lighten(g, 0.18), 21, 9, 5, 4);
  p.px(lighten(g, 0.45), 10, 6, 3, 1);
  p.px('#d9453a', 7, 13, 2, 2); // berries
  p.px('#d9453a', 20, 15, 2, 2);
  p.px('#d9453a', 24, 11, 2, 2);
}

function doorbell(p) {
  p.px('#4a4036', 0, 0, 6, 8);
  p.px('#d8d2c4', 1, 1, 4, 6);
  p.px('#f2c23a', 2, 2, 2, 2);
  p.px('#8a8a8a', 2, 5, 2, 1);
}

function doorClosed(p) {
  p.px('#3b2412', 0, 0, 20, 28);
  p.px('#8a5f31', 1, 1, 18, 27);
  p.px('#a47642', 3, 3, 6, 10);
  p.px('#a47642', 11, 3, 6, 10);
  p.px('#a47642', 3, 15, 14, 10);
  p.px('#cf9c5e', 3, 3, 6, 1);
  p.px('#f2c23a', 15, 15, 2, 2); // knob
}

function doorOpen(p) {
  p.px('#3b2412', 0, 0, 20, 28);
  p.px('#2a1c14', 1, 1, 18, 27); // dark hallway
  p.px('#f2c23a', 3, 4, 10, 22); // warm light
  p.px('#f6dc8a', 5, 6, 6, 18);
  p.px('#7a4f26', 14, 0, 6, 28); // the door leaf swung back
  p.px('#a47642', 15, 2, 4, 24);
  p.px('#f2c23a', 15, 14, 2, 2);
}

function pinata(p) {
  p.px('#e8dcc4', 9, 0, 2, 5); // rope
  p.ell('#d94a8a', 10, 13, 9, 7); // body
  const stripe = ['#f2c23a', '#3fae5a', '#3a7bd9'];
  for (let i = 0; i < 6; i++) p.px(stripe[i % 3], 3 + i * 3, 8 + (i % 2), 2, 10 - (i % 2) * 2);
  p.ell('#d94a8a', 17, 8, 3, 3); // head
  p.px('#f2c23a', 18, 4, 2, 3); // ears
  p.px('#222222', 18, 8, 1, 1);
  p.px('#d94a8a', 4, 18, 2, 4); // legs
  p.px('#d94a8a', 13, 18, 2, 4);
  p.px('#f2c23a', 4, 21, 2, 1);
  p.px('#f2c23a', 13, 21, 2, 1);
  p.px('#ffffff', 6, 9, 3, 1);
}

// Party frame: two poles, a beam, bunting, a table with a cake and presents.
function partyDecor(p) {
  const wood = '#8a5f31';
  p.px(wood, 5, 14, 3, 56);
  p.px(wood, 88, 14, 3, 56);
  p.px(darken(wood, 0.25), 7, 14, 1, 56);
  p.px(darken(wood, 0.25), 90, 14, 1, 56);
  p.px(wood, 4, 12, 88, 3); // beam
  p.px(lighten(wood, 0.3), 4, 12, 88, 1);
  const flags = ['#e8493f', '#f2c23a', '#3a7bd9', '#3fae5a', '#ee7fb0'];
  for (let i = 0; i < 9; i++) { // bunting that sags in the middle
    const x = 10 + i * 8;
    const sag = Math.round(3 * Math.sin((Math.PI * (x - 6)) / 84));
    p.px('#e8dcc4', x, 15 + sag, 8, 1);
    for (let k = 0; k < 4; k++) p.px(flags[(i + k) % 5], x + 1 + k, 16 + sag + k, 6 - 2 * k, 1);
  }
  p.px('#a35a3a', 62, 58, 26, 3); // table
  p.px('#7a4326', 64, 61, 2, 8);
  p.px('#7a4326', 84, 61, 2, 8);
  p.px('#f4f0e6', 70, 51, 12, 7); // cake
  p.px('#ee7fb0', 70, 51, 12, 3);
  p.px('#d9453a', 75, 47, 2, 4);
  p.px('#f2c23a', 75, 45, 2, 2);
  p.px('#3a7bd9', 64, 52, 5, 6); // presents
  p.px('#f2c23a', 66, 52, 1, 6);
  p.px('#3fae5a', 22, 62, 8, 7);
  p.px('#e8493f', 25, 62, 2, 7);
  p.px('#e8493f', 12, 64, 7, 5);
  p.px('#ffffff', 14, 64, 1, 5);
}

function balloon(p, col) {
  p.px('#e8e4d8', 7, 17, 1, 17); // string
  p.ell(darken(col, 0.3), 7, 8, 7, 8);
  p.ell(col, 6.6, 7.6, 6.2, 7.4);
  p.ell(lighten(col, 0.4), 4.5, 4.5, 2, 2.4);
  p.px(darken(col, 0.3), 6, 16, 3, 2); // knot
}

function stall(p) {
  p.px('#7a4f26', 6, 22, 4, 42); // posts
  p.px('#7a4f26', 86, 22, 4, 42);
  for (let i = 0; i < 12; i++) p.px(i % 2 ? '#f4f0e6' : '#e8493f', 4 + i * 7, 8, 7, 14); // awning
  for (let i = 0; i < 12; i++) p.px(i % 2 ? '#f4f0e6' : '#e8493f', 4 + i * 7, 22, 7, 2);
  p.px('#b33a30', 4, 8, 84, 2);
  p.px('#a35a3a', 4, 44, 88, 20); // counter
  p.px('#c98a5a', 4, 44, 88, 3);
  p.px('#7a4326', 4, 62, 88, 2);
  p.px('#f2c23a', 36, 28, 24, 10); // sign
  p.px('#7a4326', 36, 28, 24, 1);
  p.px('#7a4326', 36, 37, 24, 1);
  for (let i = 0; i < 4; i++) p.px('#e8493f', 40 + i * 5, 31, 3, 4);
  p.px('#3a7bd9', 12, 38, 6, 6); // prizes on the counter
  p.px('#3fae5a', 76, 38, 6, 6);
}

function coin(p) {
  p.ell('#b8821f', 4, 4, 3.8, 3.8);
  p.ell('#f2c23a', 4, 3.6, 3.2, 3.2);
  p.px('#fff2a8', 2, 2, 2, 1);
  p.px('#b8821f', 4, 3, 1, 3);
}

function candy(p) {
  p.px('#e8493f', 0, 1, 3, 6); // wrapper ends
  p.px('#e8493f', 9, 1, 3, 6);
  p.ell('#ee7fb0', 6, 4, 4, 3.5);
  p.px('#ffffff', 4, 2, 2, 1);
  p.px('#3a7bd9', 5, 4, 1, 3);
}

function sticker(p) {
  p.px('#f2c23a', 4, 0, 2, 10);
  p.px('#f2c23a', 0, 4, 10, 2);
  p.px('#f2c23a', 1, 1, 8, 8);
  p.px('#e8493f', 3, 3, 4, 4);
  p.px('#ffffff', 3, 2, 2, 1);
}

function homework(p) {
  p.px('#3a7bd9', 0, 0, 10, 12);
  p.px('#f4f0e6', 1, 1, 8, 10);
  for (let y = 3; y < 10; y += 2) p.px('#9fb4d6', 2, y, 6, 1);
  p.px('#e8493f', 0, 0, 2, 12);
  p.px('#fff2a8', 3, 5, 4, 3);
}

export function makeStickArt(scene, scale, world, neighbors) {
  const f = scale / 2;
  const mk = (key, w, h, draw, { outline = true, shadow } = {}) => {
    const p = new ScaledPen(scene, key, w, h, f);
    draw(p);
    if (outline && scale > 1) p.outline(OUT);
    if (shadow) p.shadow(...shadow);
    p.done();
  };
  mk('prop-box', 20, 20, box);
  mk('bush', 32, 24, bush);
  mk('doorbell', 6, 8, doorbell);
  mk('door-closed', 20, 28, doorClosed);
  mk('door-open', 20, 28, doorOpen);
  mk('pinata', 20, 24, pinata);
  mk('party-decor', 96, 72, partyDecor);
  mk('fair-stall', 96, 64, stall);
  mk('loot-coin', 8, 8, coin);
  mk('loot-candy', 12, 8, candy);
  mk('loot-sticker', 10, 10, sticker);
  mk('loot-homework', 10, 12, homework);
  for (const [name, color] of Object.entries(world.balloon.colors)) mk(`balloon-${name}`, 14, 34, p => balloon(p, color));
  for (const [id, n] of Object.entries(neighbors.neighbors)) {
    for (let frame = 0; frame < 3; frame++) mk(`neighbor-${id}-${frame}`, 24, 32, p => person(p, n.outfit, frame), { shadow: [12, 29.5, 8, 2.5] });
  }
}
