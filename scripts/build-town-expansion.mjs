// Reproducible content build; the original town is a pinned regression fixture, not a new baseline.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { reachable } from '../services/worldLogic.js';
const read = p => JSON.parse(readFileSync(p, 'utf8'));
const compactObject = o => `{ ${Object.entries(o).map(([key,value]) => `${JSON.stringify(key)}:${JSON.stringify(value)}`).join(', ')} }`;
const write = (p, d) => {
  if (existsSync(p) && JSON.stringify(read(p)) === JSON.stringify(d)) return;
  const text = p.endsWith('town.json') ? '{\n' + Object.entries(d).map(([key,value]) => {
    const contents = Array.isArray(value)
      ? '[\n' + value.map(item => '    ' + (typeof item === 'object' ? compactObject(item) : JSON.stringify(item))).join(',\n') + '\n  ]'
      : typeof value === 'object' ? compactObject(value) : JSON.stringify(value);
    return `  ${JSON.stringify(key)}: ${contents}`;
  }).join(',\n') + '\n}' : JSON.stringify(d, null, 2);
  writeFileSync(p, text + '\n');
};
const fixture = 'scripts\\fixtures\\original-town.json';
if (!existsSync(fixture)) {
  mkdirSync('scripts\\fixtures', { recursive: true });
  write(fixture, JSON.parse(execFileSync('git', ['show', '599f3c1efa3316cd434cbf61f69693cb2bf8693d:data/maps/town.json'], { encoding: 'utf8' })));
}
const base = read(fixture);
const map = structuredClone(base);
const W = 160, H = 112;
const grid = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => x === 0 || y === 0 || x === W - 1 || y === H - 1 ? '#' : 'G'));
base.rows.forEach((row, y) => [...row].forEach((ch, x) => { grid[y][x] = ch; }));
const rect = (x, y, w, h, c) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) grid[j][i] = c; };
// Riverside: waterfront, two bridges, promenade loop, orchard and boating lawn.
rect(98, 8, 58, 8, 'A'); rect(98, 48, 58, 8, 'A');
rect(98, 8, 8, 48, 'A'); rect(148, 8, 8, 48, 'A');
rect(130, 17, 4, 30, 'W');
rect(106, 22, 42, 3, 'p'); rect(106, 39, 42, 3, 'p');
rect(109, 18, 16, 28, 'S'); rect(136, 18, 9, 28, 'p');
rect(110, 3, 14, 4, '#'); rect(137, 3, 10, 4, '#');
rect(111, 57, 12, 4, '#'); rect(136, 57, 10, 4, '#');
for (const x of [109, 117, 125, 138, 145]) for (const y of [62, 65]) rect(x, y, 1, 1, 'T');
// Keep old coordinates; only open the old outer wall at generous connector corridors.
rect(95, 31, 3, 4, 'p'); rect(95, 52, 3, 8, 'S');
rect(96, 31, 2, 4, 'p'); rect(96, 52, 10, 8, 'S');
// Workshop market: a perimeter road, courtyards, covered-market blocks and alleys.
rect(8, 68, 145, 8, 'A'); rect(8, 99, 145, 8, 'A');
rect(8, 68, 8, 39, 'A'); rect(82, 68, 8, 39, 'A'); rect(145, 68, 8, 39, 'A');
rect(23, 63, 6, 5, 'p'); rect(80, 63, 8, 5, 'p');
rect(18, 83, 127, 4, 'C'); rect(48, 76, 5, 23, 'p'); rect(116, 76, 5, 23, 'p');
for (const [x, y, w, h] of [[20,78,22,4],[58,78,18,4],[94,78,16,4],[125,78,14,4],[20,90,22,7],[58,90,18,7],[94,90,16,7],[125,90,14,7]]) rect(x,y,w,h,'#');
rect(25, 87, 14, 3, 'S'); rect(94, 87, 16, 3, 'S');
rect(98, 56, 8, 12, 'p'); rect(145, 56, 8, 12, 'p');
map.rows = grid.map(r => r.join(''));
const add = (type, id, x, y, extra = {}) => map.objects.push({ type, id, x, y, ...extra });
for (const [kind, x, y, id] of [['bike',100,59,'riverside-bike'],['skateboard',112,26,'riverside-board'],['rollerblades',138,26,'riverside-blades'],['scooter',31,87,'market-scooter'],
  ['bike',101,87,'market-bike'],['skateboard',55,87,'market-board'],['rollerblades',122,87,'market-blades'],['scooter',112,43,'riverside-scooter']]) add(kind,id,x,y,{ street:true });
for (const [kind,x,y,id] of [['swing',19,42,'old-swing'],['sign',34,51,'old-swing-sign'],['kite',112,29,'riverside-kite'],
  ['flag',120,29,'riverside-flag'],['bridge',109,43,'riverside-rope-bridge'],['floater',128,32,'canal-floater'],
  ['cart',25,87,'market-slope-cart'],['dominoes',95,87,'market-dominoes']]) add('play',id,x,y,{kind});
for (const [x,y,id,key,board] of [[98,32,'riverside-sign','world.riverside','UFER'],[18,68,'market-sign','world.market','MARKT'],[110,42,'bridge-sign','world.bridge','BRUECKE']]) add('sign',id,x,y,{text:key,board});
add('tram-stop','riverside-tram-stop',108,47);
add('tram-stop','market-tram-stop',90,98);
add('flag','flag-market',54,87,{color:'#f5bd58'});
for (const [x,y,id] of [[115,19,'riverside-bench'],[137,39,'canal-bench'],[40,87,'market-bench']]) add('bench',id,x,y,{w:3,h:1});
add('shop','market-workshop',55,84,{w:3,h:2,shopId:'vehicles'});
add('bakery','market-bakery',35,84,{w:3,h:2});
add('pfand-machine','market-recycling',93,88);
// Crowd loop follows clear sidewalks and bridges; links are bidirectional.
const nodes = [[96,52],[102,52],[102,32],[102,23],[115,23],[137,23],[151,23],[151,52],[137,52],[115,52],
  [102,59],[102,65],[102,71],[86,71],[86,85],[102,85],[118,85],[149,85],[149,103],[86,103],[52,103],[12,103],[12,85],[12,71],[52,71]];
for (let i=0;i<nodes.length;i++) add('npc-node',`n-exp-${i}`,...nodes[i],{district:i<12?'riverside':'market',links:[]});
const byId = new Map(map.objects.filter(o=>o.type==='npc-node').map(o=>[o.id,o]));
const link = (a,b) => { (byId.get(a) ?? map.objects.find(o=>o.id===a)).links.push(b); (byId.get(b) ?? map.objects.find(o=>o.id===b)).links.push(a); };
for (const [a,b] of [[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,7],[7,8],[8,9],[9,1],[1,10],[10,11],[11,12],[12,13],[13,14],[14,15],[15,16],[16,17],[17,18],[18,19],[19,20],[20,21],[21,22],[22,23],[23,24],[24,13],[14,19],[23,13]]) link(`n-exp-${a}`,`n-exp-${b}`);
// Existing west sidewalk -> east extension, and home sidewalk -> southern market.
add('npc-node','n-exp-connector',94,52,{district:'road',links:[]});
link('n-road-20','n-exp-connector'); link('n-exp-connector','n-exp-0');
add('npc-node','n-exp-south',24,65,{district:'market',links:[]});
link('n-road-12','n-exp-south'); link('n-exp-south','n-exp-23');
for (let i=0;i<nodes.length;i++) add('npc-spawn',`sp-exp-${i}`,...nodes[i],{district:i<12?'riverside':'market',role:i%5===0?'stand':'walk',node:`n-exp-${i}`,face:1});
write('data\\maps\\town.json',map);
write('data\\world-expansion.json',{baselineRevision:'599f3c1efa3316cd434cbf61f69693cb2bf8693d',baselineReachable:reachable(base,read('data\\surfaces.json'),7,51).reduce((a,b)=>a+b,0),neighborhoods:[{id:'riverside',x:98,y:17,w:59,h:45},{id:'market',x:8,y:68,w:145,h:39}],exits:[{x:95,y:31,w:1,h:4},{x:95,y:52,w:1,h:8},{x:23,y:63,w:6,h:1},{x:80,y:63,w:8,h:1}]});
const catalog = read('data\\object-types.json');
for (const id of ['bike','skateboard','rollerblades','scooter']) catalog.types[id].fields.street = {type:'bool',doc:'An unattended identifiable street ride; object-scoped temporary use, not ownership.'};
catalog.types.play = {shape:'point',inWall:false,reach:true,fields:{kind:{type:'enum',values:['swing','sign','bridge','kite','flag','cart','dominoes','floater'],required:true}}};
write('data\\object-types.json',catalog);
const grab = read('data\\grab.json');
grab.maxTargets = 12;
grab.yield = {ahead:38,recoverAfter:3,retryEvery:1,recoveryProbes:16,recoveryDistance:160};
grab.targets.car = {texture:'car',origin:[0.5,0.5],turnRate:220,length:34,width:18};
grab.targets.van = {texture:'van',origin:[0.5,0.5],turnRate:200,length:42,width:20};
grab.targets.tram = {texture:'tram',origin:[0.5,0.5],turnRate:180,length:72,width:22,zone:{length:44,reach:8,width:30}};
write('data\\grab.json',grab);
const routes=read('data\\routes.json');
routes.routes=routes.routes.filter(r=>r.id==='main-road');
const roundedLoop=(x0,y0,x1,y1,r=3) => {
  const points=[];
  for(const [cx,cy,start] of [[x1-r,y0+r,-Math.PI/2],[x1-r,y1-r,0],[x0+r,y1-r,Math.PI/2],[x0+r,y0+r,Math.PI]]) {
    for(let i=0;i<=8;i++) { const a=start+i*Math.PI/16; points.push([+(cx+Math.cos(a)*r).toFixed(4),+(cy+Math.sin(a)*r).toFixed(4)]); }
  }
  return points;
};
routes.routes.push({id:'main-road-cars',map:'town',kind:'car',count:4,speed:135,phase:0.13,points:routes.routes[0].points});
routes.routes.push({id:'riverside-tram',map:'town',kind:'tram',count:1,speed:125,points:roundedLoop(102,12,152,52)});
routes.routes.push({id:'riverside-cars',map:'town',kind:'car',count:2,speed:118,phase:0.25,points:roundedLoop(102,12,152,52)});
routes.routes.push({id:'market-delivery',map:'town',kind:'van',count:3,speed:110,points:roundedLoop(12,72,149,103)});
write('data\\routes.json',routes);
const traffic=read('data\\traffic.json');
for(const kind of ['car','van','tram']) traffic.kinds[kind]={frontReach:3,sideReach:2,frontDepth:8};
write('data\\traffic.json',traffic);
const translations = {
  'world.interact.keyboard':['F :','F :'],
  'world.interact.keyboardP2':['Enter :','Enter :'],
  'world.interact.gamepad':['Y :','Y :'],
  'world.interact.touch':['Hand :','Hand :'],
  'street.unavailable':['Dieses Fahrzeug ist schon unterwegs.','That ride is already in use.'],
  'street.taken':['Nur geliehen! Absteigen lässt es hier liegen; am Ursprung kannst du es zurückgeben.','Borrowed, not owned! Dismount to leave it here; return it at its origin.'],
  'street.witness':['Hey! Das ist nicht deins! Bring es bitte zurück.','Hey! That is not yours! Please bring it back.'],
  'street.returned':['Danke! Wieder an seinem Platz.','Thanks! Back where it belongs.'],
  'street.dropped':['Hier abgestellt – genau dieses Fahrzeug kannst du wieder nehmen.','Left here — you can pick up this same ride again.'],
  'street.take':['Straßenfahrzeug nehmen','Take street ride'],'street.drop':['Hier abstellen','Leave here'],'street.return':['Am Ursprung zurückgeben','Return to origin'],
  'world.riverside':['Uferfreizeit: Promenade, zwei Kanalbrücken, Drachenwiese und Seilspielbrücke.','Riverside recreation: promenade, two canal crossings, kite lawn and rope play bridge.'],
  'world.market':['Werkstattmarkt: Höfe, Abkürzungen, Rollwagen und Kistendominos.','Workshop market: courtyards, shortcuts, slope cart and crate dominoes.'],
  'world.bridge':['Die Seilspielbrücke wackelt! Die festen Kanalbrücken bleiben sicher befahrbar.','The rope play bridge wobbles! The fixed canal crossings remain safe to ride.']
};
const names = {swing:['Schaukel anschubsen','Push swing'],sign:['Schild wackeln lassen','Wobble sign'],bridge:['Seilbrücke schwingen','Sway rope bridge'],kite:['Drachen steigen lassen','Launch kite'],flag:['Fahne flattern lassen','Flutter flag'],cart:['Rollwagen anschieben','Push slope cart'],dominoes:['Kistendominos starten','Start crate dominoes'],floater:['Kanalboot anstupsen','Nudge canal boat']};
for (const [kind,name] of Object.entries(names)) {
  translations[`play.name.${kind}`] = name;
  translations[`play.feedback.${kind}`] = [`${name[0]} – nochmal? Einfach erneut drücken!`,`${name[1]} — again? Press once more!`];
}
for (const [i,lang] of ['de','en'].entries()) {
  const d=read(`i18n\\${lang}.json`);
  for(const [key,pair] of Object.entries(translations)) d[key]=pair[i];
  write(`i18n\\${lang}.json`,d);
}
console.log(`Expanded town ${W}x${H}; pinned baseline ${read('data\\world-expansion.json').baselineReachable} reachable tiles`);
