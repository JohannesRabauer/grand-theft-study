import { LANGS } from '../i18n/i18n.js';
import { EFFECT_MODES } from '../services/qualityLogic.js';

// The Effekte setting (story 16.15): saved through the state action (it also sets reducedMotion), then applied at once.
export function setEffects(ctx, mode) {
  ctx.state.dispatch('settings.effects', { value: mode });
  ctx.quality.setEffects(mode);
  ctx.events.emit('effects:set', mode);
}

export const effectsItems = ctx => EFFECT_MODES.map(m => ({ label: () => ctx.t(`effects.${m}`), on: () => setEffects(ctx, m), selected: () => ctx.quality.effects === m }));

// Language and quality toggle rows shared by the menu and the pause overlay (the pause overlay adds the Effekte row: the menu has no slot to save it in).
export function settingsRows(ctx, { effects = false } = {}) {
  const { t, i18n, quality } = ctx;
  return [
    {
      caption: 'menu.language',
      items: LANGS.map(l => ({ label: () => t(`lang.${l}`), on: () => i18n.set(l), selected: () => i18n.lang === l }))
    },
    {
      caption: 'menu.quality',
      items: quality.ids.map(q => ({ label: () => t(`quality.${q}`), on: () => quality.set(q), selected: () => quality.id === q }))
    },
    ...(effects ? [{ caption: 'menu.effects', items: effectsItems(ctx) }] : [])
  ];
}
