import { HudModule } from './HudModule.js';
import { uiText } from '../uiKit.js';

// The phone badge (story 11.3): an envelope with the number of unread messages, shown only while there are some; a tap opens the phone.
// The text object is made when the first message comes.
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
      const keep = Math.random; // a Phaser text takes a random texture key: leave the game's random sequence (the seeded smoke runs) alone
      let seed = 0x9e3779b9;
      Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
      this.badge = this.track(uiText(this.scene, 4, this.ctx.res.h - 14, '', { fontFamily: 'monospace', fontSize: '9px', color: '#ffe14d', backgroundColor: '#243d46', padding: { x: 3, y: 2 } }).setOrigin(0, 0).setDepth(9).setInteractive({ useHandCursor: true }));
      Math.random = keep;
      this.badge.on('pointerdown', () => this.ctx.phone?.toggle());
    }
    this.badge.setVisible(n > 0);
    if (n > 0) this.badge.setText(this.ctx.t('phone.badge', { n }));
  }

  retext() { this.show(); }
}
