// Balance pass (story 14.4): the numbers that decide how the game feels, kept inside ranges that were chosen on purpose.
// Economy: what a kid can earn in a day against the shop prices (the first ride in about a week of ordinary play, never in a day). Progress: levels
// need days, not hours. Chase: a kid on foot can outrun a foot bully by sprinting, a kid on a bike can outrun every bully, and the strongest
// bully is never faster than the best ride. Rewards stay small enough that no single activity pays a ride.
// Run: node scripts/check-balance.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { reward, stagesOf, questionsIn } from '../services/activityLogic.js';
import { pocketMoney } from '../services/activityLogic.js';

const load = p => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const act = load('data/activities.json');
const shop = load('data/shop.json');
const veh = load('data/vehicles.json');
const chase = load('data/chase.json');
const state = load('data/state.json');

// ---- economy: a day of play at a given accuracy
const perfect = id => { const v = act[id].variants ? 'en' : 'de'; const n = questionsIn(stagesOf(act, id, v)); return { cents: reward(act, id, v, n, n).cents, n }; };
const atAccuracy = (id, acc) => { const v = act[id].variants ? 'en' : 'de'; const n = questionsIn(stagesOf(act, id, v)); return reward(act, id, v, Math.round(n * acc), n).cents; };
const daily = acc => {
  const times = id => (act[id].perSign ? 1 : act[id].perDay);
  let sum = 0;
  for (const id of ['pfand', 'bakery', 'route']) sum += atAccuracy(id, acc) * times(id);
  for (const id of Object.keys(act).filter(k => act[k]?.chore)) sum += atAccuracy(id, acc);
  return sum + pocketMoney(act, Object.keys(act).filter(k => act[k]?.chore).length); // all chores done: the full pocket money
};
const price = id => shop.items.find(i => i.id === id).price;
const cheapestRide = Math.min(...shop.items.filter(i => i.type === 'vehicle').map(i => i.price));
const dearestRide = Math.max(...shop.items.filter(i => i.type === 'vehicle').map(i => i.price));
const perDayFull = daily(1);
const perDayHalf = daily(0.5);
assert.ok(perDayFull < cheapestRide, `a perfect day (${perDayFull}) never pays a ride (${cheapestRide}) by itself`);
const daysCheap = cheapestRide / perDayHalf;
assert.ok(daysCheap >= 3 && daysCheap <= 12, `the first ride takes ${daysCheap.toFixed(1)} days at half the accuracy (3 to 12 wanted)`);
assert.ok(dearestRide / perDayFull >= 4, `even a perfect kid needs days for the dearest ride (${(dearestRide / perDayFull).toFixed(1)})`);
for (const id of ['pfand', 'bakery', 'route']) assert.ok(perfect(id).cents <= cheapestRide / 10, `${id}: one run pays at most a tenth of a ride`);
assert.ok(price('snack-roll') < perDayHalf / 4 && price('ticket-day') <= perDayHalf / 2, 'snacks and the day ticket are everyday money');

// ---- progress: levels take days
const xpPerDay = ['pfand', 'bakery', 'route'].reduce((n, id) => { const a = act[id]; const q = questionsIn(stagesOf(act, id, 'de')); return n + q * a.xpPerCorrect * (a.perSign ? 1 : a.perDay); }, 0);
const levelDays = state.xpPerLevel / xpPerDay;
assert.ok(levelDays >= 0.15, `activities alone do not level up several times a day (${xpPerDay} xp a day, ${levelDays.toFixed(2)} days a level)`);
assert.ok(state.maxLevel * state.xpPerLevel > xpPerDay * 10, 'the top level is more than ten days of activities away');

// ---- chase: speeds
const p = veh.foot;
const sprint = p.maxSpeed * (p.stamina.sprintMult ?? 1);
assert.ok(sprint > veh['bully-foot'].maxSpeed * 1.1, 'sprinting beats a foot bully');
assert.ok(p.maxSpeed < veh['bully-foot'].maxSpeed, 'walking does not (bullies are a threat)');
for (const k of ['bully-foot', 'bully-bike', 'bully-scooter', 'bully-boss']) assert.ok(veh.bike.maxSpeed >= veh[k].maxSpeed, `a kid on a bike can outrun ${k}`);
assert.ok(veh['bully-scooter'].maxSpeed > veh['bully-bike'].maxSpeed && veh['bully-bike'].maxSpeed > veh['bully-foot'].maxSpeed, 'scooter > bike > foot');
assert.ok(veh['bully-boss'].maxSpeed <= veh['bully-bike'].maxSpeed, 'the boss is strong, not the fastest');
assert.ok(chase.caught.lossCents <= cheapestRide / 20, 'being caught costs a little, never a ride');
assert.ok(chase.level.spawnByLevel.length === 6 && chase.level.turfSecondsPerLevel >= 6, 'the chase takes time to build up');
console.log(`balance ok: ${perDayHalf}c a day at half accuracy (${daysCheap.toFixed(1)} days to the first ride), ${perDayFull}c at best; foot sprint ${sprint} vs bully ${veh['bully-foot'].maxSpeed}`);
