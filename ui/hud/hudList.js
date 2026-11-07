// Pure resolution of the HUD module list (AD-27): data/hud.json lists module ids per mode; this turns a
// mode into concrete instances to build. `scope: "player"` entries repeat once per player index,
// `scope: "shared"` entries exist once. Every module gets `opts.players` (the layout depends on it). Entries flagged `debug` only exist when debug is on.
export function resolveHud(cfg, mode, registry, { players = 1, debug = false } = {}) {
  const list = cfg.modes[mode];
  if (!list) throw new Error(`hud: unknown mode "${mode}"`);
  const out = [];
  for (const e of list) {
    const Cls = registry[e.id];
    if (!Cls) throw new Error(`hud: module "${e.id}" is not registered`);
    if (e.debug && !debug) continue;
    if (e.scope === 'player') {
      for (let i = 0; i < players; i++) out.push({ id: players > 1 ? `${e.id}.${i}` : e.id, Cls, opts: { playerIndex: i, players } });
    } else if (e.scope === 'shared') {
      out.push({ id: e.id, Cls, opts: { shared: true, players } });
    } else {
      throw new Error(`hud: module "${e.id}" has scope "${e.scope}", expected player or shared`);
    }
  }
  return out;
}
