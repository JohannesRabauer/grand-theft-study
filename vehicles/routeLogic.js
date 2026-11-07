// Looping routes for kinematic road vehicles (buses now, trams and cars with the traffic epic): a polyline in pixels with
// cumulative lengths, sampled by arc length. Phaser-free; entities/GrabTargets.js drives vehicles along it.

// points: [[x, y], ...] in tile coordinates (like map objects); the route is closed from the last point back to the first.
export function buildRoute(points, tileSize) {
  const pts = points.map(([x, y]) => ({ x: x * tileSize, y: y * tileSize }));
  const cum = [0];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    cum.push(cum[i] + Math.hypot(b.x - a.x, b.y - a.y));
  }
  return { pts, cum, total: cum[pts.length] };
}

// Position and unit tangent at arc length `s` (wraps around). Writes into `out`: { x, y, tx, ty }.
export function routeAt(route, s, out) {
  const { pts, cum, total } = route;
  const d = ((s % total) + total) % total;
  let i = 0;
  while (i < pts.length - 1 && cum[i + 1] <= d) i++;
  const a = pts[i];
  const b = pts[(i + 1) % pts.length];
  const len = cum[i + 1] - cum[i] || 1;
  const k = (d - cum[i]) / len;
  out.x = a.x + (b.x - a.x) * k;
  out.y = a.y + (b.y - a.y) * k;
  out.tx = (b.x - a.x) / len;
  out.ty = (b.y - a.y) / len;
  return out;
}

// Eases a heading toward `want` by at most `maxStep` radians (the short way round).
export function easeHeading(h, want, maxStep) {
  let diff = want - h;
  diff -= Math.round(diff / (2 * Math.PI)) * 2 * Math.PI;
  const eased = h + Math.max(-maxStep, Math.min(maxStep, diff));
  return eased - Math.round(eased / (2 * Math.PI)) * 2 * Math.PI; // kept in -PI..PI (sprites mirror by its sign)
}
