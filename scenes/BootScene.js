import { currentLang } from '../i18n/i18n.js';

export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  preload() {
    this.load.json('town', 'data/maps/town.json');
    this.load.json('surfaces', 'data/surfaces.json');
    this.load.json('vehicles', 'data/vehicles.json');
    this.load.json('tiles', 'data/tiles.json');
    this.load.json('i18n', `i18n/${currentLang()}.json`);
  }

  create() {
    this.makeTiles(this.cache.json.get('tiles'), this.cache.json.get('town').tileSize);
    this.makePlayer();
    this.scene.start('Menu');
  }

  makeTiles(defs, size) {
    for (const id in defs) {
      const d = defs[id];
      const tex = this.textures.createCanvas(`tile-${id}`, size, size);
      const c = tex.getContext();
      c.fillStyle = d.base;
      c.fillRect(0, 0, size, size);
      c.fillStyle = d.speck;
      // deterministic speckle so tiles look the same every load
      let seed = id.length * 7919;
      for (let i = 0; i < d.count; i++) {
        seed = (seed * 16807) % 2147483647;
        const x = seed % size;
        seed = (seed * 16807) % 2147483647;
        c.fillRect(x, seed % size, 1, 1);
      }
      if (id === 'puddle') {
        c.fillRect(2, 3, size - 4, size - 6);
        c.fillStyle = '#9cc7ec';
        c.fillRect(4, 5, 4, 1);
      }
      if (id === 'wall') {
        c.fillStyle = '#5d2e20';
        c.fillRect(0, size - 2, size, 2);
      }
      tex.refresh();
    }
  }

  makePlayer() {
    const tex = this.textures.createCanvas('player', 12, 16);
    const c = tex.getContext();
    const px = (col, x, y, w, h) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
    px('#000000', 3, 14, 6, 2);   // shadow
    px('#2a3f8f', 3, 10, 2, 4);   // legs
    px('#2a3f8f', 7, 10, 2, 4);
    px('#e0483c', 2, 5, 8, 6);    // jacket
    px('#f2c9a0', 3, 1, 6, 5);    // head
    px('#5a3a1e', 3, 0, 6, 2);    // hair
    px('#222222', 4, 3, 1, 1);    // eyes
    px('#222222', 7, 3, 1, 1);
    tex.refresh();
  }
}
