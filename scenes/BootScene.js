import { createI18n } from '../i18n/i18n.js';
import { createQuality } from '../services/quality.js';

export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  preload() {
    this.load.json('town', 'data/maps/town.json');
    this.load.json('surfaces', 'data/surfaces.json');
    this.load.json('vehicles', 'data/vehicles.json');
    this.load.json('tiles', 'data/tiles.json');
    this.load.json('camera', 'data/camera.json');
    this.load.json('input', 'data/input.json');
    this.load.json('quality', 'data/quality.json');
    this.load.json('weather', 'data/weather.json');
    this.load.json('particles', 'data/particles.json');
    this.load.json('props', 'data/props.json');
    this.load.json('de', 'i18n/de.json');
    this.load.json('en', 'i18n/en.json');
  }

  create() {
    // App-wide services that outlive GameScene (menu uses them too); GameScene reuses them in ctx.
    const events = new Phaser.Events.EventEmitter();
    const i18n = createI18n({ de: this.cache.json.get('de'), en: this.cache.json.get('en') }, events);
    const quality = createQuality(this.cache.json.get('quality'), events);
    this.registry.set('app', { events, i18n, t: i18n.t, quality });
    this.makeTiles(this.cache.json.get('tiles'), this.cache.json.get('town').tileSize);
    this.makePlayer();
    this.makeBike();
    this.makeFx();
    this.makeWorldFx();
    this.makeArrow();
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
      this.decorateTile(c, id, size);
      if (id === 'wall') {
        c.fillStyle = '#5d2e20';
        c.fillRect(0, size - 2, size, 2);
      }
      tex.refresh();
    }
  }

  // Small pixel details so special tiles read at a glance.
  decorateTile(c, id, size) {
    const px = (col, x, y, w, h) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
    if (id === 'tree') {
      px('#2c6a2c', 2, 2, 12, 12); px('#3f8a3c', 3, 3, 10, 9); px('#6dbb5a', 5, 4, 3, 2); px('#5a3a1e', 7, 13, 2, 3);
    } else if (id === 'water') {
      px('#8fc1ee', 2, 4, 5, 1); px('#8fc1ee', 9, 10, 5, 1);
    } else if (id === 'fence') {
      px('#9a9ea6', 0, 7, size, 2);
      for (let x = 1; x < size; x += 5) px('#5d6168', x, 3, 2, 10);
    } else if (id === 'hedge') {
      px('#1f5a26', 0, 0, size, 2); px('#4fae52', 3, 5, 3, 2); px('#4fae52', 10, 10, 3, 2);
    } else if (id === 'dumpster') {
      px('#2f6b3a', 1, 2, 14, 12); px('#1f4a28', 1, 2, 14, 3); px('#3f8a4c', 2, 7, 12, 1);
    } else if (id === 'booth') {
      px('#c8352f', 3, 1, 10, 14); px('#9fd3f0', 5, 3, 6, 8); px('#7a1f1b', 3, 12, 10, 3);
    } else if (id === 'lane') {
      px('#e8e4d8', 0, 7, 6, 2);
    }
  }

  makeArrow() {
    const tex = this.textures.createCanvas('arrow', 12, 12);
    const c = tex.getContext();
    c.fillStyle = '#000000';
    c.beginPath(); c.moveTo(0, 0); c.lineTo(12, 6); c.lineTo(0, 12); c.lineTo(3, 6); c.closePath(); c.fill();
    c.fillStyle = '#ffe14d';
    c.beginPath(); c.moveTo(2, 2.5); c.lineTo(9.5, 6); c.lineTo(2, 9.5); c.lineTo(4, 6); c.closePath(); c.fill();
    tex.refresh();
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

  // Top-down bike facing right: wheels, frame, handlebar. With a rider: jacket, arms and head.
  makeBike() {
    for (const rider of [false, true]) {
      const tex = this.textures.createCanvas(rider ? 'player-bike' : 'bike', 20, 12);
      const c = tex.getContext();
      const px = (col, x, y, w, h) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
      px('#1a1a1a', 1, 5, 5, 2);    // rear wheel
      px('#1a1a1a', 14, 5, 5, 2);   // front wheel
      px('#3b7dd8', 5, 5, 10, 2);   // frame
      px('#888888', 14, 2, 1, 8);   // handlebar
      if (rider) {
        px('#e0483c', 5, 3, 6, 6);  // jacket
        px('#f2c9a0', 11, 3, 4, 1); // arms
        px('#f2c9a0', 11, 8, 4, 1);
        px('#f2c9a0', 8, 4, 4, 4);  // head
        px('#5a3a1e', 7, 4, 3, 4);  // hair
      } else {
        px('#222222', 7, 3, 3, 1);  // saddle
      }
      tex.refresh();
    }
  }

  // Skid mark, smoke puff and bell ring.
  makeFx() {
    const mk = (key, w, h, draw) => {
      const tex = this.textures.createCanvas(key, w, h);
      draw(tex.getContext());
      tex.refresh();
    };
    mk('skid', 3, 2, c => { c.fillStyle = '#111111'; c.fillRect(0, 0, 3, 2); });
    mk('puff', 8, 8, c => {
      c.fillStyle = '#dddddd';
      c.fillRect(2, 0, 4, 8); c.fillRect(0, 2, 8, 4); c.fillRect(1, 1, 6, 6);
    });
    mk('ring', 24, 24, c => {
      c.strokeStyle = '#fff2a8'; c.lineWidth = 2;
      c.beginPath(); c.arc(12, 12, 10, 0, Math.PI * 2); c.stroke();
    });
  }

  // Particle textures (white where tint colours them), props and flags.
  makeWorldFx() {
    const mk = (key, w, h, draw) => {
      const tex = this.textures.createCanvas(key, w, h);
      const c = tex.getContext();
      const px = (col, x, y, pw, ph) => { c.fillStyle = col; c.fillRect(x, y, pw, ph); };
      draw(c, px);
      tex.refresh();
    };
    mk('p-dust', 4, 4, (c, px) => { px('#ffffff', 1, 0, 2, 4); px('#ffffff', 0, 1, 4, 2); });
    mk('p-drop', 2, 3, (c, px) => px('#9fd0ff', 0, 0, 2, 3));
    mk('p-leaf', 3, 3, (c, px) => { px('#ffffff', 0, 1, 3, 1); px('#ffffff', 1, 0, 1, 3); });
    mk('p-debris', 3, 3, (c, px) => px('#ffffff', 0, 0, 3, 3));
    mk('p-rain', 1, 5, (c, px) => px('#bcd8ff', 0, 0, 1, 5));
    mk('p-ring', 12, 12, c => {
      c.strokeStyle = '#cfe8ff'; c.lineWidth = 1;
      c.beginPath(); c.arc(6, 6, 5, 0, Math.PI * 2); c.stroke();
    });
    mk('prop-cone', 8, 8, (c, px) => { px('#7a3a10', 1, 1, 6, 6); px('#e8731c', 1, 0, 6, 6); px('#e8731c', 0, 1, 8, 4); px('#ffffff', 2, 2, 4, 3); px('#e8731c', 3, 3, 2, 1); });
    mk('prop-cone-tipped', 10, 6, (c, px) => { px('#e8731c', 0, 1, 8, 4); px('#ffffff', 3, 1, 2, 4); px('#7a3a10', 8, 0, 2, 6); });
    mk('prop-can', 6, 6, (c, px) => { px('#7d868f', 1, 0, 4, 6); px('#7d868f', 0, 1, 6, 4); px('#c9d1d9', 1, 1, 3, 2); });
    mk('prop-crate', 12, 12, (c, px) => {
      px('#5a3a1e', 0, 0, 12, 12); px('#b9854a', 1, 1, 10, 10); px('#8a5f31', 1, 5, 10, 2); px('#8a5f31', 5, 1, 2, 10);
    });
    mk('prop-ball', 8, 8, (c, px) => {
      px('#c8352f', 2, 0, 4, 8); px('#c8352f', 0, 2, 8, 4); px('#c8352f', 1, 1, 6, 6); px('#ffffff', 2, 2, 2, 1); px('#f2f2f2', 3, 5, 3, 1);
    });
    mk('flag-pole', 2, 22, (c, px) => { px('#6b6f76', 0, 0, 2, 22); px('#e8e4d8', 0, 0, 2, 2); });
    mk('flag-seg', 4, 9, (c, px) => px('#ffffff', 0, 0, 4, 9));
  }
}
