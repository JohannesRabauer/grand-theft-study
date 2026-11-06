import { BootScene } from './scenes/BootScene.js';
import { MenuScene } from './scenes/MenuScene.js';
import { GameScene } from './scenes/GameScene.js';
import { UIScene } from './scenes/UIScene.js';
import { installScaling } from './ui/scaling.js';

window.SCHULWEG_DEBUG = new URLSearchParams(location.search).has('debug');

const game = new Phaser.Game({
  type: Phaser.AUTO,
  width: 480,
  height: 270,
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
  scene: [BootScene, MenuScene, GameScene, UIScene]
});
installScaling(game, 480, 270);
if (window.SCHULWEG_DEBUG) window.SCHULWEG_GAME = game; // for console inspection
// ?bench: stepping benchmark and smoke test (scripts/bench.js, docs/PERFORMANCE.md)
if (new URLSearchParams(location.search).has('bench')) game.events.once('ready', () => import('./scripts/bench.js').then(m => m.installBench(game)));
