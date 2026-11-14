import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import { GameState, createDefaultState } from '../state/GameState.js';
import { SaveSlots } from '../state/SaveSlots.js';
import { migrate } from '../state/migrations.js';
import { gridOf, reachable, validateObject } from '../services/worldLogic.js';
import { streetCatalog, safeStreetPosition, validStreetRecords } from '../vehicles/streetLogic.js';
import { buildRoute, routeAt, easeHeading } from '../vehicles/routeLogic.js';
import { trafficFootprintFree, gapAhead, stopSpeed, approachSpeed, classifyHit } from '../vehicles/trafficLogic.js';
import { PLAY_KINDS, playLayout, validatePlay } from '../entities/playLogic.js';
import { Pathfinder } from '../ai/Pathfinding.js';
import { StreetRides } from '../entities/StreetRides.js';
const read = p => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const index = read('data/maps/index.json');
const maps = Object.fromEntries(index.maps.map(m=>[m.id,read(`data/maps/${m.file}`)]));
const surfaces = read('data/surfaces.json'), town=maps.town, baseline=read('scripts/fixtures/original-town.json');
const expansion = read('data/world-expansion.json'), catalog=read('data/object-types.json');
const cfg = {...read('data/state.json'),worldMaps:maps,worldSurfaces:surfaces,streetObjects:streetCatalog(maps)};
const events=new EventEmitter(), state=new GameState(events,cfg);
state.dispatch('coop.set',{on:true});
const original=structuredClone(state.data);
const ids=Object.keys(cfg.streetObjects);
assert.equal(new Set(ids.map(id=>cfg.streetObjects[id].kind)).size,4);
for(const id of ids) {
  const o=cfg.streetObjects[id], payload={id,player:0,map:o.map,x:o.x,y:o.y};
  assert.ok(state.dispatch('street.claim',payload));
  assert.equal(state.dispatch('street.claim',{...payload,player:1}),false,'atomic contention');
  assert.deepEqual(state.shared.ownedVehicles,['foot'],'a claim never unlocks the type');
  assert.equal(state.dispatch('street.return',{...payload,x:NaN}),false);
  assert.equal(state.dispatch('street.locate',{...payload,player:1,drop:true}),false);
  assert.equal(state.dispatch('street.locate',{...payload,map:'unknown',drop:true}),false);
  assert.ok(state.dispatch('street.locate',{...payload,map:'school',x:264,y:216}));
  assert.equal(state.dispatch('street.return',{...payload,map:'school'}),false);
  assert.ok(state.dispatch('street.locate',{...payload,drop:true}));
  assert.ok(state.dispatch('street.claim',{...payload,player:1}));
  assert.ok(state.dispatch('street.return',{...payload,player:1}));
}
assert.equal(state.dispatch('street.claim',{id:'town:board1',player:0,map:'town',x:168,y:840}),false,'ordinary display is not claimable');
assert.equal(state.dispatch('street.claim',{id:'car',player:0,map:'town',x:168,y:840}),false);
const id=ids[0], o=cfg.streetObjects[id], payload={id,player:0,map:o.map,x:o.x,y:o.y};
state.dispatch('street.claim',payload);
assert.equal(state.dispatch('street.claim',{id:ids[1],player:0,map:cfg.streetObjects[ids[1]].map,x:cfg.streetObjects[ids[1]].x,y:cfg.streetObjects[ids[1]].y}),false,'one object per rider');
const store=new Map(), storage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)};
const saves=new SaveSlots(state,events,storage);
assert.ok(saves.save(1)); assert.ok(saves.load(1));
assert.equal(state.shared.streetRides[id].status,'carried');
assert.ok(state.dispatch('street.restore'));
assert.equal(state.shared.streetRides[id].status,'dropped','Continue normalizes carried objects without mounting through morning');
assert.ok(validStreetRecords(state.shared.streetRides,cfg,state.players.length));
const legacy={...original,v:6,shared:{...original.shared}}; delete legacy.shared.streetRides;
const migrated=migrate(legacy,cfg,7);
assert.deepEqual(migrated.shared,{...original.shared,streetRides:{}});
assert.deepEqual(migrated.players,original.players,'legacy progress survives');
const bad=structuredClone(state.data); bad.shared.streetRides[id].x=-10;
store.set('schulweg.save.2',JSON.stringify(bad));
assert.equal(saves.load(2),false); assert.ok(saves.hasBackup(2),'corruption preserved in backup');
assert.equal(safeStreetPosition(cfg,'town',0,0),false);
// A traffic slide may end closer to a wall than the saved street object's clearance.
assert.equal(safeStreetPosition(cfg,'town',163.18,953.30),false);
const flung={streetId:id,scene:{},x:163.18,y:953.30,setPosition(x,y){this.x=x;this.y=y;}};
const street={ctx:{state,world:{id:'town'},map:town,players:[]},services:[{parked:[flung],riders:[]}],safe:StreetRides.prototype.safe};
StreetRides.prototype.snapshot.call(street);
assert.ok(safeStreetPosition(cfg,'town',flung.x,flung.y));
assert.equal(state.shared.streetRides[id].x,flung.x);
assert.equal(state.shared.streetRides[id].y,flung.y);
assert.ok(state.dispatch('street.claim',{id,player:0,map:'town',x:flung.x,y:flung.y}),'a normalized flung object remains claimable');
assert.ok(saves.save(1));assert.ok(saves.load(1));
assert.equal(state.shared.streetRides[id].x,flung.x,'Continue preserves the actual normalized sprite location');
// Actual flood fill relative to the immutable original grid, never a resized bounding-box proxy.
const oldArea=reachable(baseline,surfaces,7,51).reduce((a,b)=>a+b,0);
assert.equal(oldArea,4204); assert.equal(expansion.baselineReachable,oldArea);
const seen=reachable(town,surfaces,7,51), area=seen.reduce((a,b)=>a+b,0);
assert.ok(area>=oldArea*2,`${area} < ${oldArea*2}`);
for(let y=0;y<baseline.rows.length;y++) for(let x=0;x<baseline.rows[0].length;x++) {
  if(!expansion.exits.some(e=>x>=e.x&&x<e.x+e.w&&y>=e.y&&y<e.y+e.h)) assert.equal(town.rows[y][x],baseline.rows[y][x],`old tile ${x},${y}`);
}
for(const object of baseline.objects) assert.deepEqual(town.objects.find(o=>o.id===object.id&&o.type===object.type),object.type==='npc-node'?{...object,links:town.objects.find(o=>o.id===object.id).links}:object,`old object ${object.id}`);
const {W,walkable}=gridOf(town,surfaces);
for(const n of expansion.neighborhoods) {
  let count=0;
  for(let y=n.y;y<n.y+n.h;y++)for(let x=n.x;x<n.x+n.w;x++)count+=seen[y*W+x];
  assert.ok(count>1000,`${n.id} reachable area`);
}
// Bike-sized connectivity through both new places and every fixed crossing.
const clear=(x,y)=>walkable(x,y)&&walkable(x+1,y)&&walkable(x,y+1)&&walkable(x+1,y+1);
const queue=[[7,51]], bikeSeen=new Set(['7,51']);
for(let q=0;q<queue.length;q++)for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
  const [x,y]=[queue[q][0]+dx,queue[q][1]+dy], key=`${x},${y}`;
  if(!bikeSeen.has(key)&&clear(x,y)){bikeSeen.add(key);queue.push([x,y]);}
}
for(const p of [[102,23],[131,23],[131,40],[115,52],[86,85],[118,85],[12,103]])assert.ok(bikeSeen.has(p.join(',')),`bike route to ${p}`);
// Queued A* yields without truncating long paths; synchronous callers use independent scratch.
const navCfg = {...read('data/chase.json').nav, nodesPerFrame: 16};
const nav = new Pathfinder(town, surfaces, navCfg), expected = new Int32Array(navCfg.maxPath);
const origin = {x: 7.5 * town.tileSize, y: 51.5 * town.tileSize};
const goal = {x: 118.5 * town.tileSize, y: 85.5 * town.tileSize};
const expectedLength = nav.findPath(origin.x, origin.y, goal.x, goal.y, expected);
assert.ok(expectedLength > 0);
const owner = {...origin, goalX: goal.x, goalY: goal.y, active: true, path: new Int32Array(navCfg.maxPath), receivePath(length) {this.pathLen = length;}};
nav.request(owner);
let frames = 0;
while(owner.pathPending && frames++ < 2000) {
  nav.update();
  assert.ok(nav.expandedLastUpdate <= 16, 'bounded queued node work');
  nav.findPath(origin.x, origin.y, origin.x, origin.y, new Int32Array(1));
}
assert.ok(frames > 1 && !owner.pathPending, 'large searches resume and eventually finish');
assert.equal(owner.pathLen, expectedLength);
assert.deepEqual(owner.path.slice(0, owner.pathLen), expected.slice(0, expectedLength));
nav.request(owner); nav.update(); nav.cancel(owner);
assert.equal(owner.pathPending, false, 'released bullies cannot receive a stale resumed path');
nav.request(owner); nav.cancel(owner); nav.update();
assert.equal(nav.qCount, 0, 'cancelled queued requests drain safely');
nav.request(owner); nav.update(); nav.setMap(maps.school, surfaces);
assert.equal(owner.pathPending, false, 'map changes cancel outstanding searches');
// Traffic uses the existing route engine: validate oriented hulls throughout every circuit and eased turn.
const grab=read('data/grab.json'), traffic=read('data/traffic.json'), routes=read('data/routes.json').routes;
assert.ok(routes.reduce((n,r)=>n+r.count,0)<=grab.maxTargets);
assert.deepEqual(new Set(routes.map(r=>r.kind)),new Set(['bus','car','van','tram']));
const solid=(x,y)=>!walkable(Math.floor(x/16),Math.floor(y/16));
for(const def of routes) {
  assert.ok(maps[def.map]&&grab.targets[def.kind]&&traffic.kinds[def.kind]&&def.speed>0&&def.count>0);
  const route=buildRoute(def.points,16), pt={};
  let h=0;
  for(let s=0;s<route.total*2;s+=def.speed/60) {
    routeAt(route,s,pt);
    h=s===0?Math.atan2(pt.ty,pt.tx):easeHeading(h,Math.atan2(pt.ty,pt.tx),grab.targets[def.kind].turnRate*Math.PI/180/60);
    const k=grab.targets[def.kind];
    assert.ok(trafficFootprintFree(pt.x,pt.y,h,k.length,k.width,solid),`${def.id} hull clips solid at ${pt.x},${pt.y}`);
  }
}
const yl=grab.yield;
assert.ok(gapAhead(100,100,0,34,18,150,100,5,yl.band,yl.look)<Infinity&&gapAhead(100,100,0,34,18,50,100,5,yl.band,yl.look)===Infinity,'only what is ahead in the lane is in the way');
assert.ok(stopSpeed(60,yl.comfort)>0&&stopSpeed(0,yl.comfort)===0&&stopSpeed(-5,yl.comfort)===0);
assert.ok(approachSpeed(100,0,yl.accel,yl.brake,0.1)>0&&approachSpeed(0,100,yl.accel,yl.brake,0.1)<100,'speed eases, it never jumps');
assert.equal(classifyHit(100,100,0,34,18,null,traffic.kinds.car,115,100,5),'front','cars have no safe grab zone');
const play=read('data/play-objects.json');
assert.ok(validatePlay(play));assert.deepEqual(new Set(town.objects.filter(o=>o.type==='play').map(o=>o.kind)),new Set(PLAY_KINDS));
for(const object of town.objects.filter(o=>o.type==='play')) {
  assert.deepEqual(validateObject(object,catalog,{catalog,surfaces},'town'),[]);
  const layout=playLayout(object,play.kinds[object.kind],16);
  assert.equal(layout.length,play.kinds[object.kind].parts);
  for(const p of layout)assert.equal(!!surfaces[town.legend[town.rows[Math.floor(p.y/16)][Math.floor(p.x/16)]]].solid,object.kind==='floater');
}
assert.throws(()=>playLayout({kind:'unknown'},null,16));
assert.ok(validateObject({type:'play',id:'bad',x:1,y:1,kind:'unknown'},catalog,{},'town').length);
console.log(`open-world checks passed: ${oldArea} -> ${area} reachable tiles (${(area/oldArea).toFixed(2)}x), four object-scoped rides, migration, routes/yielding and eight play types`);
