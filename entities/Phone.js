// The phone (story 11.3, ctx.phone): messages from mom, friends and the bully gang arrive when scripted events fire (data/phone.json),
// are kept in the family's flag `phone.inbox` and show as a badge in the HUD (PhoneModule) and in the PhoneScreen (key P or a tap on the
// badge). Emits `phone:message` { id, from } and `phone:changed` { unread }; a toast tells that a message came.
import { PhoneScreen } from '../ui/screens/PhoneScreen.js';
import { INBOX_KEY, arrive, markRead, matches, unread } from '../services/phoneLogic.js';

export class Phone {
  constructor(scene, ctx, cfg) {
    this.scene = scene;
    this.ctx = ctx;
    this.cfg = cfg;
    ctx.phone = this;
    for (const event of new Set(cfg.messages.map(m => m.on))) {
      ctx.events.on(event, payload => { for (const m of cfg.messages) if (m.on === event && matches(m, payload)) this.deliver(m); });
    }
  }

  get inbox() { return this.ctx.state.shared.flags[INBOX_KEY] ?? []; }

  get unread() { return unread(this.inbox); }

  deliver(msg) {
    const { ctx } = this;
    const next = arrive(this.inbox, msg, ctx.state.shared.clock.day, this.cfg.max);
    if (!next) return false;
    ctx.state.dispatch('flags.set', { key: INBOX_KEY, value: next });
    ctx.events.emit('phone:message', { id: msg.id, from: msg.from });
    ctx.events.emit('phone:changed', { unread: unread(next) });
    ctx.events.emit('ui:toast', { key: 'phone.new', params: { from: ctx.t(`phone.from.${msg.from}`) } });
    return true;
  }

  read() {
    const next = markRead(this.inbox);
    if (next === this.inbox) return;
    this.ctx.state.dispatch('flags.set', { key: INBOX_KEY, value: next });
    this.ctx.events.emit('phone:changed', { unread: 0 });
  }

  // Called by the screen when it closes, so one key press never closes and reopens it in the same frame.
  closed() { this.closedFrame = this.scene.game.getFrame(); }

  // Opens the phone, or closes it when it is open; nothing opens over another screen.
  toggle() {
    const { ctx } = this;
    const top = ctx.screens?.top();
    if (top?.id === 'phone') { top.close(); return null; }
    if (!ctx.screens || top || this.closedFrame === this.scene.game.getFrame()) return null; // the screen closed on this very key press
    return ctx.screens.push(new PhoneScreen(this.scene.scene.get('UI'), ctx, ctx.screens, this));
  }
}
