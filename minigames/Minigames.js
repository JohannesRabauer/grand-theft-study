import { buildResult, clampDifficulty, playersProblem, Tally } from './minigameCore.js';
import { MinigameScreen } from '../ui/screens/MinigameScreen.js';
import { MinigameResultScreen } from '../ui/screens/MinigameResultScreen.js';
import { MinigameIntroductionScreen } from '../ui/screens/MinigameIntroductionScreen.js';

// ctx.minigames (AD-20): starts a registered minigame (data/minigames.json) on top of the frozen world and resolves with
// its graded result. The freeze is a 'minigame' screen on ctx.screens (counted, so the pause screen and the result
// screen nest on it), the HUD is ducked through ctx.duckHud, and the scene MG_<id> (registered in main.js) runs only for the run. Grades are
// not recorded here (the day flow records lesson grades through ctx.grades.grade); XP and money are.
export class Minigames {
  constructor(gameScene, ctx, data) {
    this.gameScene = gameScene;
    this.manager = gameScene.scene.manager;
    this.ctx = ctx;
    this.cfg = data.settings;
    this.defs = data.minigames;
    this.active = null;
    gameScene.events.once('shutdown', () => this.abort());
  }

  // The registered minigames a player can pick; the demos are only listed in ?debug sessions.
  list() { return this.defs.filter(d => !d.debug || window.SCHULWEG_DEBUG); }

  // Runs a minigame; resolves with { id, subject, quit, difficulty, score 0-1, effort 0-1, correct, total, hintsUsed, xp,
  // moneyCents, grade 1-6, ms, stats, perPlayer[] } once the player left the result screen and the world is back.
  // players: indexes into ctx.players (1..def.maxPlayers). topic: optional single topic of def.topics.
  start(id, { players = [0], difficulty, context = 'lesson', lessonId = '', topic, notice } = {}) {
    const { ctx } = this;
    const def = this.defs.find(d => d.id === id);
    const problem = !def ? `unknown minigame "${id}"`
      : this.active ? 'a minigame is already running'
        : !ctx.screens ? 'the UI is not ready'
          : playersProblem(def, players, ctx.players.length) ?? (topic && !def.topics.includes(topic) ? `unknown topic "${topic}"` : null);
    if (problem) return Promise.reject(new Error(`minigames.start: ${problem}`));
    return new Promise(resolve => {
      const session = this.active = { def, players: [...players], difficulty: clampDifficulty(def, difficulty), lessonId, notice, resolve, scene: null, screen: null, result: null };
      session.complete = raw => this.complete(session, raw);
      session.screen = ctx.screens.push(new MinigameScreen(ctx));
      ctx.duckHud(true);
      const begin = () => {
        if (ctx.screens.top() === session.introduction) ctx.screens.pop();
        this.manager.start(def.scene, { ctx, def, cfg: this.cfg, session, players: session.players, difficulty: session.difficulty, context, topic });
      };
      if (notice) {
        const ui = this.manager.getScene('UI');
        session.introduction = ctx.screens.push(new MinigameIntroductionScreen(ui, ctx, session, begin, () => this.quit()));
      } else begin();
    });
  }

  // The player chose "end minigame" in the pause screen: counts as a low-effort round, no rewards, no result screen.
  quit() {
    const s = this.active;
    if (!s || s.result) return false;
    if (!s.scene) {
      this.complete(s, { tallies: s.players.map(() => new Tally()), ms: 0, quit: true });
      return true;
    }
    s.scene.finish({ quit: true });
    return true;
  }

  complete(session, { tallies, ms, quit, silent }) {
    const { ctx, cfg } = this;
    const { def } = session;
    const result = session.result = buildResult({
      def,
      cfg,
      players: session.players,
      tallies,
      ms,
      quit,
      difficulty: session.difficulty,
      gradeFn: (player, r) => ctx.grades.preview(player, def.subject, r)
    });
    if (!silent) this.reward(result);
    if (quit || silent) { this.close(session); return; }
    const ui = this.manager.getScene('UI');
    ctx.screens.push(new MinigameResultScreen(ui, ctx, { result, cfg, onContinue: () => this.close(session) }));
  }

  reward(result) {
    const { ctx } = this;
    for (const p of result.perPlayer) if (p.xp > 0) ctx.state.dispatch('xp.add', { player: p.player, amount: p.xp });
    if (result.moneyCents > 0) ctx.state.dispatch('wallet.earn', { cents: result.moneyCents, reason: `minigame:${result.id}` });
    ctx.events.emit('minigame:done', { id: result.id, result, players: result.perPlayer.map(p => p.player) });
  }

  // Restores the world: closes the screens above and including the minigame screen (which unfreezes it), shows the HUD
  // again, removes the scene and resolves the promise.
  close(session) {
    const { ctx } = this;
    const stack = ctx.screens;
    if (stack) {
      while (stack.top() && stack.top() !== session.screen) stack.pop();
      stack.pop();
    }
    ctx.duckHud?.(false);
    this.active = null;
    const key = session.def.scene;
    this.manager.stop(key);
    session.resolve(session.result);
    if (session.result?.quit && stack) ctx.events.emit('ui:toast', { key: 'minigame.quit.toast' });
  }

  // The run is cut off from outside (back to the menu): the scene goes away, nothing is rewarded.
  abort() {
    const s = this.active;
    if (!s) return;
    if (s.scene && !s.result) s.scene.finish({ quit: true, silent: true });
    else this.close(s);
  }
}
