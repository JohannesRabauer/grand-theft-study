// Smoke scenarios: world. Each export is { name, run(game, assert, env) }; registered in scripts/smoke/index.js.
// AD-28: a test door leads from the town into the test room and back; nothing map-specific may leak.
import { CAT } from '../../physics/categories.js';

// Matter bodies a map switch must give back: everything except walls (streamed by distance) and pedestrians (pooled, refilled by the crowd).
const mapBodies = (gs) => Phaser.Physics.Matter.Matter.Composite.allBodies(gs.matter.world.localWorld)
  .filter(b => ![CAT.STATIC, CAT.NPC, CAT.ANIMAL].includes(b.collisionFilter.category)).length;

export const worldDoors = {
  name: 'worldDoors',
  run(game, assert, env) {
    const { step, ctx, gs, player, intent, press, until, live, T } = env;
    const world = ctx.world;
    const log = [];
    ctx.events.on('world:leave', e => log.push(['leave', e.map]));
    ctx.events.on('world:enter', e => log.push(['enter', e.map, e.entry]));
    for (const p of ctx.players) if (gs.bikes.isMounted(p.index)) gs.bikes.dismount(p);
    const door = ctx.map.objects.find(o => o.id === 'door-test');
    assert('the debug door exists in a ?bench session and the town is the current map', !!door && world.id === 'town' && gs.doors.list.length === 1 && world.playable().includes('test-room'));

    // ---- town -> test room through the door (walk in + interact)
    player.teleport(T(door.x + 1), T(door.y));
    step(30);
    const before = { bodies: mapBodies(gs), children: gs.children.length, textures: gs.textures.getTextureKeys().length, pools: [...ctx.pools.byName.keys()].join(), props: ctx.props.props.length, ammo: gs.ammo.items.length, flags: gs.flags.flags.length, bikes: gs.bikes.parked.length };
    const townZones = gs.zones.zones.filter(z => z.body).length;
    const townProps = ctx.props.props.filter(p => p.alive).length;
    assert('before the trip the town has props, ammo, flags, a bike and sensors', before.props >= 15 && before.ammo >= 8 && before.flags >= 2 && before.bikes >= 1 && townZones >= 5, JSON.stringify(before));
    press('interact');
    assert('the door only requests the switch; the world changes at the next frame', world.id === 'town' && !!world.pending);
    step(2);
    const room = ctx.map;
    const entry = room.objects.find(o => o.type === 'entry');
    assert('now in the test room: map, surfaces and path grid follow', world.id === 'test-room' && room.indoor && ctx.surfaces.cols === 12 && ctx.chase.nav.cols === 12 && gs.worldW === 192, `${world.id} cols ${ctx.surfaces.cols}`);
    assert('every player stands at the entry point, still', ctx.players.every(p => Math.hypot(p.x - T(entry.x), p.y - T(entry.y)) < 1 && p.move.velSpeed < 1));
    assert('world:leave and world:enter fired in order with the entry id', JSON.stringify(log) === JSON.stringify([['leave', 'town'], ['enter', 'test-room', 'from-town']]), JSON.stringify(log));
    assert('a quick fade runs', gs.cameras.main.fadeEffect.isRunning);
    assert('town content is gone: props, ammo, flags, bikes, sensors, pedestrians, bullies', ctx.props.props.length === 0 && gs.ammo.items.length === 0 && gs.flags.flags.length === 0 && gs.bikes.parked.length === 0 && gs.zones.zones.length === 0 && live('npcs') === 0 && ctx.chase.pool.live() === 0, `${live('npcs')} npcs`);
    assert('bodies: the town props and sensors left the physics world', mapBodies(gs) === before.bodies - townProps - townZones, `${mapBodies(gs)} vs ${before.bodies} - ${townProps} - ${townZones}`);
    assert('only the room walls are streamed', live('walls') > 0 && live('walls') <= ctx.pools.byName.get('walls').cap && ctx.pools.byName.get('walls').cap < 40, `${live('walls')}/${ctx.pools.byName.get('walls').cap}`);
    step(60);
    assert('standing at the entry does not bounce the player back through the auto door', world.id === 'test-room');

    // ---- inside: the room walls hold, then walk down through the auto door
    intent.move.x = -1;
    step(150);
    intent.move.x = 0;
    assert('the room walls stop the player', player.x > 16 && player.x < 40 && !env.surfaces.solid(env.surfaces.at(player.x, player.y)), `x ${player.x.toFixed(1)}`);
    player.teleport(T(entry.x), T(entry.y));
    step(5);
    intent.move.y = 1;
    const frames = until(() => world.id === 'town', 240);
    intent.move.y = 0;
    step(2);
    const home = ctx.map.objects.find(o => o.id === 'from-test-room');
    assert('walking onto the exit door leads back to the town at its entry', frames >= 0 && world.id === 'town' && Math.hypot(player.x - T(home.x), player.y - T(home.y)) < 1, `${frames} frames`);
    step(60);
    assert('arriving next to the door does not re-trigger it', world.id === 'town' && log.length === 4, JSON.stringify(log));

    // ---- nothing leaked after the round trip
    const after = { bodies: mapBodies(gs), children: gs.children.length, textures: gs.textures.getTextureKeys().length, pools: [...ctx.pools.byName.keys()].join(), props: ctx.props.props.length, ammo: gs.ammo.items.length, flags: gs.flags.flags.length, bikes: gs.bikes.parked.length };
    assert('after the round trip bodies, display objects, textures, pools and map content are as before', JSON.stringify(after) === JSON.stringify(before), `${JSON.stringify(before)} -> ${JSON.stringify(after)}`);
    const walls = ctx.pools.byName.get('walls');
    const worldStatics = Phaser.Physics.Matter.Matter.Composite.allBodies(gs.matter.world.localWorld).filter(b => b.collisionFilter.category === CAT.STATIC).length;
    assert('the wall streamer owns exactly the walls in the physics world and the town is walled again', worldStatics === walls.live() && walls.cap > 100, `${worldStatics}/${walls.live()}/${walls.cap}`);
    assert('the pedestrians are back in the town', gs.crowd.liveCount > 0 && live('npcs') === gs.crowd.liveCount, `${gs.crowd.liveCount}`);
    assert('pools stay within their caps', [...ctx.pools.byName].every(([, p]) => p.live() >= 0 && p.live() <= p.cap), [...ctx.pools.byName].filter(([, p]) => p.live() > p.cap).map(([n]) => n).join());
  }
};
