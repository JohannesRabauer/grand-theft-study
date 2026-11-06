import { BootScene } from './scenes/BootScene.js';
import { MenuScene } from './scenes/MenuScene.js';
import { GameScene } from './scenes/GameScene.js';
import { UIScene } from './scenes/UIScene.js';

window.SCHULWEG_DEBUG = new URLSearchParams(location.search).has('debug');

new Phaser.Game({
  type: Phaser.AUTO,
  width: 480,
  height: 270,
  backgroundColor: '#000000',
  pixelArt: true,
  roundPixels: true,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  physics: {
    default: 'matter',
    matter: {
      gravity: { x: 0, y: 0 },
      runner: { isFixed: true, fps: 60 },
      debug: window.SCHULWEG_DEBUG ? { renderFill: false, renderLine: true } : false
    }
  },
  scene: [BootScene, MenuScene, GameScene, UIScene]
});
