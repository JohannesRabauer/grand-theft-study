// Co-op HUD slices (AD-18), pure. With two players P1's slice sits at the left edge and P2's at the right edge
// (mirrored); `dy` pushes P2's status below the shared Ärger meter that owns the top right corner. One player
// keeps today's single layout (left, no offset).
export function sliceOf(index, players, width) {
  if (players < 2 || index === 0) return { right: false, x: 4, dy: 0 };
  return { right: true, x: width - 4, dy: 38 };
}

// Where a player's marker sits at the edge of the view when it is off-centre: the point on the border (inset by
// `pad`) in the direction of (nx, ny), both -1..1 from the view centre; null while inside `threshold` (0..1).
export function edgeSpot(nx, ny, threshold, w, h, pad, out) {
  const m = Math.max(Math.abs(nx), Math.abs(ny));
  if (m <= threshold) return null;
  out.x = w / 2 + (nx / m) * (w / 2 - pad);
  out.y = h / 2 + (ny / m) * (h / 2 - pad);
  out.angle = Math.atan2(ny, nx);
  return out;
}
