import { LANGS } from '../i18n/i18n.js';

// Language and quality toggle rows shared by the menu and the pause overlay.
export function settingsRows({ t, i18n, quality }) {
  return [
    {
      caption: 'menu.language',
      items: LANGS.map(l => ({ label: () => t(`lang.${l}`), on: () => i18n.set(l), selected: () => i18n.lang === l }))
    },
    {
      caption: 'menu.quality',
      items: quality.ids.map(q => ({ label: () => t(`quality.${q}`), on: () => quality.set(q), selected: () => quality.id === q }))
    }
  ];
}
