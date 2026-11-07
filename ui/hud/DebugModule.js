import { HudModule } from './HudModule.js';
import { uiText } from '../uiKit.js';

// ?debug only: active tier, chase, day, weather and live/cap of every registered pool, plus a small
// wind arrow (length = strength) in the lower-left corner.
export class DebugModule extends HudModule {
  constructor(scene, ctx, opts) {
    super(scene, ctx, opts);
    this.windArrow = this.track(scene.add.graphics());
    this.text = this.track(uiText(scene, 4, 62, '', { fontFamily: 'monospace', fontSize: '8px', color: '#9fe0ff' }));
    this.next = 0;
  }

  update(time) {
    this.drawWind();
    if (time < this.next) return;
    this.next = time + 250;
    this.showText();
  }

  showText() {
    const { quality, pools, wind, weather, chase, res, day } = this.ctx;
    let s = `quality: ${quality.id}
render: ${res.renderW}x${res.renderH}  textures: x${res.scale}  zoom: ${this.scene.scene.get('Game').cameras.main.zoom.toFixed(2)}
chase: level ${chase.level}  seen: ${chase.seen}
day: ${day.mode} ${day.time} ${day.phase} ${day.season}
weather: ${weather.state}  wind: ${wind.vector.x.toFixed(2)}, ${wind.vector.y.toFixed(2)}`;
    if (this.ctx.coop.active) s += `
coop: distance ${this.ctx.coop.distance.toFixed(0)}  tether ${this.ctx.coop.tetherRatio.toFixed(2)}`;
    if (this.ctx.crowd) s += `
${this.ctx.crowd.debugText()}`;
    for (const [name, p] of pools.byName) s += `
${name}: ${p.live()}/${p.cap}`;
    this.text.setText(s);
  }

  drawWind() {
    const v = this.ctx.wind.vector;
    const g = this.windArrow.clear().lineStyle(2, 0x9fe0ff, 1);
    const cx = 30;
    const cy = this.ctx.res.h - 30;
    const ex = cx + v.x * 24;
    const ey = cy + v.y * 24;
    g.strokeCircle(cx, cy, 2).lineBetween(cx, cy, ex, ey);
    const a = Math.atan2(v.y, v.x);
    g.lineBetween(ex, ey, ex - Math.cos(a - 0.5) * 5, ey - Math.sin(a - 0.5) * 5);
    g.lineBetween(ex, ey, ex - Math.cos(a + 0.5) * 5, ey - Math.sin(a + 0.5) * 5);
  }
}
