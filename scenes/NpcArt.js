// Procedural pedestrian art (story 1.14, AD-14/AD-15): every outfit in data/npcs.json gets three
// frames (two walk steps, one standing) as `npc-<outfit>-<frame>`, plus `npc-dog-<frame>` and
// `npc-bench`. Drawn on a 24x32 authoring grid (the same grid as the 2x figures in HiResArt) and
// scaled to the render class, so Low (1x) and Medium/High (2x, outlined) share one definition.
import { Pen, darken, lighten } from './HiResArt.js';

const OUT = '#16161e';

class ScaledPen extends Pen {
  constructor(scene, key, w, h, f) {
    super(scene, key, Math.round(w * f), Math.round(h * f));
    this.f = f;
  }

  px(col, x, y, w = 1, h = 1) {
    const f = this.f;
    const X = Math.round(x * f);
    const Y = Math.round(y * f);
    return super.px(col, X, Y, Math.max(1, Math.round((x + w) * f) - X), Math.max(1, Math.round((y + h) * f) - Y));
  }

  ell(col, cx, cy, rx, ry) {
    const f = this.f;
    return super.ell(col, cx * f, cy * f, rx * f, ry * f);
  }

  line(col, x0, y0, x1, y1) {
    const f = this.f;
    return super.line(col, Math.round(x0 * f), Math.round(y0 * f), Math.round(x1 * f), Math.round(y1 * f));
  }
}

// Body proportions per kind: top offset of the head, bottom of the torso, half width of the torso.
const BODY = {
  adult: { t: 0, bot: 22, half: 8, arm: 3 },
  elder: { t: 2, bot: 22, half: 7, arm: 3 },
  kid: { t: 5, bot: 24, half: 6, arm: 2 }
};

function person(p, o, frame) {
  const b = BODY[o.kind];
  const { jacket, pants, hair, skin } = o;
  const dark = darken(jacket, 0.25);
  const top = 11 + b.t;
  const hc = 7 + b.t;
  const x0 = 12 - b.half;
  const x1 = 12 + b.half;
  // legs: frame 0 / 1 swing one leg up, frame 2 stands
  const lift = frame === 2 ? 0 : 2;
  const legTop = b.bot - 2;
  p.px(pants, 7, legTop, 4, 28 - legTop - (frame === 1 ? lift : 0));
  p.px(pants, 13, legTop, 4, 28 - legTop - (frame === 0 ? lift : 0));
  p.px(darken(pants, 0.3), 10, legTop, 1, 28 - legTop);
  p.px('#2c2018', 6, 27 - (frame === 1 ? lift : 0), 5, 2);
  p.px('#2c2018', 13, 27 - (frame === 0 ? lift : 0), 5, 2);
  p.px(jacket, x0, top, b.half * 2, b.bot - top);                       // torso
  p.px(dark, x1 - 4, top + 1, 4, b.bot - top - 1);
  p.px(lighten(jacket, 0.2), x0 + 1, top + 1, 2, b.bot - top - 3);
  p.px(dark, x0, b.bot - 1, b.half * 2, 1);
  const armLen = b.bot - top - 2;
  const sw = frame === 2 ? 0 : 1;                                       // arms swing against the legs
  p.px(jacket, x0 - b.arm, top + 1 + (frame === 0 ? sw : 0), b.arm, armLen);
  p.px(jacket, x1, top + 1 + (frame === 1 ? sw : 0), b.arm, armLen);
  p.px(skin, x0 - b.arm, top + 1 + armLen, b.arm, 2);
  p.px(skin, x1, top + 1 + armLen, b.arm, 2);
  if (o.accessory === 'pack') {
    p.px(darken(jacket, 0.45), x0 + 2, top + 1, 1, armLen - 1);
    p.px(darken(jacket, 0.45), x1 - 3, top + 1, 1, armLen - 1);
  } else if (o.accessory === 'bag') {
    p.px('#6b4623', x1 - 3, top + 3, 6, 6);
    p.px('#8a5f31', x1 - 3, top + 3, 6, 1);
  } else if (o.accessory === 'cane') {
    p.px('#6b4623', x1 + b.arm - 1, b.bot, 1, 28 - b.bot);
    p.px('#8a5f31', x1 + b.arm - 2, b.bot - 1, 3, 1);
  }
  p.px(skin, 10, hc + 3, 4, 2);                                         // neck
  const hr = o.kind === 'kid' ? 6 : 5.5;
  p.ell(skin, 12, hc, 6, hr);                                           // head
  p.px(darken(skin, 0.15), 16, hc - 1, 2, 4);
  p.ell(hair, 12, hc - 2.5, 6.5, 3.5);
  p.px(hair, 6, hc - 2, 2, 4);
  p.px(hair, 17, hc - 2, 2, 3);
  if (o.accessory === 'hat') {
    p.ell(darken(jacket, 0.15), 12, hc - 4, 7, 3);
    p.px(darken(jacket, 0.4), 4, hc - 3, 16, 1);
  }
  p.px('#222222', 9, hc + 1, 2, 2);
  p.px('#222222', 14, hc + 1, 2, 2);
  p.px('#ffffff', 9, hc + 1, 1, 1);
  p.px('#ffffff', 14, hc + 1, 1, 1);
  p.px('#c4755b', 11, hc + 4, 3, 1);
}

function dog(p, frame) {
  const leg = (x, up) => p.px('#8a5a32', x, 10, 2, up ? 2 : 4);
  p.ell('#a9784a', 11, 8, 7, 3.5);
  p.ell('#bf8d5c', 10, 7, 5, 2);
  p.ell('#a9784a', 18, 6, 3.5, 3);
  p.px('#8a5a32', 20, 6, 3, 2);
  p.px('#222222', 22, 6, 1, 1);
  p.px('#222222', 19, 5, 1, 1);
  p.px('#6b4423', 16, 3, 2, 3);
  p.line('#8a5a32', 4, 7, 2, frame === 0 ? 4 : 5);
  leg(6, frame === 1); leg(9, frame === 0); leg(13, frame === 0); leg(16, frame === 1);
}

function bench(p) {
  p.px('#6b4623', 2, 2, 24, 3);
  p.px('#8a5f31', 2, 5, 24, 4);
  p.px('#a47642', 2, 5, 24, 1);
  p.px('#3b2412', 4, 9, 2, 4);
  p.px('#3b2412', 22, 9, 2, 4);
}

export function makeNpcArt(scene, cfg, scale) {
  const f = scale / 2;
  const finish = p => { if (scale > 1) p.outline(OUT); return p; };
  for (const o of cfg.outfits) {
    for (let frame = 0; frame < 3; frame++) {
      const p = new ScaledPen(scene, `npc-${o.id}-${frame}`, 24, 32, f);
      person(p, o, frame);
      finish(p).shadow(12, 29.5, 8, 2.5);
      p.done();
    }
  }
  for (let frame = 0; frame < 3; frame++) {
    const p = new ScaledPen(scene, `npc-dog-${frame}`, 24, 16, f);
    dog(p, frame);
    finish(p).shadow(11, 14.5, 8, 2);
    p.done();
  }
  const p = new ScaledPen(scene, 'npc-bench', 28, 14, f);
  bench(p);
  finish(p).shadow(14, 12.5, 12, 2);
  p.done();
}
