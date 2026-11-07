// Pure text builder for the save slot screen (no Phaser): turns one SaveSlots.list() row into a
// single line. `t` is ctx.t, `lang` the active language (decides the decimal comma).
export const formatMoney = (cents, lang) => {
  const s = (cents / 100).toFixed(2);
  return lang === 'de' ? s.replace('.', ',') : s;
};

export function slotSummary(row, t, lang, hasBackup = false) {
  if (row.status === 'corrupt') return t('menu.slot.corrupt');
  if (row.status === 'empty') return t(hasBackup ? 'menu.slot.emptyBackup' : 'menu.slot.empty');
  const who = row.players
    .map((p, i) => (p.character ? p.character : t('menu.slot.player', { n: i + 1 })) + ` ${t('menu.slot.level', { n: p.level })}`)
    .join(' + ');
  return `${who} | ${t('menu.slot.day', { n: row.day })} | € ${formatMoney(row.money, lang)}`;
}
