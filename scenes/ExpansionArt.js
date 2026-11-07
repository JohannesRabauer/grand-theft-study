import { ScaledPen } from './NpcArt.js';

export function makeExpansionArt(scene, scale) {
  for (const [key, color, kind] of [
    ['play-swing', '#f3c66b', 'seat'], ['play-sign', '#669ac9', 'sign'], ['play-plank', '#ba905c', 'plank'],
    ['play-kite', '#ea6c88', 'kite'], ['play-flag', '#65c79a', 'flag'], ['play-cart', '#de8f4c', 'cart'],
    ['play-crate', '#bd976a', 'crate'], ['play-floater', '#82bddd', 'boat']
  ]) {
    const p = new ScaledPen(scene, key, 18, 18, scale);
    p.px('#273744', 2, 4, 14, 11);
    p.px(color, 3, 5, 12, 9);
    p.px('#ffe8b3', 4, 6, 10, 1);
    if (['seat', 'plank'].includes(kind)) p.px('#273744', 2, 10, 14, 5);
    if (kind === 'sign') { p.px('#fff4cf', 5, 8, 8, 1); p.px('#645346', 8, 14, 2, 4); }
    if (kind === 'kite') { p.px('#fff4cf', 8, 3, 1, 13); p.px('#fff4cf', 2, 9, 14, 1); }
    if (kind === 'cart') for (const x of [2, 13]) { p.px('#17242e', x, 2, 3, 3); p.px('#17242e', x, 14, 3, 3); }
    if (kind === 'crate') { p.px('#62462d', 8, 5, 2, 9); p.px('#62462d', 3, 9, 12, 2); }
    if (kind === 'boat') { p.px('#fff0cc', 8, 1, 1, 13); p.px('#f4cb63', 9, 2, 5, 7); }
    p.done();
  }
  for (const [kind, length, width, color] of [['car', 34, 18, '#e87567'], ['van', 42, 20, '#75b6d5'], ['tram', 72, 22, '#d8bd58']]) {
    const p = new ScaledPen(scene, kind, length + 8, width + 6, scale);
    p.px('#20303c', 4, 3, length, width);
    p.px(color, 5, 4, length - 2, width - 2);
    p.px('#a8dce4', length - 7, 6, 6, width - 6);
    p.px('#314d61', 9, 6, kind === 'tram' ? length - 20 : 9, width - 6);
    for (const x of [8, length - 4]) for (const y of [1, width + 2]) p.px('#17202a', x, y, 5, 3);
    if (kind === 'tram') p.px('#ffe376', 0, width / 2 + 2, 4, 2);
    p.done();
  }
}
