// Pixel shapes of the particle sheet (story 16.11): hand-set bitmaps on the 480x270 base grid, one frame each, packed into one texture
// `p-sheet`. Light comes from the top left, so the lower right is shaded. The grey ramp is multiplied by the emitter's tint (a white shape
// stays the tint colour, the shade goes darker), which gives every effect its own colour from one set of shapes. Pure: scripts/check-particles.mjs
// validates the bitmaps and the packing in node.
export const SHEET = 'p-sheet';
export const SHADES = { W: '#ffffff', L: '#dcdce8', M: '#b4b4c8', D: '#8c8ca4' };

export const SHAPES = {
  puff0: ['.LWL.', 'LWWWM', 'WWWMM', 'LWMMD', '.MMD.'],
  puff1: ['..LWL..', '.LWWWM.', 'LWWWWMM', 'WWWWMMD', '.LMMMD.', '..DDD..'],
  puff2: ['LWL', 'WWM', 'LMD'],
  crumb0: ['WL', 'MD'],
  crumb1: ['.W.', 'LWM'],
  leafA: ['.LWW.', 'LWWWM', '.MMDD', '...D.'],
  leafB: ['..LW', 'LWWM', '.WMD', 'LMD.'],
  leafC: ['LWWWM', '.MWMD', '..DD.'],
  petal0: ['LWL', '.MD'],
  petal1: ['LW', 'WM', '.D'],
  mote0: ['W'],
  mote1: ['WL'],
  glow0: ['..M..', '.MWM.', 'MWWWM', '.MWM.', '..M..'],
  glow1: ['.W.', 'WWW', '.W.'],
  spark0: ['..W..', '..L..', 'WLWLW', '..L..', '..W..'],
  spark1: ['.W.', 'WWW', '.W.'],
  spark2: ['W.W', '.W.', 'W.W'],
  drop0: ['LW', 'WM', 'MD'],
  drop1: ['W', 'M'],
  bead: ['WL', 'LM']
};

// Frames packed left to right in rows at most `maxW` base pixels wide, one base pixel apart.
export function sheetLayout(shapes = SHAPES, maxW = 40) {
  const frames = [];
  let x = 0, y = 0, rowH = 0, w = 0;
  for (const [name, rows] of Object.entries(shapes)) {
    const fw = rows[0].length, fh = rows.length;
    if (x > 0 && x + fw > maxW) { x = 0; y += rowH + 1; rowH = 0; }
    frames.push({ name, x, y, w: fw, h: fh });
    x += fw + 1;
    rowH = Math.max(rowH, fh);
    w = Math.max(w, x - 1);
  }
  return { w, h: y + rowH, frames };
}
