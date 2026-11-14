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

// Speed limits along a route (story 17.x): a vehicle takes bends slower and brakes for them in good time. `curve`
// { window, lateral, floor } (px, px/s2, px/s): the bend at s is the heading change over `window` px around it, the limit there is
// sqrt(lateral / curvature) but at least `floor`; `comfort` (px/s2) then spreads every limit backwards so that braking starts early
// enough (two passes round the closed loop). Returns { step, limit: Float32Array }, sampled every `step` px.
export function buildSpeedProfile(route, step, curve, comfort, top) {
  const n = Math.max(1, Math.round(route.total / step));
  const ds = route.total / n;
  const a = { x: 0, y: 0, tx: 0, ty: 0 };
  const limit = new Float32Array(n);
  const ang = new Float32Array(n);
  for (let i = 0; i < n; i++) { routeAt(route, i * ds, a); ang[i] = Math.atan2(a.ty, a.tx); }
  const reach = Math.max(1, Math.round(curve.window / ds / 2));
  for (let i = 0; i < n; i++) {
    let diff = ang[(i + reach) % n] - ang[(i - reach + n * 4) % n];
    diff = Math.abs(diff - Math.round(diff / (2 * Math.PI)) * 2 * Math.PI);
    const k = diff / (2 * reach * ds);
    limit[i] = k < 1e-4 ? top : Math.min(top, Math.max(curve.floor, Math.sqrt(curve.lateral / k)));
  }
  for (let pass = 0; pass < 2; pass++) {
    for (let i = n * 2 - 1; i >= 0; i--) {
      const next = limit[(i + 1) % n];
      const v = Math.sqrt(next * next + 2 * comfort * ds);
      if (v < limit[i % n]) limit[i % n] = v;
    }
  }
  return { step: ds, limit };
}

// The speed limit of the profile at arc length `s` (wraps around).
export function profileAt(profile, route, s) {
  const { limit, step } = profile;
  const n = limit.length;
  const f = ((((s % route.total) + route.total) % route.total) / step);
  const i = Math.floor(f) % n;
  const k = f - Math.floor(f);
  return limit[i] + (limit[(i + 1) % n] - limit[i]) * k;
}
