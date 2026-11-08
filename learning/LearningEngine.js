// ctx.learning (AD-19): the one place that picks questions and writes learning stats. Callers get questions
// from next() / due(), report with answer() and never touch state.players[i].learning themselves.
// The pure logic is in engineCore.js; this wrapper binds it to the state store, the parent setting and the language.
import { EngineCore } from './engineCore.js';

const playerIndex = p => (typeof p === 'number' ? p : p?.index ?? 0);

export class LearningEngine {
  // topicFiles: parsed data/learning/<grade>/<topic>.json documents; any topic file works the same way.
  constructor(ctx, cfg, topicFiles, reactions) {
    this.ctx = ctx;
    const pools = Object.fromEntries(topicFiles.map(f => [f.topic, { grade: f.grade, bothLangs: !!f.bothLangs, items: f.items }]));
    const state = ctx.state;
    this.core = new EngineCore({
      pools,
      cfg,
      reactions,
      store: {
        get: (player, topic) => state.players[player]?.learning?.[topic],
        record: (player, topic, stats) => state.dispatch('learning.record', { player, topic, stats })
      },
      // AD-27 settings stub: the parent gate stores the difficulty modifier as a shared flag (default 1)
      parentDifficulty: () => state.shared.flags.parentDifficulty ?? 1,
      startOffset: player => ctx.characters?.def(player)?.learningStartOffset ?? 0
    });
  }

  topics() { return this.core.topics(); }

  // A question for the topic ({...item, meta}) or null for an unknown topic. context: 'lesson' | 'bully' | 'bakery' | ...
  // filter: optional tag name, array of tags or (item) => boolean; null when no item matches.
  next(topic, { player = 0, context = 'lesson', filter } = {}) { return this.core.next(topic, { player: playerIndex(player), context, filter }); }

  due(player = 0, opts) { return this.core.due(playerIndex(player), opts); }

  // Records the result (ms = time taken) and emits learning:answered. Returns the feedback data for the UI.
  answer(question, ok, ms, { player = 0, hintsUsed = 0 } = {}) {
    const p = playerIndex(player);
    const stats = this.core.answer(question, ok, ms, { player: p, hintsUsed });
    if (!stats) return null;
    const topic = question.meta?.topic ?? question.topic;
    this.ctx.events.emit('learning:answered', { player: p, topic, id: question.id, ok: !!ok, level: stats.level, streak: stats.streak });
    return this.core.feedback(question, ok, stats.streak);
  }

  feedback(question, ok, player = 0) {
    const topic = question.meta?.topic ?? question.topic;
    return this.core.feedback(question, ok, ok ? this.core.stats(playerIndex(player), topic).streak : 0);
  }

  localize(question, lang = this.ctx.i18n.lang) { return this.core.localize(question, lang); }

  isCorrect(question, response) { return this.core.isCorrect(question, response); }

  stats(player, topic) { return this.core.stats(playerIndex(player), topic); }

  // How many questions a topic has (the Lernbuch shows how many a kid has learned of them).
  poolSize(topic) { return this.core.pools[topic]?.items.length ?? 0; }
}
