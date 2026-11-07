export const PLAY_KINDS = ['swing', 'sign', 'bridge', 'kite', 'flag', 'cart', 'dominoes', 'floater'];

export function validatePlay(cfg) {
  return Object.keys(cfg.kinds).length === PLAY_KINDS.length && PLAY_KINDS.every(id => {
    const k = cfg.kinds[id];
    return k && Number.isInteger(k.parts) && k.parts >= 1 && k.parts <= 6
      && Number.isFinite(k.push) && k.push > 0 && typeof k.texture === 'string';
  }) && cfg.reach > 0;
}

export function playLayout(o, k, ts) {
  if (!PLAY_KINDS.includes(o.kind) || !k) throw new Error(`unknown play kind ${o.kind}`);
  const x = (o.x + 0.5) * ts;
  const y = (o.y + 0.5) * ts;
  return Array.from({ length: k.parts }, (_, i) => ({ x: x + i * k.spacing + (o.kind === 'floater' ? 48 : 0), y: y + (o.kind === 'floater' ? 0 : k.tether ?? 0) }));
}
