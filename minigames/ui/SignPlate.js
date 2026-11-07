import { uiText } from '../../ui/uiKit.js';
import { darken, lighten } from '../../scenes/HiResArt.js';
import { plateStyle } from '../englischCore.js';

const hex = c => parseInt(c.slice(1), 16);
// red = warning, green = entrance / exit / open, blue = shops and services, dark = everything else
const PLATES = ['#c0392b', '#27ae60', '#2c6fbb', '#3b3f4a'];

// The shop-sign plate of the Schilder-Check: a bolted plate with the sign's word in big capitals below a caption (the
// question). It covers the top of the QuestionPanel in rect (the panel's own question text hides behind it).
export class SignPlate {
  constructor(scene, rect, { depth = 14, frame = 0x2f5d46 } = {}) {
    this.rect = rect;
    this.g = scene.add.graphics().setDepth(depth);
    this.cover = scene.add.rectangle(rect.x, rect.y, rect.w, rect.h, frame).setOrigin(0).setDepth(depth - 1);
    this.caption = uiText(scene, rect.x + rect.w / 2, rect.y + 3, '', { fontFamily: 'monospace', fontSize: '8px', color: '#cfe9d8' }).setOrigin(0.5, 0).setDepth(depth + 1);
    this.word = uiText(scene, rect.x + rect.w / 2, rect.y + rect.h / 2 + 5, '', { fontFamily: 'monospace', fontSize: '20px', fontStyle: 'bold', color: '#ffffff', stroke: '#000000', strokeThickness: 2 }).setOrigin(0.5).setDepth(depth + 1);
    this.objects = [this.g, this.cover, this.caption, this.word];
    this.hide();
  }

  show(sign, caption) {
    const { rect: r, g } = this;
    const color = PLATES[plateStyle(sign)];
    const x = r.x + 6;
    const y = r.y + 13;
    const w = r.w - 12;
    const h = r.h - 17;
    g.clear();
    g.fillStyle(0x000000, 0.35).fillRoundedRect(x + 1.5, y + 2, w, h, 4);
    g.fillStyle(hex(darken(color, 0.35))).fillRoundedRect(x, y, w, h, 4);
    g.fillStyle(hex(color)).fillRoundedRect(x + 2, y + 2, w - 4, h - 5, 3);
    g.fillStyle(0xffffff, 0.16).fillRoundedRect(x + 3, y + 3, w - 6, (h - 5) / 3, 2);
    g.lineStyle(1.5, hex(lighten(color, 0.7))).strokeRoundedRect(x + 4, y + 4, w - 8, h - 9, 2);
    g.fillStyle(0xe8e8e8);
    for (const [bx, by] of [[x + 3, y + 3], [x + w - 3, y + 3], [x + 3, y + h - 4], [x + w - 3, y + h - 4]]) g.fillCircle(bx, by, 1.2);
    this.caption.setText(caption);
    this.word.setText(sign).setScale(Math.min(1, (w - 16) / this.word.width));
    for (const o of this.objects) o.setVisible(true);
  }

  retext(caption) { this.caption.setText(caption); }

  hide() { for (const o of this.objects) o.setVisible(false); }

  get visible() { return this.cover.visible; }

  destroy() {
    for (const o of this.objects) o.destroy();
    this.objects.length = 0;
  }
}
