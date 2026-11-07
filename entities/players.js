// The players array (AD-18). `ctx.players` holds every Player (each has an `index`); systems loop over it
// or use the helpers below. `ctx.player` is a deprecated alias for players[0], kept only until
// scripts/check-players.mjs finds no use of it, which it enforces for the whole repo.
// Phaser-free so the check script can exercise it in node.

export function installPlayers(ctx, maxPlayers) {
  const players = [];
  const alive = [];
  ctx.players = players;
  ctx.maxPlayers = maxPlayers;
  Object.defineProperty(ctx, 'player', { get: () => players[0], configurable: true }); // deprecated alias for players[0]

  ctx.forEachPlayer = (fn) => {
    for (let i = 0; i < players.length; i++) fn(players[i], i);
  };

  // Nearest player to a point (null without players).
  ctx.nearestPlayer = (x, y) => {
    let best = null;
    let bestD = Infinity;
    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      const d = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y);
      if (d < bestD) { bestD = d; best = p; }
    }
    return best;
  };

  // Players still in play (everyone, until a later story can put a player out). The returned array is
  // reused on every call: read it at once, never keep it.
  ctx.alivePlayers = () => {
    alive.length = 0;
    for (let i = 0; i < players.length; i++) if (players[i].alive !== false) alive.push(players[i]);
    return alive;
  };
  return players;
}
