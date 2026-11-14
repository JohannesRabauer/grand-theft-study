// Readable labels when the camera zooms out (story 17.x). Every text the game scene adds (distance markers, prompts, speech bubbles,
// signboards) lives in world space, so it shrinks with the world: at the zoomed-out stop an 8 px label was 4 screen px and could
// not be read. This keeps their size on screen: each frame a text is scaled by (resting zoom / camera zoom), so it has the size it
// has when standing still (and its 2x font texture still maps 1:1). Scrolling texts (scroll factor other than 1) are left alone;
// a text whose scale some other code sets itself is re-based on that scale.
export class WorldText {
  constructor(scene, rest) {
    this.scene = scene;
    this.rest = rest; // the camera zoom at rest (render scale x camera.json max)
    this.list = [];
    const add = scene.add.text.bind(scene.add);
    scene.add.text = (...args) => {
      const text = add(...args);
      this.list.push(text);
      return text;
    };
  }

  update() {
    const k = Math.max(1, this.rest / this.scene.cameras.main.zoom);
    const list = this.list;
    for (let i = list.length - 1; i >= 0; i--) {
      const t = list[i];
      if (!t.scene) { list[i] = list[list.length - 1]; list.pop(); continue; }
      if (t.scrollFactorX !== 1) continue;
      let w = t.__wt;
      if (!w) w = t.__wt = { sx: t.scaleX, sy: t.scaleY, k: 1 };
      else if (t.scaleX !== w.sx * w.k || t.scaleY !== w.sy * w.k) { w.sx = t.scaleX; w.sy = t.scaleY; w.k = 1; }
      if (w.k !== k) { w.k = k; t.setScale(w.sx * k, w.sy * k); }
    }
  }
}
