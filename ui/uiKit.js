// Helpers for the UI scenes (AD-14). UI layout stays in the 480x270 base space; on Medium and High the
// canvas is 960x540, so the UI camera zooms by the render scale and text is rendered at that
// resolution: layout numbers are unchanged and every glyph is crisp.
export function setupUiCamera(scene, res) {
  scene.cameras.main.setOrigin(0, 0).setZoom(res.scale);
}

export function uiText(scene, x, y, str, style) {
  return scene.add.text(x, y, str, { ...style, resolution: scene.registry.get('app').res.scale });
}

// Short "restart needed" banner while the page reloads for a render-resolution change (quality.js).
export function bindRestartNote(scene, events, t, res) {
  const note = uiText(scene, res.w / 2, res.h - 40, '', {
    fontFamily: 'monospace', fontSize: '14px', color: '#000000', backgroundColor: '#ffe14d', padding: { x: 10, y: 6 }
  }).setOrigin(0.5).setDepth(100).setVisible(false);
  const show = () => note.setText(t('quality.restart')).setVisible(true);
  events.on('quality:restart', show);
  scene.events.once('shutdown', () => events.off('quality:restart', show));
}
