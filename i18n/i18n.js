// ctx.t(key, params) over the active language (AD-11). `t` is one stable function: switching the
// language swaps the dictionary and emits `lang:changed`, so UI re-resolves its text from that event.
const KEY = 'schulweg.lang';
export const LANGS = ['de', 'en'];

export function createI18n(dicts, events) {
  let lang = 'de';
  try { if (localStorage.getItem(KEY) === 'en') lang = 'en'; } catch { /* storage blocked */ }
  document.documentElement.lang = lang;
  return {
    get lang() { return lang; },
    t(key, params) {
      let s = dicts[lang][key];
      if (s === undefined) {
        console.warn('missing i18n key', key);
        return key;
      }
      if (params) for (const k in params) s = s.replaceAll(`{${k}}`, params[k]);
      return s;
    },
    set(next) {
      if (!LANGS.includes(next) || next === lang) return;
      lang = next;
      document.documentElement.lang = lang;
      try { localStorage.setItem(KEY, lang); } catch { /* ignore */ }
      events.emit('lang:changed', lang);
    }
  };
}
