// Quality service (AD-9). Exposes the active tier from data/quality.json; systems read caps from
// `ctx.quality.tier` at creation and on `quality:changed`. Persisted in localStorage `schulweg.quality`.
//
// The render resolution class (`renderScale`: 2 = 960x540 on Medium and High, 1 = 480x270 on Low,
// AD-14) is fixed when the page loads: main.js calls resolveRes() before it creates the Phaser game.
// Switching to a tier of the other class persists the choice and reloads the page after a short
// note (`quality:restart`); Medium <-> High is applied live.
const KEY = 'schulweg.quality';
const RELOAD_MS = 900;

// The tier to boot with (?q=, then the stored choice, then the device default) and the resulting
// render size. Pure and cheap: it runs before any scene exists.
export function resolveRes(cfg) {
  const ids = Object.keys(cfg.tiers);
  const valid = id => (ids.includes(id) ? id : null);
  const mobile = window.matchMedia('(pointer: coarse)').matches || Math.min(screen.width, screen.height) < 600;
  let stored = null;
  try { stored = localStorage.getItem(KEY); } catch { /* storage blocked: run without persistence */ }
  const tier = valid(new URLSearchParams(location.search).get('q')) ?? valid(stored) ?? cfg.default[mobile ? 'mobile' : 'desktop'];
  const scale = cfg.tiers[tier].renderScale;
  const { w, h } = cfg.base;
  // w, h: layout size of the UI (always the 480x270 base); renderW, renderH: canvas pixels; inv: display scale of a texture
  return { tier, scale, inv: 1 / scale, w, h, renderW: w * scale, renderH: h * scale };
}

export function createQuality(cfg, events, res) {
  const ids = Object.keys(cfg.tiers);
  const valid = id => (ids.includes(id) ? id : null);
  const q = {
    ids,
    id: res.tier,
    autoReload: !new URLSearchParams(location.search).has('bench'), // scripts/bench.js switches tiers without a page reload
    get tier() { return cfg.tiers[this.id]; },
    // Largest value of a cap over all tiers: pools allocate this once and only change their active count.
    maxOf(key) { return Math.max(...ids.map(i => cfg.tiers[i][key])); },
    set(id) {
      if (!valid(id) || id === this.id) return;
      this.id = id;
      try { localStorage.setItem(KEY, id); } catch { /* ignore */ }
      events.emit('quality:changed', id);
      if (cfg.tiers[id].renderScale === res.scale || !this.autoReload) return;
      events.emit('quality:restart', id);
      setTimeout(() => {
        const url = new URL(location.href);
        if (url.searchParams.has('q')) url.searchParams.set('q', id); // an explicit ?q= would win over the stored choice
        location.replace(url);
      }, RELOAD_MS);
    }
  };
  return q;
}
