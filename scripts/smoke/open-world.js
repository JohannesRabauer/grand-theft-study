import { createDefaultState } from '../../state/GameState.js';
import { MASK } from '../../physics/categories.js';

export const openWorld = {
  name: 'openWorld',
  run(game, assert, env) {
    const { step, until } = env;
    let gs = game.scene.getScene('Game'), ctx = gs.ctx;
    ctx.state.replace(createDefaultState(ctx.state.cfg));
    ctx.state.dispatch('coop.set', { on: true });
    gs.scene.restart({ players: [{ character: 'helena', vehicle: 'foot' }, { character: 'kilian', vehicle: 'foot' }] });
    step(4);
    gs = game.scene.getScene('Game'); ctx = gs.ctx;
    ctx.input.update = () => {};
    ctx.world.load('town', 'from-home');
    ctx.traffic.enabled = false;
    assert('expanded ground uses bounded texture chunks with complete map coverage',
      ctx.world.ground.list.every(rt => rt.texture.source[0].width <= 4096 && rt.texture.source[0].height <= 4096)
      && ctx.world.ground.list.reduce((area, rt) => area + rt.width * rt.height, 0)
        === ctx.map.rows.length * ctx.map.rows[0].length * (ctx.map.tileSize * ctx.res.scale) ** 2);
    const foot = () => { for (const p of ctx.players) for (const s of gs.mountables) if (s.isMounted(p.index)) s.dismount(p); };
    const at = (x, y) => {
      for (const p of ctx.players) { p.teleport(x, y); ctx.input.intents[p.index].move.x = ctx.input.intents[p.index].move.y = 0; }
      ctx.chase.reset(); gs.snapCamera(); step(3); ctx.props.cull();
    };
    const press = (index = 0) => { ctx.input.intents[index].interact = true; step(1); ctx.input.intents[index].interact = false; step(2); };
    const records = () => ctx.state.shared.streetRides;
    const sprites = id => gs.mountables.flatMap(s => s.parked).filter(i => i.streetId === id);
    const log = [];
    for (const e of ['ui:toast', 'street:witnessed', 'play:used']) ctx.events.on(e, data => log.push([e, data]));
    foot();
    ctx.state.replace({ ...ctx.state.data, shared: { ...ctx.state.shared, ownedVehicles: ['foot'] } });
    for (const kind of ['bike', 'skateboard', 'rollerblades', 'scooter']) {
      const svc = gs.mountables.find(s => s.id === kind);
      const item = svc.parked.find(i => i.streetId && i.visible);
      const id = item.streetId;
      at(item.x, item.y);
      // A real nearby crowd member witnesses the first claim.
      const witness = ctx.crowd.list[0];
      if (kind === 'bike') {
        witness.active = true;
        gs.matter.body.setPosition(witness.body, { x: item.x + 30, y: item.y });
      }
      ctx.input.intents[0].interact = ctx.input.intents[1].interact = true;
      step(1);
      ctx.input.intents[0].interact = ctx.input.intents[1].interact = false;
      assert(`${kind}: fresh contested interact claims one identifiable unowned street object`, ctx.players[0].vehicle === kind && ctx.players[1].vehicle === 'foot' && svc.riders[0].mounted === item && records()[id]?.player === 0 && sprites(id).length === 1);
      assert(`${kind}: the claim grants no family unlock, and contention explains unavailable`, ctx.state.shared.ownedVehicles.join() === 'foot' && log.some(([e,d])=>e==='ui:toast'&&d.key==='street.unavailable'));
      if (kind === 'bike') assert('a nearby witness gives comic localized disapproval and existing trouble feedback', log.some(([e])=>e==='street:witnessed') && ctx.chase.level > 0);
      ctx.chase.reset();
      // Carried identity survives both interior travel and return without an origin clone.
      ctx.world.load('school', 'from-town'); step(2);
      assert(`${kind}: same hidden sprite travels to school`, svc.riders[0].mounted === item && records()[id].map === 'school' && sprites(id).length === 1);
      svc.dismount(ctx.players[0]);
      const dropped = { ...records()[id] };
      ctx.world.load('town', 'from-school'); step(2);
      assert(`${kind}: dropping in school does not respawn an origin copy`, sprites(id).length === 0 && records()[id].status === 'dropped' && records()[id].map === 'school');
      ctx.world.load('school', 'from-town'); step(2);
      const restored = sprites(id)[0];
      assert(`${kind}: return to school restores one object at its actual dropped location`, sprites(id).length === 1 && Math.abs(restored.x - dropped.x) < 1 && Math.abs(restored.y - dropped.y) < 1);
      at(restored.x, restored.y);
      press();
      ctx.world.load('town', 'from-school'); step(2);
      const origin = ctx.state.cfg.streetObjects[id];
      at(origin.x, origin.y);
      ctx.input.type = 'gamepad'; gs.street.update();
      assert(`${kind}: return prompt is device-aware and explicit at the origin`, gs.street.hints[0].text.includes(ctx.t('world.interact.gamepad')) && gs.street.hints[0].text.includes(ctx.t('street.return')));
      ctx.input.type = 'keyboard';
      press();
      assert(`${kind}: explicit return restores exactly the origin object`, records()[id].status === 'available' && sprites(id).length === 1 && sprites(id)[0].visible && sprites(id)[0].x === origin.x && sprites(id)[0].y === origin.y);
    }
    // Locked displays remain locked even while temporarily riding the same type.
    const display = gs.skateboards.parked.find(i=>i.rideId==='board1');
    at(display.x,display.y);press();
    assert('ordinary display pieces remain locked after all four street claims', ctx.players[0].vehicle==='foot' && display.visible && !ctx.ownership.owns('skateboard'));
    const first=gs.skateboards.parked.find(i=>i.streetId),second=gs.rollerblades.parked.find(i=>i.streetId);
    at(first.x,first.y);press();
    ctx.players[1].teleport(second.x,second.y);press(1);
    assert('co-op riders can claim two different unowned objects independently',gs.skateboards.isMounted(0)&&gs.rollerblades.isMounted(1)&&ctx.state.shared.ownedVehicles.join()==='foot');
    foot();
    // Drive both children through the real connected map, not just through teleports.
    at(79.5*16,52.5*16);
    const drivers=ctx.players.map((_,index)=>env.h.makeDriver(ctx,index));
    const steering=ctx.players.map(p=>({x:p.x,y:p.y,still:0,detour:0,dx:0,dy:0}));
    let travel=true, wall=false, failedLeg=null;
    for(const [tx,ty] of [[102,52],[137,52],[137,23],[115,23],[102,52],[102,71],[86,85],[118,85]]) {
      for(const d of drivers)d.goal((tx+0.5)*16,(ty+0.5)*16);
      const result=until(()=>ctx.players.every(p=>Math.hypot(p.x-(tx+0.5)*16,p.y-(ty+0.5)*16)<14),4000,()=>{
        for(let index=0;index<drivers.length;index++) {
          const d=drivers[index],p=ctx.players[index],s=steering[index],i=ctx.input.intents[index];
          d.tick(8,9);
          if(++s.still>=120) {
            // Grid navigation cannot see pedestrians: steer around a live obstruction like a human.
            if(Math.hypot(p.x-s.x,p.y-s.y)<6&&d.dist>14) {
              const length=Math.hypot(i.move.x,i.move.y)||1;
              const dx=-i.move.y/length,dy=i.move.x/length;
              for(const sign of [1,-1]) if(ctx.chase.nav.clearFor(p.x,p.y,p.x+dx*32*sign,p.y+dy*32*sign,9)) {
                s.dx=dx*sign;s.dy=dy*sign;s.detour=30;break;
              }
            }
            s.still=0;s.x=p.x;s.y=p.y;
          }
          if(s.detour>0) {
            s.detour--;i.move.x=s.dx;i.move.y=s.dy;d.age=1e9;
          }
        }
        for(const p of ctx.players)if(ctx.surfaces.solid(ctx.surfaces.at(p.x,p.y)))wall=true;
      });
      if(result<0){travel=false;failedLeg=[tx,ty];break;}
    }
    for(const i of ctx.input.intents){i.move.x=i.move.y=0;}
    assert('co-op free roaming reaches riverside loops, canal shortcut and workshop market on the actual movement engine',travel&&!wall,JSON.stringify({travel,wall,failedLeg,players:ctx.players.map(p=>({x:p.x,y:p.y,pinned:p.pinned}))}));
    const scooter = gs.scooters.parked.find(i=>i.streetId);
    at(scooter.x,scooter.y);press();
    const scooterId=scooter.streetId;
    // Normal traffic fling must persist the final slide position, including an interrupted slide.
    at((40.5)*16,55.5*16);
    const bus=ctx.grabs.pool.find(t=>t.kind==='bus');
    ctx.traffic.hitBy(ctx.players[0],ctx.traffic.slots[0],bus,'side',140);
    step(65);
    const slid={x:scooter.x,y:scooter.y};
    assert('a street ride flung by traffic keeps identity and persists its actual resting position', records()[scooterId].status==='dropped'&&Math.abs(records()[scooterId].x-slid.x)<1&&Math.abs(records()[scooterId].y-slid.y)<1);
    until(()=>!ctx.traffic.tumbling(0),180);
    at(slid.x,slid.y);press();
    at(112,926);
    const random=ctx.traffic.random;
    ctx.traffic.random=()=>0.9;
    ctx.traffic.slots[0].plan.side=1;
    ctx.traffic.fling(ctx.players[0],ctx.traffic.slots[0],0);
    step(65);
    ctx.traffic.random=random;
    assert('a wall-adjacent street fling keeps the visible object and saved claim location synchronized',
      records()[scooterId].x===scooter.x&&records()[scooterId].y===scooter.y);
    at(scooter.x,scooter.y);press();
    const beforeCatch = ctx.state.shared.money;
    gs.caught.trigger(0);
    const caughtFrame = game.scene.getScene('UI').hudList.find(m => m.frames && m.frame)?.frame;
    assert('caught feedback formats the actual cents lost as euros',
      !!caughtFrame && caughtFrame.lost.text.includes(((beforeCatch - ctx.state.shared.money) / 100).toFixed(2).replace('.', ctx.i18n.lang === 'de' ? ',' : '.')));
    gs.caught.respawn(0);
    assert('caught cleanup drops the object, keeps the normal collision mask and does not clone it', records()[scooterId].status==='dropped'&&sprites(scooterId).length===1&&ctx.players[0].body.collisionFilter.mask===MASK.PLAYER);
    // Eight repeatable physical types share the same props cap, bodies and constraints.
    const Matter=Phaser.Physics.Matter.Matter;
    const constraints=()=>Matter.Composite.allConstraints(gs.matter.world.localWorld).length;
    const bodies=()=>ctx.props.props.length;
    const bodies0=bodies(),links0=constraints(),money0=ctx.state.shared.money;
    for(const g of gs.play.groups) {
      at(g.x,g.y);
      const before=g.uses;
      press();step(12);
      const body=g.parts[g.o.kind==='bridge'?2:0].body;
      const moved=Math.hypot(body.position.x-g.origins[g.o.kind==='bridge'?2:0].x,body.position.y-g.origins[g.o.kind==='bridge'?2:0].y);
      press();
      assert(`${g.o.kind}: repeat interact gives immediate physical motion and localized feedback`, g.uses===before+2&&moved>0.05&&log.some(([e,d])=>e==='ui:toast'&&d.key===`play.feedback.${g.o.kind}`),`${g.uses-before} uses, ${moved} px`);
      assert(`${g.o.kind}: repeat use creates no body, constraint or reward leak`, bodies()===bodies0&&constraints()===links0&&ctx.state.shared.money===money0);
      assert(`${g.o.kind}: aggregate awake props stay within the existing Medium cap`, ctx.props.awake<=ctx.quality.tier.maxProps);
    }
    ctx.world.load('school','from-town');step(2);
    assert('map exit releases every play constraint and shared prop body', constraints()===0&&ctx.props.props.length===0&&gs.play.groups.length===0);
    ctx.world.load('town','from-school');step(2);
    assert('map reentry restores only the bounded original play bodies and constraints', bodies()===bodies0&&constraints()===links0);
    // Real traffic: cars do not take the skates interact intent, bus and tram rear grabs still do.
    for (const kind of ['car','van','tram','bus']) {
      const target=ctx.grabs.pool.find(t=>t.kind===kind);
      at(target.x-Math.cos(target.heading)*(target.kcfg.length/2+20),target.y-Math.sin(target.heading)*(target.kcfg.length/2+20));
      ctx.ownership.unlock('skates','garage');gs.skates.giveBoard(ctx.players[0]);
      ctx.grabs.slots[0].near=false;
      ctx.grabs.seek(ctx.players[0],ctx.grabs.slots[0],{hold:false,jump:false});
      if(['car','van'].includes(kind)) {
        // Other grab targets may be near: isolate the queried non-grabbable kind.
        const active=ctx.grabs.pool.map(t=>t.active);
        ctx.grabs.pool.forEach(t=>{t.active=t===target;});
        ctx.grabs.seek(ctx.players[0],ctx.grabs.slots[0],{hold:false,jump:false});
        assert(`${kind}: a non-grabbable vehicle cannot claim a skater's interact`, !ctx.grabs.claims(0));
        ctx.grabs.pool.forEach((t,i)=>{t.active=active[i];});
      } else {
        ctx.grabs.seek(ctx.players[0],ctx.grabs.slots[0],{hold:true,jump:false});
        assert(`${kind}: a valid rear grab starts safely`, ctx.grabs.slots[0].target!==null);
        ctx.grabs.end(ctx.players[0],ctx.grabs.slots[0],'release');
        ctx.grabs.slots[0].g.armed=true;
      }
      foot();
    }
    const car=ctx.grabs.pool.find(t=>t.kind==='car');
    // Place a prop just ahead of its hull; traffic waits and recovers on its own circuit.
    const obstacle=ctx.props.props[0], old={...obstacle.body.position};
    const front=car.kcfg.length/2+20;
    gs.matter.body.setPosition(obstacle.body,{x:car.x+Math.cos(car.heading)*front,y:car.y+Math.sin(car.heading)*front});
    const rec0=car.recoveries;
    assert('an obstacle in the lane makes traffic yield',ctx.grabs.blocked(car));
    ctx.grabs.update(1/60);
    assert('yielding traffic actually stops, without applying a physical force',car.speed===0&&car.vx===0&&car.vy===0);
    for(let i=0;i<240&&car.recoveries===rec0;i++)ctx.grabs.update(1/60);
    assert('blocked traffic recovers within the bounded three-second timeout and 16 probes',car.recoveries>rec0&&ctx.grabs.pool.length<=ctx.grabs.cfg.maxTargets);
    gs.matter.body.setPosition(obstacle.body,old);
    // Saved carried object -> actual menu Continue during morning, with no origin clone or preparation bypass.
    foot();
    const ride=gs.bikes.parked.find(i=>i.streetId);
    at(ride.x,ride.y);press();
    const rideId=ride.streetId;
    ctx.state.dispatch('clock.set',{day:ctx.day.day,minute:420,phase:'morning'});
    ctx.saves.save(2);
    ctx.events.emit('game:quit');step(4);
    game.menuNav.play();game.menuNav.continueSlot(2);step(4);
    gs=game.scene.getScene('Game');ctx=gs.ctx;ctx.input.update=()=>{};
    assert('actual menu Continue keeps morning preparation and normalizes carried identity to a dropped ride',ctx.world.id==='home'&&ctx.players[0].vehicle==='foot'&&records()[rideId].status==='dropped'&&records()[rideId].map==='town');
    ctx.world.load('town','from-home');step(2);
    assert('Continue restores one playable dropped object, not an origin clone',sprites(rideId).length===1&&sprites(rideId)[0].visible);
    assert('all live pools remain inside their caps after the complete open-world matrix',[...ctx.pools.byName.values()].every(p=>p.live()<=p.cap));
  }
};
