import { HudModule } from './HudModule.js';
import { uiText } from '../uiKit.js';
import { sliceOf } from './layout.js';

// The bound player's current tool and its ammo or status (bottom centre); a wind arrow with strength appears above it while charging.
export class ToolModule extends HudModule {
  constructor(scene, ctx, opts) {
    super(scene, ctx, opts);
    const { w: width, h: height } = ctx.res;
    this.height = height;
    // one player: bottom centre; two: P1 bottom left, P2 bottom right (wind arrow beside the text)
    const { right } = sliceOf(this.playerIndex ?? 0, this.players, width);
    const x = this.players > 1 ? (right ? width - 4 : 4) : width / 2;
    this.ax = this.players > 1 ? (right ? width - 60 : 60) : width / 2;
    const style = { fontFamily: 'monospace', fontSize: '8px', color: '#ffffff', stroke: '#000000', strokeThickness: 2 };
    this.tool = this.track(uiText(scene, x, height - 3, '', style).setOrigin(this.players > 1 ? (right ? 1 : 0) : 0.5, 1));
    this.windText = this.track(uiText(scene, this.ax + 14, height - 17, '', { ...style, color: '#9fe0ff' }).setOrigin(0, 1).setVisible(false));
    this.windGfx = this.track(scene.add.graphics().setVisible(false));
    this.windKey = -1;
    this.on('tool:ammo', (ev) => { if (this.mine(ev)) this.show(); });
    this.on('tool:changed', (ev) => { if (this.mine(ev)) this.show(); });
    this.show();
  }

  show() {
    const { ctx } = this;
    const t = this.player.toolbelt.current;
    const name = ctx.t(`tool.${t.id}`);
    // a tool with one retrievable item (the throwing stick) shows where that item is instead of a count
    this.tool.setText(t.status ? ctx.t('hud.toolStatus', { name, status: ctx.t(`tool.status.${t.status}`) }) : ctx.t('hud.tool', { name, n: t.ammo, max: t.max }));
    this.tool.setColor(t.ammo === 0 ? '#ff8a7a' : '#ffffff');
  }

  retext() {
    this.windKey = -1; // the wind label re-resolves while aiming
    this.show();
  }

  update() {
    const { ctx } = this;
    const aiming = this.player.toolbelt.current.charging;
    if (aiming !== this.windGfx.visible) {
      this.windGfx.setVisible(aiming);
      this.windText.setVisible(aiming);
      this.windKey = -1;
    }
    if (!aiming) return;
    const v = ctx.wind.vector;
    // the wind drifts slowly: redraw only when angle (about 3 deg steps) or strength (2 % steps) changed
    const key = Math.round(Math.atan2(v.y, v.x) * 20) * 1000 + Math.round(ctx.wind.strength * 50);
    if (key === this.windKey) return;
    this.windKey = key;
    const cx = this.ax - 14;
    const cy = this.height - 22;
    const a = Math.atan2(v.y, v.x);
    const len = 3 + ctx.wind.strength * 14;
    const ex = cx + Math.cos(a) * len;
    const ey = cy + Math.sin(a) * len;
    const g = this.windGfx.clear().lineStyle(2, 0x9fe0ff, 1);
    g.lineBetween(cx, cy, ex, ey);
    g.lineBetween(ex, ey, ex - Math.cos(a - 0.5) * 4, ey - Math.sin(a - 0.5) * 4);
    g.lineBetween(ex, ey, ex - Math.cos(a + 0.5) * 4, ey - Math.sin(a + 0.5) * 4);
    this.windText.setText(ctx.t('hud.wind', { n: Math.round(ctx.wind.strength * 50) * 2 }));
  }
}
