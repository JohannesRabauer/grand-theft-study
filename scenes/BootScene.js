import { createI18n } from '../i18n/i18n.js';
import { createQuality } from '../services/quality.js';
import { makeToolArt } from './ToolArt.js';
import { makeStickArt } from './StickArt.js';
import { makeHiResArt } from './HiResArt.js';
import { makeNpcArt } from './NpcArt.js';
import { makeCharacterArt } from './CharacterArt.js';
import { makeDefenseArt } from './DefenseArt.js';
import { makeDojoArt } from './DojoArt.js';
import { makeBusArt } from './SkatesArt.js';
import { makeVehicleArt } from './VehicleArt.js';
import { GameState } from '../state/GameState.js';
import { SaveSlots } from '../state/SaveSlots.js';
import { streetCatalog } from '../vehicles/streetLogic.js';
import { makeEnvArt } from './EnvArt.js';
import { makeCosmeticArt } from './CosmeticArt.js';
import { makeExpansionArt } from './ExpansionArt.js';

export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  preload() {
    for (const m of this.registry.get('mapIndex').maps) this.load.json(`map-${m.id}`, `data/maps/${m.file}`); // listed in data/maps/index.json
    this.load.json('object-types', 'data/object-types.json');
    this.load.json('surfaces', 'data/surfaces.json');
    this.load.json('vehicles', 'data/vehicles.json');
    this.load.json('tiles', 'data/tiles.json');
    this.load.json('camera', 'data/camera.json');
    this.load.json('input', 'data/input.json');
    this.load.json('quality', 'data/quality.json');
    this.load.json('weather', 'data/weather.json');
    this.load.json('particles', 'data/particles.json');
    this.load.json('props', 'data/props.json');
    this.load.json('play-objects', 'data/play-objects.json');
    this.load.json('chase', 'data/chase.json');
    this.load.json('tool', 'data/tool.json');
    this.load.json('karate', 'data/karate.json');
    this.load.json('kata', 'data/kata.json'); // the karate training minigame's kata
    this.load.json('npcs', 'data/npcs.json');
    this.load.json('dogs', 'data/dogs.json');
    this.load.json('stick-world', 'data/stick-world.json');
    this.load.json('neighbors', 'data/neighbors.json');
    this.load.json('state', 'data/state.json');
    this.load.json('characters', 'data/characters.json');
    this.load.json('attr-growth', 'data/attr-growth.json');
    this.load.json('tricks', 'data/tricks.json');
    this.load.json('park', 'data/park.json');
    this.load.json('grab', 'data/grab.json');
    this.load.json('traffic', 'data/traffic.json');
    this.load.json('shop', 'data/shop.json');
    this.load.json('theft', 'data/theft.json');
    this.load.json('routes', 'data/routes.json');
    this.load.json('day', 'data/day.json');
    this.load.json('timetable', 'data/timetable.json');
    this.load.json('morning', 'data/morning.json');
    this.load.json('hud', 'data/hud.json');
    this.load.json('screens', 'data/screens.json');
    this.load.json('hints', 'data/hints.json');
    this.load.json('commute', 'data/commute.json');
    this.load.json('missions', 'data/missions.json');
    this.load.json('school-events', 'data/school-events.json');
    this.load.json('dayflow', 'data/dayflow.json');
    this.load.json('xp', 'data/xp.json');
    this.load.json('stickers', 'data/stickers.json');
    this.load.json('achievements', 'data/achievements.json');
    this.load.json('lernbuch', 'data/lernbuch.json');
    this.load.json('parent', 'data/parent.json');
    this.load.json('activities', 'data/activities.json');
    this.load.json('phone', 'data/phone.json');
    this.load.json('grownups', 'data/grownups.json');
    this.load.json('audio', 'data/audio.json');
    this.load.json('grading', 'data/grading.json');
    this.load.json('kopfnoten', 'data/kopfnoten.json');
    this.load.json('teacher-comments', 'data/teacher-comments.json');
    this.load.json('parent-reactions', 'data/parent-reactions.json');
    this.load.json('minigames', 'data/minigames.json');
    this.load.json('learning', 'data/learning.json');
    this.load.json('geo-germany', 'data/maps-geo/germany.json'); // the Erdkunde map (and the later tram map quiz)
    this.load.json('geo-map', 'data/learning/grade3/geo-map.json'); // which Sachkunde item points at which map target
    this.load.json('songs', 'data/songs.json'); // the Musik minigame's songs
    this.load.json('pixel-patterns', 'data/pixel-patterns.json'); // the Kunst minigame's hand-authored icons and its palette
    this.load.json('learning-reactions', 'data/learning/reactions.json');
    this.load.json('learning-index', 'data/learning/index.json');
    // the topic files are only known once the index is in
    this.load.once('filecomplete-json-learning-index', (key, type, index) => {
      for (const { grade, topic } of index.topics) this.load.json(`learning-${grade}-${topic}`, `data/learning/${grade}/${topic}.json`);
    });
    this.load.json('de', 'i18n/de.json');
    this.load.json('en', 'i18n/en.json');
  }

  create() {
    // App-wide services that outlive GameScene (menu uses them too); GameScene reuses them in ctx.
    const events = new Phaser.Events.EventEmitter();
    const i18n = createI18n({ de: this.cache.json.get('de'), en: this.cache.json.get('en') }, events);
    const res = this.registry.get('res'); // render resolution class, fixed at load (main.js)
    const quality = createQuality(this.cache.json.get('quality'), events, res);
    // AD-16: one state store for the whole app; without a chosen slot it is a plain in-memory game.
    const characters = this.cache.json.get('characters');
    // the state config also knows each character's base attributes (player.setCharacter resets to them)
    const karate = this.cache.json.get('karate');
    const characterBelts = Object.fromEntries(characters.characters.filter(c => c.startBelt).map(c => [c.id, { belt: c.startBelt, points: karate.belts.find(b => b.id === c.startBelt).trainingPoints }]));
    const stateCfg = { ...this.cache.json.get('state'), morning: this.cache.json.get('morning'), characters: Object.fromEntries(characters.characters.map(c => [c.id, c.attributes])), karateBelts: karate.belts.map(b => b.id), characterBelts, kopfnoten: this.cache.json.get('kopfnoten'), shop: this.cache.json.get('shop'), missions: this.cache.json.get('missions'), stickers: this.cache.json.get('stickers') };
    stateCfg.worldMaps = Object.fromEntries(this.registry.get('mapIndex').maps.map(m => [m.id, this.cache.json.get(`map-${m.id}`)]));
    stateCfg.worldSurfaces = this.cache.json.get('surfaces');
    stateCfg.streetObjects = streetCatalog(stateCfg.worldMaps);
    const state = new GameState(events, stateCfg);
    const saves = new SaveSlots(state, events, window.localStorage);
    this.registry.set('app', { events, i18n, t: i18n.t, quality, res, state, saves, characters });
    if (window.SCHULWEG_GAME) window.SCHULWEG_GAME.state = state;
    const tiles = this.cache.json.get('tiles');
    if (res.scale > 1) {
      makeHiResArt(this, tiles); // Medium and High: textures drawn on a 2x grid (AD-14)
    } else {
      this.makeTiles(tiles, this.cache.json.get('map-town').tileSize);
      this.makePlayer();
      this.makeBike();
      this.makeBully();
      this.makeFx();
      this.makeWorldFx();
      this.makeArrow();
    }
    makeNpcArt(this, this.cache.json.get('npcs'), res.scale);
    makeToolArt(this, res.scale);
    makeStickArt(this, res.scale, this.cache.json.get('stick-world'), this.cache.json.get('neighbors'));
    makeCharacterArt(this, characters, res.scale);
    makeDefenseArt(this, characters, res.scale);
    makeDojoArt(this, this.cache.json.get('karate'), res.scale);
    makeBusArt(this, res.scale);
    makeVehicleArt(this, res.scale);
    makeExpansionArt(this, res.scale);
    makeCosmeticArt(this, res.scale); // story 10.1: hats and rings from the shop
    makeEnvArt(this, tiles, this.cache.json.get('map-town').tileSize * res.scale); // AD-30: edges, shores, fences, hedges
    // The speed zoom scales the world by non-integer factors, where nearest-neighbour sampling makes
    // texels land on uneven screen pixels (shimmer). World textures are filtered bilinear instead; at
    // an exact integer zoom texels map 1:1 to pixels, so the result stays crisp. UI textures stay sharp.
    for (const key of this.textures.getTextureKeys()) {
      if (!key.startsWith('__') && key !== 'arrow') this.textures.get(key).setFilter(Phaser.Textures.FilterMode.LINEAR);
    }
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

  // Bullies: dark hoodie, cap and a frown, so they never read as the player. The bike bully
  // rides a red bike facing right.
  makeBully() {
    const mk = (key, w, h, draw) => {
      const tex = this.textures.createCanvas(key, w, h);
      const c = tex.getContext();
      draw((col, x, y, pw, ph) => { c.fillStyle = col; c.fillRect(x, y, pw, ph); });
      tex.refresh();
    };
    mk('bully', 12, 16, px => {
      px('#000000', 3, 14, 6, 2);   // shadow
      px('#3a3a48', 3, 10, 2, 4);   // legs
      px('#3a3a48', 7, 10, 2, 4);
      px('#5a2a7a', 2, 5, 8, 6);    // hoodie
      px('#f2c9a0', 3, 1, 6, 5);    // head
      px('#1a1a1a', 2, 0, 8, 2);    // cap
      px('#1a1a1a', 3, 3, 2, 1);    // angry brows
      px('#1a1a1a', 7, 3, 2, 1);
      px('#1a1a1a', 5, 5, 2, 1);    // frown
    });
    mk('bully-scooter', 20, 12, px => {
      px('#1a1a1a', 1, 6, 4, 2);
      px('#1a1a1a', 15, 6, 4, 2);
      px('#2fb5c8', 3, 6, 14, 1);   // deck
      px('#888888', 15, 2, 1, 6);   // handlebar post
      px('#5a2a7a', 7, 3, 5, 5);    // hoodie
      px('#f2c9a0', 12, 3, 3, 1);
      px('#f2c9a0', 8, 3, 3, 3);    // head
      px('#1a1a1a', 7, 3, 3, 3);    // cap
    });
    mk('bully-bike', 20, 12, px => {
      px('#1a1a1a', 1, 5, 5, 2);
      px('#1a1a1a', 14, 5, 5, 2);
      px('#c8352f', 5, 5, 10, 2);   // frame
      px('#888888', 14, 2, 1, 8);
      px('#5a2a7a', 5, 3, 6, 6);    // hoodie
      px('#f2c9a0', 11, 3, 4, 1);
      px('#f2c9a0', 11, 8, 4, 1);
      px('#f2c9a0', 8, 4, 4, 4);    // head
      px('#1a1a1a', 7, 4, 4, 4);    // cap
    });
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
    mk('prop-trashcan', 10, 12, (c, px) => { px('#5d6670', 1, 0, 8, 2); px('#7d868f', 0, 2, 10, 10); px('#5d6670', 2, 3, 1, 8); px('#5d6670', 5, 3, 1, 8); px('#5d6670', 8, 3, 1, 8); px('#c9d1d9', 1, 3, 1, 3); });
    mk('prop-trashcan-tipped', 12, 10, (c, px) => { px('#5d6670', 0, 1, 2, 8); px('#7d868f', 2, 0, 10, 10); px('#5d6670', 3, 2, 8, 1); px('#5d6670', 3, 5, 8, 1); px('#3b4046', 2, 1, 1, 8); });
    mk('proj', 3, 3, (c, px) => { px('#d8d2c4', 0, 1, 3, 1); px('#d8d2c4', 1, 0, 1, 3); px('#ffffff', 1, 1, 1, 1); });
    mk('proj-shadow', 4, 2, (c, px) => { c.globalAlpha = 0.35; px('#000000', 0, 0, 4, 2); });
    mk('aim-dot', 2, 2, (c, px) => px('#ffffff', 0, 0, 2, 2));
    mk('ammo-pebble', 5, 4, (c, px) => { px('#7a7f86', 1, 0, 3, 4); px('#9aa0a8', 0, 1, 5, 2); px('#c4c9cf', 1, 1, 1, 1); });
    mk('ammo-chestnut', 5, 5, (c, px) => { px('#5a2f14', 1, 0, 3, 5); px('#7a4220', 0, 1, 5, 3); px('#b87a45', 1, 1, 1, 1); });
    mk('ammo-acorn', 4, 6, (c, px) => { px('#b88a3a', 0, 2, 4, 4); px('#6b4a1e', 0, 0, 4, 2); px('#6b4a1e', 1, 0, 2, 1); px('#d9b062', 1, 3, 1, 1); });
    mk('flag-pole', 2, 22, (c, px) => { px('#6b6f76', 0, 0, 2, 22); px('#e8e4d8', 0, 0, 2, 2); });
    mk('flag-seg', 4, 9, (c, px) => px('#ffffff', 0, 0, 4, 9));
  }
}
