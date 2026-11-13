import { HudModule } from './HudModule.js';
import { uiLabel, uiIcon, HudPlate, withSeededRandom } from '../uiKit.js';

// The phone badge (story 11.3, 16.14): an envelope with the number of unread messages on a small plate, shown only while there are some; a tap
// opens the phone. The objects are made when the first message comes, with Math.random swapped out (a Phaser text takes a random texture key).
export class PhoneModule extends HudModule {
  constructor(scene, ctx, opts) {
    super(scene, ctx, opts);
    this.badge = null;
    this.on('phone:changed', () => this.show());
    this.on('state:changed', e => { if (!e || e.path === '' || e.path?.startsWith('shared.flags')) this.show(); });
    this.show();
  }

  show() {
    const n = this.ctx.phone?.unread ?? 0;
    if (!this.badge) {
      if (n <= 0) return;
      const { scene, ctx } = this;
      this.plate = new HudPlate(scene);
      this.track(this.plate.g);
      this.icon = this.track(uiIcon(scene, 6, ctx.res.h - 15, 'mail'));
      this.badge = this.track(withSeededRandom(() => uiLabel(scene, 18, ctx.res.h - 15, '', 'hud', 'ink', { color: 'gold', padding: { x: 2, y: 1 } })).setDepth(9).setInteractive({ useHandCursor: true }));
      this.plate.g.setDepth(8.9);
      this.icon.setDepth(9);
      this.badge.on('pointerdown', () => this.ctx.phone?.toggle());
    }
    this.badge.setVisible(n > 0);
    this.plate.setVisible(n > 0);
    this.icon.setVisible(n > 0);
    if (n > 0) {
      this.badge.setText(this.ctx.t('phone.badge', { n }));
      this.plate.fit(2, this.ctx.res.h - 17, Math.ceil(this.badge.width) + 22, 15);
    }
  }

  retext() { this.show(); }
}
