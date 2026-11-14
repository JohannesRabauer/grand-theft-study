// Off-screen culling for the world camera (story 16.15, AD-29). Phaser's WebGL renderer batches every visible sprite of the display
// list even when it lies far outside the camera (it only skips them on Canvas), and since the epic the town holds about 600 pooled
// and placed images (crowns, hedges, lamps, eaves, props, pools) of which roughly 70 percent are off screen at any time: a profile of
// the render loop put `batchSprite` and its matrix work at the top. A camera that opts in with `camera.cullOffscreen = true` skips
// an Image or Sprite whose farthest reach from its origin stays clear of the view (plus a margin); nothing else changes, so no system
// has to hide its sprites itself. Parented objects (containers), objects with a scroll factor other than 1 and every other camera
// (the UI, render textures, which also draw through renderWebGL) are never touched.
export const CULL_MARGIN = 32; // world px beyond the view (shader displacement, shake, rounding)

// Pure test: is a box at (x, y) with the given size and origin entirely beyond the view? Rotation-proof (uses the farthest corner).
export function isBeyondView(x, y, w, h, originX, originY, scale, view, margin = CULL_MARGIN) {
  const rx = Math.max(originX, 1 - originX) * w;
  const ry = Math.max(originY, 1 - originY) * h;
  const reach = Math.sqrt(rx * rx + ry * ry) * scale + margin;
  return x + reach < view.x || x - reach > view.right || y + reach < view.y || y - reach > view.bottom;
}

let installed = false;

export function installCulling() {
  if (installed || typeof Phaser === 'undefined' || !Phaser.GameObjects?.Image) return;
  installed = true;
  for (const cls of [Phaser.GameObjects.Image, Phaser.GameObjects.Sprite]) {
    const proto = cls.prototype;
    const draw = proto.renderWebGL;
    proto.renderWebGL = function (renderer, src, camera, parentMatrix) {
      if (camera.cullOffscreen && !parentMatrix && src.scrollFactorX === 1 && src.scrollFactorY === 1
        && isBeyondView(src.x, src.y, src.width, src.height, src.originX, src.originY, Math.max(Math.abs(src.scaleX), Math.abs(src.scaleY)), camera.worldView)) return;
      draw.call(this, renderer, src, camera, parentMatrix);
    };
  }
}
