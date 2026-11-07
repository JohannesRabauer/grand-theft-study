// Smoke scenario: grades and Kopfnoten in the running game (ctx.grades). Everything goes through state actions.
export const grades = {
  name: 'grades',
  run(game, assert) {
    const ctx = game.scene.getScene('Game').ctx;
    const G = ctx.grades;
    const before = ctx.state.players[0].grades.entries.length;
    const seen = [];
    ctx.events.on('grades:recorded', e => seen.push(e));
    const a = G.grade(0, 'mathe', { score: 0.95, effort: 0.5, lessonId: 'smoke-1' });
    const b = G.grade(0, 'mathe', { score: 0.55, effort: 0.5, lessonId: 'smoke-2' });
    assert('grades are written to the ledger through the action', a.grade === 1 && b.grade === 4 && ctx.state.players[0].grades.entries.length === before + 2 && seen.length === 2);
    const avg = G.average(0);
    assert('the average updates with each grade', avg.bySubject.mathe >= 1 && avg.overall !== null && G.countOf(0, 1) >= 1);
    const verhalten = ctx.state.players[0].kopfnoten.verhalten;
    ctx.events.emit('traffic:red-light', { player: 0, adultsNearby: 2 });
    assert('a red light with adults nearby lowers Verhalten', ctx.state.players[0].kopfnoten.verhalten < verhalten);
    const snapshot = JSON.parse(JSON.stringify(ctx.state.data));
    ctx.state.replace(snapshot);
    assert('the ledger and Kopfnoten survive a state round trip', G.average(0).overall === avg.overall && ctx.state.players[0].kopfnoten.verhalten < verhalten);
    const card = G.reportCard(0, 'de');
    assert('the report card has a promotion result and warm texts', typeof card.promotion.promoted === 'boolean' && card.teacherComment.length > 10 && card.parentLine.length > 10);
    assert('the debug handle is exposed', window.SCHULWEG_GAME.grades === G);
  }
};
