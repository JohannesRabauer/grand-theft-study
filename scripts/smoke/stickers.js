// Smoke scenario: the sticker collection (story 10.3). Registered in scripts/smoke/index.js. Drops a real sticker as loot, awards one
// through an event, opens the album and reads a fun fact in both languages; the saved state is put back afterwards.
export const stickers = {
  name: 'stickers',
  run(game, assert, env) {
    const { step, ctx, ui, player } = env;
    const log = [];
    for (const n of ['sticker:collected', 'ui:toast']) ctx.events.on(n, e => log.push([n, e]));
    const count = (n, pred = () => true) => log.filter(e => e[0] === n && pred(e[1])).length;
    const data0 = ctx.state.data;
    const st = ctx.stickers;
    const top = () => ui.screens.top();
    const mine = () => ctx.state.players[0].stickers;
    ctx.state.replace({ ...ctx.state.data, players: ctx.state.players.map(p => ({ ...p, stickers: [] })) });

    // ---- a sticker lying on the ground is picked up by walking over it
    st.rng = () => 0;
    const drop = ctx.loot.drop('sticker', player.x, player.y, { source: 'bush' });
    player.teleport(drop.x, drop.y); // the loot lands a little way off: walk onto it
    step(90);
    assert('a sticker picked up as loot lands in the album with a toast naming it', mine().length === 1 && mine()[0] === ctx.state.cfg.stickers.loot[0] && count('sticker:collected', e => e.player === 0 && e.count === 1) === 1 && count('ui:toast', e => e.key === 'sticker.new') >= 1, JSON.stringify(mine()));
    st.rng = Math.random;

    // ---- an award from an event
    ctx.events.emit('mission:done', { id: 'parcel', kind: 'help' });
    assert('finishing a mission gives its own sticker', st.owns(0, 'pretzel') && mine().length === 2);
    ctx.events.emit('mission:done', { id: 'parcel', kind: 'help' });
    assert('and only once', mine().length === 2);

    // ---- the album
    ctx.openAlbum();
    step(2);
    const album = top();
    assert('the album opens, frozen, and counts the stickers', album?.id === 'album' && ctx.frozen && album.owner.text.includes(`2`) && album.owner.text.includes(String(st.total)), album?.owner?.text);
    const owned = ctx.state.cfg.stickers.stickers.findIndex(s => s.id === 'pretzel');
    album.sel = owned;
    album.render();
    assert('a found sticker shows its name and its fun fact', album.label.text === ctx.t('sticker.pretzel.name') && album.fact.text === ctx.t('sticker.pretzel.fact'));
    const lang = ctx.i18n.lang;
    const factHere = album.fact.text;
    ctx.i18n.set(lang === 'de' ? 'en' : 'de');
    assert('the fun fact follows the language', album.fact.text !== factHere && album.fact.text === ctx.t('sticker.pretzel.fact'));
    ctx.i18n.set(lang);
    const missing = ctx.state.cfg.stickers.stickers.findIndex(s => !mine().includes(s.id));
    album.sel = missing;
    album.render();
    assert('a missing sticker stays a mystery with a hint where to look', album.label.text === ctx.t('album.hidden') && album.fact.text === ctx.t('album.hiddenHint') && album.meta.text === '');
    env.press('pause');
    assert('Esc closes the album and unfreezes the world', !top() && !ctx.frozen);

    ctx.state.replace(data0);
    step(2);
    assert('the sticker scenario leaves the world running', !ctx.frozen && !top());
  }
};
