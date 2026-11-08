// The phone's messages (story 11.3), Phaser-free. See data/phone.json. The inbox is a list of { id, day, from, read } in the flag `phone.inbox`.
export const INBOX_KEY = 'phone.inbox';

// Does an event payload satisfy a rule? `match`: fields that must be equal; `min`: fields that must be at least that big.
export function matches(msg, payload = {}) {
  for (const [k, v] of Object.entries(msg.match ?? {})) if (payload[k] !== v) return false;
  for (const [k, v] of Object.entries(msg.min ?? {})) if (!(payload[k] >= v)) return false;
  return true;
}

// The inbox after a message arrives on `day`, or null when it must not arrive (once per game, or once per day). Newest last, capped.
export function arrive(inbox, msg, day, max) {
  if (inbox.some(m => m.id === msg.id && (!msg.perDay || m.day === day))) return null;
  return [...inbox, { id: msg.id, day, from: msg.from, read: false }].slice(-max);
}

export const unread = inbox => inbox.filter(m => !m.read).length;

export const markRead = inbox => inbox.some(m => !m.read) ? inbox.map(m => (m.read ? m : { ...m, read: true })) : inbox;

export function validatePhone(cfg) {
  const problems = [];
  const ids = cfg.messages.map(m => m.id);
  if (new Set(ids).size !== ids.length) problems.push('message ids must be unique');
  if (!(cfg.max >= 6)) problems.push('max must keep at least six messages');
  for (const m of cfg.messages) {
    if (!cfg.senders.includes(m.from)) problems.push(`${m.id}: unknown sender ${m.from}`);
    if (!m.on) problems.push(`${m.id}: names no event`);
  }
  return problems;
}
