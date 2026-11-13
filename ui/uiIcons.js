// The UI icon set (story 16.14): 9 x 9 base-pixel bitmaps drawn from code (AD-30, no files), one letter per colour of the art bible
// ramps. `iconAtlas` is pure (checked in node); ui/uiKit.js `ensureUiIcons` paints it into one canvas texture `ui-icons` at the render
// scale, a frame per icon, and `uiIcon` places one.
export const ICON_SIZE = 9;

export const ICON_COLORS = {
  o: '#16161e', w: '#fff1c4', y: '#ffd36b', Y: '#c4915a', n: '#8c5f2e', g: '#62d26f', G: '#2f8a45', r: '#e0483c', R: '#992a2e',
  b: '#4dd2ff', B: '#2f7fb0', s: '#b4c2d8', S: '#6a7488', p: '#f6efdc', O: '#f0a030', k: '#2b3850', m: '#ff8fb8', M: '#d9609a', i: '#d8f0ff'
};

export const ICONS = {
  coin: [
    '..ooooo..',
    '.oyyyyYo.',
    'oyywwyyYo',
    'oywyyyyYo',
    'oywyYYyYo',
    'oyyyyyyYo',
    'oyyyyyYYo',
    '.oYYYYYo.',
    '..ooooo..'
  ],
  bolt: [
    '.....oo..',
    '....oyyo.',
    '...oyywo.',
    '..oyyyo..',
    '.oyyyyyo.',
    '..ooyyYo.',
    '....oyYo.',
    '...oyYo..',
    '...ooo...'
  ],
  flame: [
    '....o....',
    '...oro...',
    '..orro...',
    '..orrOo..',
    '.orrOOro.',
    '.orOyOro.',
    '.orOyOro.',
    '..orOrRo.',
    '...ooo...'
  ],
  book: [
    '.oooooo..',
    'obbbbbBo.',
    'obwwwwBo.',
    'obbbbbBo.',
    'obwwwwBo.',
    'obbbbbBo.',
    'obBBBBBo.',
    '.ooooooo.',
    '.........'
  ],
  mail: [
    '.........',
    'ooooooooo',
    'oSpppppSo',
    'opSpppSpo',
    'oppSpSppo',
    'opppSpppo',
    'opppppppo',
    'ooooooooo',
    '.........'
  ],
  map: [
    '.........',
    'ooooooooo',
    'ogggobbbo',
    'ogGgobBbo',
    'ogggoobbo',
    'oggrrobbo',
    'ogGgrobBo',
    'ooooooooo',
    '.........'
  ],
  star: [
    '....o....',
    '...oyo...',
    '...oyo...',
    'ooooywooo',
    '.oyyywyo.',
    '..oyyyo..',
    '..oyyyo..',
    '.oyyoyyo.',
    '.ooo.ooo.'
  ],
  check: [
    '.........',
    '.......oo',
    '......ogo',
    '.....ogGo',
    'oo..ogGo.',
    'ogo.ogGo.',
    '.ogoGGo..',
    '..ogGo...',
    '...oo....'
  ],
  cross: [
    '.........',
    '.oo...oo.',
    'orro.orro',
    '.orroorr.',
    '..orrro..',
    '.orroorr.',
    'orro.orro',
    '.oo...oo.',
    '.........'
  ],
  lock: [
    '..ooooo..',
    '.oSsssSo.',
    '.os...so.',
    '.os...so.',
    'oooooooo.',
    'oyyyyyYYo',
    'oyyooyYYo',
    'oyyyyyYYo',
    '.ooooooo.'
  ],
  left: [
    '.........',
    '....o....',
    '...oy....',
    '..oyyyyo.',
    '.oyyyyyYo',
    '..oyyyYo.',
    '...oY....',
    '....o....',
    '.........'
  ],
  right: [
    '.........',
    '....o....',
    '....yo...',
    '.oyyyyo..',
    'oYyyyyyo.',
    '.oYyyyo..',
    '....Yo...',
    '....o....',
    '.........'
  ],
  medal: [
    '.rr...bb.',
    '.orr.bbo.',
    '..orbbo..',
    '..ooooo..',
    '.oyyyyYo.',
    'oyywyyyYo',
    'oyywyyyYo',
    '.oyyyYYo.',
    '..ooooo..'
  ],
  shield: [
    'ooooooooo',
    'obbbobBBo',
    'obbbobBBo',
    'obbbobBBo',
    'oooooooo.',
    '.obbbBBo.',
    '..obbBo..',
    '...obo...',
    '....o....'
  ],
  wind: [
    '.........',
    '.bbbbbo..',
    'ooooooBo.',
    '.......o.',
    'bbbbbbbbo',
    'oooooooBo',
    '..bbbbo..',
    '..ooooBo.',
    '.........'
  ],
  autumn: [
    '....o....',
    '...oOo...',
    '..oOOOo..',
    '.oOyOOro.',
    '.oOOOOro.',
    '..oOOrRo.',
    '...oRRo..',
    '...onoo..',
    '..on.....'
  ],
  winter: [
    '....i....',
    '.i..i..i.',
    '..i.i.i..',
    '...iii...',
    'iiiiiiiii',
    '...iii...',
    '..i.i.i..',
    '.i..i..i.',
    '....i....'
  ],
  spring: [
    '....o....',
    '...omo...',
    '.oomMmoo.',
    'omMmymMmo',
    '.oomMmoo.',
    '...omo.o.',
    '....oGoo.',
    '...oGGo..',
    '....oo...'
  ],
  summer: [
    '....Y....',
    '.Y..y..Y.',
    '..oyyyo..',
    '.Yoywyyo.',
    'yyyyyyyyy',
    '.Yoyyyyo.',
    '..oyyyo..',
    '.Y..y..Y.',
    '....Y....'
  ],
  gear: [
    '...ooo...',
    '.o.oSo.o.',
    'oSooSooSo',
    '.oSsssSo.',
    'ooSs.sSoo',
    '.oSsssSo.',
    'oSooSooSo',
    '.o.oSo.o.',
    '...ooo...'
  ]
};

// One atlas: the icon names in order and the frame rectangles in base pixels (a row of icons, one pixel apart).
export function iconAtlas() {
  const names = Object.keys(ICONS);
  return { names, frames: Object.fromEntries(names.map((n, i) => [n, { x: i * (ICON_SIZE + 1), y: 0, w: ICON_SIZE, h: ICON_SIZE }])), width: names.length * (ICON_SIZE + 1) - 1, height: ICON_SIZE };
}

// The lit pixels of an icon: [x, y, letter] for every letter that is not '.'.
export function iconPixels(name) {
  const out = [];
  ICONS[name].forEach((row, y) => [...row].forEach((c, x) => { if (c !== '.') out.push([x, y, c]); }));
  return out;
}
