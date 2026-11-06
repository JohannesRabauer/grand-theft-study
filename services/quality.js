// Quality service (AD-9). Exposes the active tier from data/quality.json; systems read caps from
// `ctx.quality.tier` at creation and on `quality:changed`. Persisted in localStorage `schulweg.quality`.
const KEY = 'schulweg.quality';

export function createQuality(cfg, events) {
  const ids = Object.keys(cfg.tiers);
  const valid = id => (ids.includes(id) ? id : null);
  const mobile = window.matchMedia('(pointer: coarse)').matches || Math.min(screen.width, screen.height) < 600;
  let stored = null;
  try { stored = localStorage.getItem(KEY); } catch { /* storage blocked: run without persistence */ }
  const fromUrl = valid(new URLSearchParams(location.search).get('q'));
  const q = {
    ids,
    id: fromUrl ?? valid(stored) ?? cfg.default[mobile ? 'mobile' : 'desktop'],
    get tier() { return cfg.tiers[this.id]; },
    // Largest value of a cap over all tiers: pools allocate this once and only change their active count.
    maxOf(key) { return Math.max(...ids.map(i => cfg.tiers[i][key])); },
    set(id) {
      if (!valid(id) || id === this.id) return;
      this.id = id;
      try { localStorage.setItem(KEY, id); } catch { /* ignore */ }
      events.emit('quality:changed', id);
    }
  };
  return q;
}
