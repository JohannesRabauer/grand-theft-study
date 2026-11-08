// The flow of the day after school (story 8.5, ctx.dayFlow), story clock only:
// - Afternoon starts: with a seeded chance the big kids wait at the school gate (Aerger level up, a warning toast, `day:gate`).
// - Ride home: in the afternoon and evening the objective arrow points at the front door of home (`objective()`).
// - Evening: a toast when it starts and one shortly before bedtime.
// - The evening ends (`phase:ended` evening): `day:bedtime` { day, atHome }, a good-night message with a summary waits to be read
//   (the world frozen), a kid who is still out is brought home by the parents, and the next morning starts at home. The autosave
//   on phase:ended (state/SaveSlots.js) has already stored where the game continues.
import { MessageScreen } from '../ui/screens/MessageScreen.js';
import { ReportCardScreen } from '../ui/screens/ReportCardScreen.js';
import { parseTime } from '../services/dayTime.js';
import { rng } from '../services/schoolEvents.js';

export class DayFlow {
  constructor(scene, ctx, cfg, inputCfg) {
    this.scene = scene;
    this.ctx = ctx;
    this.cfg = cfg;
    this.inputCfg = inputCfg;
    ctx.dayFlow = this;
    ctx.events.on('phase:started', e => this.onStart(e));
    ctx.events.on('phase:ended', e => this.onEnd(e));
    ctx.events.on('clock:tick', e => this.onTick(e));
  }

  get story() { return this.ctx.day.mode === 'story'; }

  toast(key, params) { this.ctx.events.emit('ui:toast', { key, params }); }

  onStart({ phase, day }) {
    if (!this.story) return;
    if (phase === 'afternoon') this.gate(day);
    if (phase === 'evening') this.toast('day.evening');
  }

  // The school gate: the big kids may be waiting when the lessons are over.
  gate(day) {
    const { ctx, cfg } = this;
    if (ctx.world.id !== 'town' || rng(cfg.seed * 131 + day)() >= cfg.gate.chance) return;
    const goal = ctx.map.objects.find(o => o.type === 'goal');
    if (!goal) return;
    const ts = ctx.map.tileSize;
    const gx = (goal.x + goal.w / 2) * ts;
    const gy = (goal.y + goal.h / 2) * ts;
    if (!ctx.players.some(p => Math.hypot(p.x - gx, p.y - gy) <= cfg.gate.radius * ts)) return;
    ctx.chase.lvl.set(cfg.gate.level, 'school-gate');
    ctx.events.emit('day:gate', { day });
    this.toast('day.gate');
  }

  onTick({ phase }) {
    if (!this.story || phase !== 'evening') return;
    if (this.ctx.day.time === this.cfg.bedtimeWarn) this.toast('day.bedtimeSoon');
  }

  // Where the arrow points on the way home, or null (in the morning and at school it points at school).
  objective() {
    const { ctx } = this;
    if (!this.story || !['afternoon', 'evening'].includes(ctx.day.phase) || ctx.world.id !== 'town') return null;
    const door = ctx.map.objects.find(o => o.id === 'door-home');
    return door ? { id: 'go-home', map: 'town', x: door.x, y: door.y, text: 'day.goHome', title: '' } : null;
  }

  onEnd({ phase, day }) {
    if (!this.story || phase !== 'evening') return;
    const { ctx } = this;
    const atHome = ctx.world.id === 'home';
    ctx.events.emit('day:bedtime', { day, atHome });
    const money = ctx.t('hud.money', { v: (ctx.state.shared.money / 100).toFixed(2).replace('.', ctx.i18n.lang === 'de' ? ',' : '.') });
    const lines = [ctx.t(atHome ? 'day.bedtime.home' : 'day.bedtime.away'), ctx.t('day.bedtime.summary', { day, money })];
    for (const p of ctx.players) {
      const n = ctx.state.players[p.index].grades.entries.filter(e => e.day === day).length;
      lines.push(ctx.t('day.bedtime.lessons', { who: p.character?.name ?? ctx.t('menu.slot.player', { n: p.index + 1 }), n }));
    }
    const done = () => this.reportCard(day);
    if (!ctx.screens) { done(); return; }
    ctx.screens.push(new MessageScreen(this.scene.scene.get('UI'), ctx, ctx.screens, { title: ctx.t('day.bedtime.title'), lines, inputCfg: this.inputCfg, onDone: done }));
  }

  // The school year (one game day) is over: every kid gets a Zeugnis, whose consequence is settled once (promoted, or the
  // comeback bonus of a repeated year); when somebody is promoted the end of class 3 is told once, then the morning starts.
  reportCard(day) {
    const { ctx } = this;
    if (!ctx.grades) { this.goToBed(); return; }
    const cards = ctx.players.map(p => ({ player: p.index, ...ctx.grades.settleYear(p.index, day, ctx.i18n.lang) }));
    ctx.events.emit('day:zeugnis', { day, promoted: cards.filter(c => c.promotion.promoted).map(c => c.player), repeated: cards.filter(c => !c.promotion.promoted).map(c => c.player) });
    const finish = () => this.endOfClass(cards);
    if (!ctx.screens) { finish(); return; }
    ctx.screens.push(new ReportCardScreen(this.scene.scene.get('UI'), ctx, ctx.screens, { cards, day, inputCfg: this.inputCfg, onDone: finish }));
  }

  // Somebody finished class 3: a message says that class 4 is coming and the game goes on; shown once per save.
  endOfClass(cards) {
    const { ctx } = this;
    if (!cards.some(c => c.promotion.promoted) || ctx.state.shared.flags.endShown || !ctx.screens) { this.goToBed(); return; }
    ctx.state.dispatch('flags.set', { key: 'endShown' });
    ctx.events.emit('day:end-of-class', { day: cards[0].day });
    ctx.screens.push(new MessageScreen(this.scene.scene.get('UI'), ctx, ctx.screens, { title: ctx.t('zeugnis.end.title'), lines: [ctx.t('zeugnis.end.body')], inputCfg: this.inputCfg, onDone: () => this.goToBed() }));
  }

  // The next morning starts at home: a kid who is out is brought back, on foot, and the chase is quiet.
  goToBed() {
    const { ctx } = this;
    ctx.chase.reset?.();
    for (const p of ctx.players) for (const ride of this.scene.mountables) if (ride.isMounted(p.index)) ride.dismount(p);
    if (ctx.world.id !== 'home') ctx.world.load('home', 'from-town');
    ctx.events.emit('day:morning', { day: ctx.day.day });
  }
}
