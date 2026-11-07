// Camera rig maths (AD-18), Phaser-free. Positions are world px; "view" is the UI space (480x270 at zoom 1),
// margins are UI px, so a margin of 48 keeps a player 48 screen px (not world px) inside the edge at any zoom.
// Items are anything with x, y and optionally `pinned` (a player held by a caught frame or a screen).

// Centre of the players; a pinned player counts only `pinnedWeight` (0..1), so the camera favours the free one.
export function weightedCenter(out, list, pinnedWeight = 1) {
  if (list.length === 1) { out.x = list[0].x; out.y = list[0].y; return out; }
  let sx = 0;
  let sy = 0;
  let sw = 0;
  for (const p of list) {
    const w = p.pinned ? pinnedWeight : 1;
    sx += p.x * w;
    sy += p.y * w;
    sw += w;
  }
  out.x = sx / sw;
  out.y = sy / sw;
  return out;
}

// The zoom (config units, like data/camera.json min..max) at which every item is within the view minus the margin
// around (cx, cy), clamped to zMin..zMax. Items on the centre fit at any zoom (returns zMax).
export function fitZoom(list, cx, cy, view, margin, zMin, zMax) {
  let dx = 0;
  let dy = 0;
  for (const p of list) {
    dx = Math.max(dx, Math.abs(p.x - cx));
    dy = Math.max(dy, Math.abs(p.y - cy));
  }
  const zx = dx > 0 ? (view.w / 2 - margin.x) / dx : Infinity;
  const zy = dy > 0 ? (view.h / 2 - margin.y) / dy : Infinity;
  return Math.min(zMax, Math.max(zMin, Math.min(zx, zy)));
}

// The speed zoom and the fit zoom both have to hold: the smaller one wins.
export function effectiveZoom(speedZoom, fit) {
  return Math.min(speedZoom, fit);
}
