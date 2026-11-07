// Smoke scenario: learning engine in the running game (ctx.learning). Answers go through the state store only.
export const learning = {
  name: 'learning',
  run(game, assert) {
    const ctx = game.scene.getScene('Game').ctx;
    const L = ctx.learning;
    const topic = L.topics()[0];
    const answered = [];
    ctx.events.on('learning:answered', e => answered.push(e));
    const q = L.next(topic, { player: 0 });
    assert('learning serves a question with meta', !!q && q.topic === topic && q.meta.hintsAllowed >= 0 && q.meta.timeFactor > 0);
    assert('the question text is localized', L.localize(q, 'de').q === q.q.de && L.localize(q, 'en').q === q.q.en);
    const before = ctx.state.players[0].learning[topic]?.n ?? 0;
    const fb = L.answer(q, false, 3000, { player: 0 });
    const st = ctx.state.players[0].learning[topic];
    assert('a wrong answer is stored in the state and gives kind feedback', st.n === before + 1 && st.items[q.id].b === 1 && fb.showExplain && !!fb.reaction && answered.length === 1);
    const q2 = L.next(topic, { player: 0 });
    assert('the next question is never the same one', q2.id !== q.id);
    L.answer(q2, true, 1000, { player: 0 });
    const copy = JSON.parse(JSON.stringify(ctx.state.data));
    ctx.state.replace(copy);
    assert('stats survive a state round trip', L.stats(0, topic).n === before + 2 && L.stats(0, topic).last === q2.id);
    assert('the debug handle is exposed', window.SCHULWEG_GAME.learning === L);
  }
};
