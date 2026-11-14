// Window scaling (AD-14): the render canvas (960x540 on Medium/High, 480x270 on Low) fills the window as far as its aspect
// ratio allows, centred and letterboxed by the page CSS, so resizing the browser window rescales the game. The fit is computed
// in device pixels (innerWidth * devicePixelRatio). When it is within `SNAP` of a whole number it snaps to it (and the canvas is
// drawn with hard pixel edges); in between the canvas is scaled smoothly, which keeps a fractional fit from showing uneven pixels.
const SNAP = 0.04;

export function integerScale(w, h, baseW, baseH) {
  const fit = Math.min(w / baseW, h / baseH);
  const whole = Math.round(fit);
  return whole >= 1 && Math.abs(fit - whole) <= SNAP * whole ? whole : fit;
}

export function installScaling(game, baseW, baseH) {
  const apply = () => {
    const dpr = window.devicePixelRatio || 1;
    const s = integerScale(window.innerWidth * dpr, window.innerHeight * dpr, baseW, baseH);
    const style = game.canvas.style;
    style.width = `${(baseW * s) / dpr}px`;
    style.height = `${(baseH * s) / dpr}px`;
    style.imageRendering = Number.isInteger(s) ? 'pixelated' : 'auto';
    game.scale.refresh(); // re-read canvas bounds so pointer coordinates stay correct
  };
  game.events.once('ready', apply);
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', apply);
}
