// Integer pixel scaling (AD-14): the 480x270 canvas is shown at floor(min(w/480, h/270)) times
// its size, centred and letterboxed by the page CSS. Only a window smaller than the base
// resolution falls back to a fractional fit.
export function integerScale(w, h, baseW, baseH) {
  const fit = Math.min(w / baseW, h / baseH);
  return fit < 1 ? fit : Math.floor(fit);
}

export function installScaling(game, baseW, baseH) {
  const apply = () => {
    const s = integerScale(window.innerWidth, window.innerHeight, baseW, baseH);
    const style = game.canvas.style;
    style.width = `${baseW * s}px`;
    style.height = `${baseH * s}px`;
    game.scale.refresh(); // re-read canvas bounds so pointer coordinates stay correct
  };
  game.events.once('ready', apply);
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', apply);
}
