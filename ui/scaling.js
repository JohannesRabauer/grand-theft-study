// Integer pixel scaling (AD-14): the render canvas (960x540 on Medium/High, 480x270 on Low) is
// shown at floor(min(w/baseW, h/baseH)) times its size, centred and letterboxed by the page CSS.
// The fit is computed in device pixels (innerWidth * devicePixelRatio), so a phone with a 3x
// screen still gets whole screen pixels per game pixel. Only a window smaller than the base
// resolution falls back to a fractional fit.
export function integerScale(w, h, baseW, baseH) {
  const fit = Math.min(w / baseW, h / baseH);
  return fit < 1 ? fit : Math.floor(fit);
}

export function installScaling(game, baseW, baseH) {
  const apply = () => {
    const dpr = window.devicePixelRatio || 1;
    const s = integerScale(window.innerWidth * dpr, window.innerHeight * dpr, baseW, baseH);
    const style = game.canvas.style;
    style.width = `${(baseW * s) / dpr}px`;
    style.height = `${(baseH * s) / dpr}px`;
    game.scale.refresh(); // re-read canvas bounds so pointer coordinates stay correct
  };
  game.events.once('ready', apply);
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', apply);
}
