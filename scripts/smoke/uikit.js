// Smoke scenario: the pixel UI kit (story 16.14). Registered in scripts/smoke/index.js. The UI camera has no post pass, the icon atlas exists, a HUD plate
// grows with its text, a toast shows a panel and times out, a screen eases in and out (and does not under reducedMotion), the buttons of the pause screen
// move their focus and the speech bubbles carry their plate. The scripted runs normally switch the easing off (game.uiAnimOff); this scenario turns it on and puts it back.
export const uikit = {
  name: 'uikit',
  async run(game, assert, env) {
    const { step, ctx, ui, hud, press } = env;
    const wait = ms => new Promise(r => setTimeout(r, ms)); // tweens count wall-clock time (Phaser's TweenManager), not the stepped clock
    const top = () => ui.screens.top();
    const cfg = game.cache.json.get('ui');
    const anim0 = game.uiAnimOff;

    // ---- the UI scene is its own camera: no pass of the world camera reaches it (AD-31)
    assert('the UI camera has no post pass and no pipeline of its own', ui.cameras.main.postPipelines.length === 0 && !(ui.cameras.main.preFX?.list?.length));
    const key = `ui-icons-${ctx.res.scale}`;
    assert('the icon atlas exists at the render scale with a frame per icon', game.textures.exists(key) && ['coin', 'bolt', 'flame', 'star', 'mail', 'winter'].every(n => game.textures.get(key).has(n)));
    assert('every HUD module and screen text takes its colour from the kit', hud('clock').time.style.color === cfg.text.ink.gold && hud('status').label.style.color === cfg.text.ink.text);

    // ---- a plate is as wide as its widest line
    const plateW = () => +hud('status').plate.key.split(',')[2];
    const narrow = plateW();
    ctx.events.emit('player:vehicle', { player: 0, id: 'rollerblades' });
    const wide = plateW();
    ctx.events.emit('player:vehicle', { player: 0, id: ctx.players[0].vehicle });
    assert('the status plate grows with a long vehicle name and shrinks back', wide > narrow && plateW() === narrow, `${narrow} -> ${wide} -> ${plateW()}`);
    assert('the clock plate and the money chip sit under their text', hud('money').plate.key.length > 0 && hud('clock').plate.key.startsWith(`${ctx.res.w / 2 - 46},2,`));

    // ---- a toast: a panel under the text, gone after its time
    const toast = hud('toast');
    ctx.events.emit('ui:toast', { key: 'hud.money', params: { v: '1,00' } });
    step(2);
    assert('a toast shows its text on a panel', toast.text.visible && toast.panel.visible && toast.text.text.length > 0);
    step(200);
    assert('and takes both away after its time', !toast.text.visible && !toast.panel.visible);

    // ---- a screen eases in and out, and the buttons wear the focus ring
    game.uiAnimOff = false;
    ctx.state.dispatch('settings.reducedMotion', { value: false });
    press('pause');
    const pause = top();
    const panel = pause.objects[1];
    assert('the pause screen starts faint and low while it opens', pause?.id === 'pause' && panel.alpha < 1 && ctx.frozen, `alpha ${panel.alpha}`);
    step(2);
    await wait(cfg.anim.open + 120);
    step(2);
    assert('and is settled after the opening time', panel.alpha === 1 && pause.objects.every(o => o.alpha > 0.5) && pause.title.y === 28, `alpha ${panel.alpha}, title y ${pause.title.y}`);
    const menu = pause.menu;
    assert('the first button holds the focus', menu.row === 0 && menu.col === 0);
    menu.key('ArrowDown');
    menu.key('ArrowRight');
    assert('the arrow keys move the focus over the rows of buttons', menu.row === 1 && menu.col === 1);
    const objectsBefore = ui.children.list.length;
    press('pause');
    assert('closing the screen releases the world at once while the panel fades out', !top() && !ctx.frozen && ui.children.list.length >= objectsBefore - 1 && panel.scene, `${ui.children.list.length} vs ${objectsBefore}`);
    for (let i = 0; i < 12 && panel.scene; i++) { step(2); await wait(cfg.anim.close + 60); }
    step(2);
    assert('the faded screen is destroyed after the closing time', !panel.scene && ui.children.list.length < objectsBefore - 10, `${ui.children.list.length} vs ${objectsBefore}`);

    // ---- reducedMotion and the scripted-run flag: no easing, objects gone at once
    ctx.state.dispatch('settings.reducedMotion', { value: true });
    press('pause');
    const quick = top();
    assert('under reducedMotion a screen opens settled', quick.objects[1].alpha === 1);
    press('pause');
    assert('and closes without a fade', !quick.objects.length && !quick.title.scene);
    ctx.state.dispatch('settings.reducedMotion', { value: false });
    game.uiAnimOff = true;
    press('pause');
    const flat = top();
    assert('the scripted-run flag opens a screen settled as well', flat.objects[1].alpha === 1);
    press('pause');
    assert('and the unused screens are gone', !top() && !flat.title.scene);

    // ---- speech bubbles carry the paper plate with their line
    const bubbles = ctx.crowd.bubbles;
    const owner = { x: ctx.players[0].x, y: ctx.players[0].y - 30, active: true };
    bubbles.say(owner, 'Hallo!', 1);
    const b = bubbles.items.find(i => i.owner === owner);
    assert('a bubble shows its text and its plate', b.text.visible && b.frame.visible && b.frame.commandBuffer.length > 8);
    bubbles.release(owner);
    assert('and both go with it', !b.text.visible && !b.frame.visible);

    game.uiAnimOff = anim0;
  }
};
