import { BootScene } from './scenes/BootScene.js';
import { MenuScene } from './scenes/MenuScene.js';
import { GameScene } from './scenes/GameScene.js';
import { UIScene } from './scenes/UIScene.js';
import { MINIGAME_CLASSES } from './minigames/index.js';
import { installScaling } from './ui/scaling.js';
import { resolveRes } from './services/quality.js';

window.SCHULWEG_DEBUG = new URLSearchParams(location.search).has('debug');
// offline play after the first visit (story 14.1, sw.js); not in the scripted ?bench runs
if ('serviceWorker' in navigator && !new URLSearchParams(location.search).has('bench') && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
// debug maps and doors (data/maps/index.json) exist only in sessions meant for checking
window.SCHULWEG_TESTMAPS = window.SCHULWEG_DEBUG || new URLSearchParams(location.search).has('bench');

// AD-14: the render resolution follows the quality tier and is fixed at load, so the tier is read
// before the game exists (services/quality.js); BootScene reads the result from the registry.
const quality = await fetch('data/quality.json').then(r => r.json());
const res = resolveRes(quality);
// The list of map files (AD-28) is needed to queue them in BootScene's preload, so it is read here too.
const mapIndex = await fetch('data/maps/index.json').then(r => r.json());

const game = new Phaser.Game({
  type: new URLSearchParams(location.search).get('renderer') === 'canvas' ? Phaser.CANVAS : Phaser.AUTO, // ?renderer=canvas forces the Canvas fallback (no light map, no post passes)
  width: res.renderW,
  height: res.renderH,
  backgroundColor: '#000000',
  pixelArt: true,
  roundPixels: true,
  scale: { mode: Phaser.Scale.NONE }, // sized by ui/scaling.js
  input: { gamepad: true },
  physics: {
    default: 'matter',
    matter: {
      gravity: { x: 0, y: 0 },
      autoUpdate: false, // GameScene steps Matter itself: one fixed 60 Hz step per 1/60 s of real time (AD-14)
      debug: window.SCHULWEG_DEBUG ? { renderFill: false, renderLine: true } : false
    }
  },
  // minigame scenes (AD-20) are registered once and only started on demand; UI stays last so it draws above them
  scene: [BootScene, MenuScene, GameScene, ...Object.values(MINIGAME_CLASSES), UIScene],
  callbacks: { preBoot: g => { g.registry.set('res', res); g.registry.set('mapIndex', mapIndex); } }
});
installScaling(game, res.renderW, res.renderH);
if (window.SCHULWEG_DEBUG) window.SCHULWEG_GAME = game; // for console inspection
// ?bench: stepping benchmark and smoke test (scripts/bench.js, docs/PERFORMANCE.md)
if (new URLSearchParams(location.search).has('bench')) game.events.once('ready', () => import('./scripts/bench.js').then(m => m.installBench(game)));
