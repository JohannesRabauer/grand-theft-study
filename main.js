import { BootScene } from './scenes/BootScene.js';
import { MenuScene } from './scenes/MenuScene.js';
import { GameScene } from './scenes/GameScene.js';
import { UIScene } from './scenes/UIScene.js';
import { installScaling } from './ui/scaling.js';
import { resolveRes } from './services/quality.js';

window.SCHULWEG_DEBUG = new URLSearchParams(location.search).has('debug');

// AD-14: the render resolution follows the quality tier and is fixed at load, so the tier is read
// before the game exists (services/quality.js); BootScene reads the result from the registry.
const quality = await fetch('data/quality.json').then(r => r.json());
const res = resolveRes(quality);

const game = new Phaser.Game({
  type: Phaser.AUTO,
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
  scene: [BootScene, MenuScene, GameScene, UIScene],
  callbacks: { preBoot: g => g.registry.set('res', res) }
});
installScaling(game, res.renderW, res.renderH);
if (window.SCHULWEG_DEBUG) window.SCHULWEG_GAME = game; // for console inspection
// ?bench: stepping benchmark and smoke test (scripts/bench.js, docs/PERFORMANCE.md)
if (new URLSearchParams(location.search).has('bench')) game.events.once('ready', () => import('./scripts/bench.js').then(m => m.installBench(game)));
