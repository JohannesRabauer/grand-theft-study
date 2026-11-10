// The particle sheet (story 16.11): every frame of scenes/particleShapes.js on one canvas texture, drawn at `scale` (1 on Low, 2 on Medium and
// High), so emitters pick random frames (`frame: [...]`) and no two puffs, leaves or sparks look the same.
import { SHAPES, SHADES, SHEET, sheetLayout } from './particleShapes.js';

export function makeParticleSheet(scene, scale) {
  const lay = sheetLayout();
  const tex = scene.textures.createCanvas(SHEET, lay.w * scale, lay.h * scale);
  const c = tex.getContext();
  for (const f of lay.frames) {
    SHAPES[f.name].forEach((row, ry) => {
      for (let rx = 0; rx < row.length; rx++) {
        if (row[rx] === '.') continue;
        c.fillStyle = SHADES[row[rx]];
        c.fillRect((f.x + rx) * scale, (f.y + ry) * scale, scale, scale);
      }
    });
    tex.add(f.name, 0, f.x * scale, f.y * scale, f.w * scale, f.h * scale);
  }
  tex.refresh();
}
