// Builds ctx.t(key, params) from a flat key -> string dictionary (AD-11).
export function createT(dict) {
  return (key, params) => {
    let s = dict[key];
    if (s === undefined) {
      console.warn('missing i18n key', key);
      return key;
    }
    if (params) for (const k in params) s = s.replaceAll(`{${k}}`, params[k]);
    return s;
  };
}

export function currentLang() {
  try {
    return localStorage.getItem('schulweg.lang') === 'en' ? 'en' : 'de';
  } catch {
    return 'de';
  }
}
