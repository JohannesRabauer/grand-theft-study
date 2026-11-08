import { Pools } from '../entities/pools.js';
import { Surfaces } from '../physics/surfaces.js';
import { WallStreamer } from '../physics/WallStreamer.js';
import { Input } from '../ui/input.js';
import { Bikes } from '../entities/Bike.js';
import { Skateboards } from '../entities/Skateboards.js';
import { Skates } from '../entities/Skates.js';
import { GrabTargets } from '../entities/GrabTargets.js';
import { Traffic } from '../entities/Traffic.js';
import { Ownership } from '../vehicles/Ownership.js';
import { Parking } from '../entities/Parking.js';
import { BikeTheft } from '../entities/BikeTheft.js';
import { Garage } from '../entities/Garage.js';
import { TrickSystem } from '../vehicles/TrickSystem.js';
import { Player } from '../entities/Player.js';
import { installPlayers, startPlayers } from '../entities/players.js';
import { PlayerMarkers } from '../entities/PlayerMarkers.js';
import { CameraRig } from '../camera/CameraRig.js';
import { Zones } from '../entities/Zones.js';
import { Doors } from '../entities/Doors.js';
import { World } from '../services/World.js';
import { Wind } from '../physics/Wind.js';
import { DayClock } from '../services/DayClock.js';
import { Weather } from '../physics/Weather.js';
import { ParticleHub } from '../particles/ParticleHub.js';
import { Props } from '../entities/Prop.js';
import { NeighborDogs } from '../entities/NeighborDogs.js';
import { Flags } from '../entities/Flag.js';
import { Park } from '../entities/Park.js';
import { ChaseDirector } from '../ai/ChaseDirector.js';
import { Caught } from '../entities/Caught.js';
import { DefenseController } from '../defense/DefenseController.js';
import { Karate } from '../defense/Karate.js';
import { Dojo } from '../entities/Dojo.js';
import { BeltTags } from '../entities/BeltTags.js';
import { ToolBelt } from '../tools/ToolBelt.js';
import { AmmoPickups } from '../entities/AmmoPickups.js';
import { LootDrops } from '../entities/LootDrops.js';
import { Bushes } from '../entities/Bushes.js';
import { Doorbells } from '../entities/Doorbells.js';
import { Pinata } from '../entities/Pinata.js';
import { Balloons } from '../entities/Balloons.js';
import { CrowdDirector } from '../ai/CrowdDirector.js';
import { Characters } from '../characters/Characters.js';
import { LearningEngine } from '../learning/LearningEngine.js';
import { Grades } from '../grading/Grades.js';
import { Minigames } from '../minigames/Minigames.js';
import { School } from '../entities/School.js';
import { Commute } from '../entities/Commute.js';
import { Shops } from '../entities/Shops.js';
import { Quests } from '../entities/Quests.js';
import { DayFlow } from '../entities/DayFlow.js';
import { Progress } from '../characters/Progress.js';
import { Stickers } from '../services/stickers.js';
import { Achievements } from '../services/achievements.js';
import { PlayTime } from '../services/PlayTime.js';
import { Activities } from '../entities/Activities.js';
import { Phone } from '../entities/Phone.js';
import { Lookouts } from '../entities/Lookouts.js';
import { Cosmetics } from '../entities/Cosmetics.js';
import { Home } from '../entities/Home.js';
import { morningStartMap } from '../services/Morning.js';
import { StreetRides } from '../entities/StreetRides.js';
import { PlayObjects } from '../entities/PlayObjects.js';

const STEP_MS = 1000 / 60; // Matter's fixed timestep (AD-14); MovementController assumes it too
const STEP_SLACK = 0.95; // a frame that arrives a hair early (vsync jitter) still gets its step
const MAX_BACKLOG = 3 * STEP_MS;
const SNAP_RANGE = 0.03; // zoom distance from an integer over which the camera blends from sub-pixel to pixel-snapped

export class GameScene extends Phaser.Scene {
  constructor() { super('Game'); }

  // Optional start config { players: [{ character, vehicle }] } (tests, menu); without it the saved state decides (coop flag).
  init(data) { this.startOverride = data?.players ?? null; }

  create() {
    const cache = this.cache.json;
    const index = this.registry.get('mapIndex');
    const maps = Object.fromEntries(index.maps.map(m => [m.id, cache.get(`map-${m.id}`)]));
    // AD-2: one ctx, created once, handed to every system.
    const { events, i18n, t, quality, res, state, saves } = this.registry.get('app');
    saves.attach(); // the previous run removed every listener of the shared emitter, including the autosave on phase:ended
    const startMap = morningStartMap(index, maps, saves, state.shared.clock);
    const map = maps[startMap];
    const ts = map.tileSize;
    const ctx = {
      events,
      i18n,
      t,
      quality,
      state, // AD-16: saved data, changed only through state.dispatch
      saves, // save slots (save/load/delete/list)
      res, // render scale: world units stay the same, textures are drawn `res.scale` times finer (AD-14)
      pools: new Pools(),
      swingTargets: {}, // the stick's object targets by kind (story 6.2): each system registers itself with `items` and `locate`
      map,
      surfaces: new Surfaces(map, cache.get('surfaces'))
    };
    const inputCfg = cache.get('input');
    installPlayers(ctx, inputCfg.maxPlayers); // AD-18: ctx.players, helpers and the deprecated ctx.player alias
    ctx.input = new Input(this, events, inputCfg, ctx.players);
    ctx.ownership = new Ownership(ctx); // CAP-16: owned vehicles; Player.setVehicle asks it
    ctx.characters = new Characters(ctx, cache.get('characters'), cache.get('attr-growth'), cache.get('vehicles')); // CAP-12
    const topicFiles = cache.get('learning-index').topics.map(({ grade, topic }) => cache.get(`learning-${grade}-${topic}`));
    ctx.learning = new LearningEngine(ctx, cache.get('learning'), topicFiles, cache.get('learning-reactions')); // AD-19
    if (window.SCHULWEG_GAME) window.SCHULWEG_GAME.learning = ctx.learning;
    ctx.grades = new Grades(ctx, { grading: cache.get('grading'), kopfnoten: cache.get('kopfnoten'), comments: cache.get('teacher-comments'), parents: cache.get('parent-reactions') }, { de: cache.get('de'), en: cache.get('en') }); // AD-20 / CAP-8
    if (window.SCHULWEG_GAME) window.SCHULWEG_GAME.grades = ctx.grades;
    ctx.minigames = new Minigames(this, ctx, cache.get('minigames')); // AD-20
    this.ctx = ctx;

    new World(this, ctx, index, maps).start(startMap); // AD-28: ground, walls and ctx.map of the first map

    // map objects are in tile coordinates
    const spawn = map.objects.find(o => o.type === 'spawn' && o.id === 'player');
    this.toolCfg = cache.get('tool');
    this.zoomCfg = cache.get('camera');
    const starters = startPlayers(state.shared, state.players, ctx.maxPlayers, this.startOverride);
    const offsets = starters.length > 1 ? this.zoomCfg.coop.spawnOffsets : [[0, 0]];
    for (const s of starters) {
      if (s.character !== state.players[s.index].character) state.dispatch('player.setCharacter', { player: s.index, character: s.character });
      const p = this.addPlayer((spawn.x + 0.5) * ts + offsets[s.index][0], (spawn.y + 0.5) * ts + offsets[s.index][1]);
      if (s.vehicle) p.startVehicle = s.vehicle;
    }
    this.street = new StreetRides(this, ctx);
    this.bikes = new Bikes(this, ctx);
    this.skateboards = new Skateboards(this, ctx, this.bikes);
    this.skates = new Skates(this, ctx, this.bikes);
    this.scooters = new Skateboards(this, ctx, this.bikes, { id: 'scooter', object: 'scooter', texture: 'scooter' });
    this.rollerblades = new Skates(this, ctx, this.bikes, { id: 'rollerblades', object: 'rollerblades', texture: 'rollerblades' });
    this.rollers = [this.skateboards, this.skates, this.scooters, this.rollerblades];
    this.mountables = [this.bikes, ...this.rollers];
    this.street.services = this.mountables;
    for (const service of this.rollers) service.rivals = this.mountables.filter(s => s !== service);
    this.parking = new Parking(this, ctx, cache.get('theft'), this.mountables); // story 5.5: racks, locks, padlocks
    this.grabs = new GrabTargets(this, ctx, cache.get('routes'), cache.get('grab')); // AD-23: before the first mount, Skates asks it
    this.traffic = new Traffic(this, ctx, cache.get('traffic'), [this.grabs], this.mountables, this.parking); // story 5.6: moving buses hit players
    this.tricks = new TrickSystem(this, ctx, cache.get('tricks'), this.rollers); // AD-23
    for (const p of ctx.players) {
      if (startMap === 'home') p.deferredStartVehicle = true;
      else this.mountStartVehicle(p);
    }
    events.on('world:enter', e => {
      if (e.map !== 'town') return;
      for (const p of ctx.players) if (p.deferredStartVehicle) {
        p.deferredStartVehicle = false;
        this.mountStartVehicle(p);
      }
    });
    ctx.frozen = false; // true while the caught frame or a freezing screen is up: the world stands still, UIScene keeps running
    this.caughtFrozen = false;
    this.zones = new Zones(this, ctx);
    ctx.zones = this.zones;
    this.doors = new Doors(this, ctx);
    const wcfg = cache.get('weather');
    ctx.wind = new Wind(wcfg.wind);
    ctx.day = new DayClock(ctx, cache.get('day')); // AD-17: before Weather, which reads its schedule
    ctx.weather = new Weather(this, ctx, wcfg.weather);
    ctx.particles = new ParticleHub(this, ctx, cache.get('particles'));
    this.props = new Props(this, ctx, cache.get('props'));
    this.play = new PlayObjects(this, ctx, cache.get('play-objects'));
    this.ammo = new AmmoPickups(this, ctx, cache.get('tool'));
    const stickWorld = cache.get('stick-world'); // story 6.2: what the stick, and the slingshot's balloons, play with
    this.loot = new LootDrops(this, ctx, stickWorld, cache.get('tool'));
    this.bushes = new Bushes(this, ctx, stickWorld);
    this.doorbells = new Doorbells(this, ctx, stickWorld, cache.get('neighbors'));
    this.pinata = new Pinata(this, ctx, stickWorld);
    this.balloons = new Balloons(this, ctx, stickWorld);
    this.dogs = new NeighborDogs(this, ctx, cache.get('dogs')); // story 6.1: free dogs that fetch thrown sticks
    this.flags = new Flags(this, ctx, wcfg.flag);
    this.park = new Park(this, ctx, cache.get('park')); // story 5.4: skatepark art and hint signs
    this.chase = new ChaseDirector(this, ctx, cache.get('chase'), cache.get('vehicles'));
    this.defense = new DefenseController(this, ctx, cache.get('karate')); // story 6.3: block, dodge, Kiai; the chase director asks it before a catch
    this.karate = new Karate(ctx, cache.get('karate')); // story 6.4: belts, training points and the daily limit (ctx.karate)
    this.dojo = new Dojo(this, ctx, cache.get('karate')); // the dojo building in the town, the sensei and the belt rack inside
    this.school = new School(this, ctx, cache.get('timetable'), cache.get('minigames').minigames, cache.get('school-events'));
    this.home = new Home(this, ctx, cache.get('morning'));
    this.commute = new Commute(this, ctx, cache.get('commute')); // story 8.2: the bell, the tram, pickups
    this.shops = new Shops(this, ctx, cache.get('shop'), cache.get('input')); // story 10.1: the market shops and the bakery
    this.cosmetics = new Cosmetics(this, ctx); // story 10.1: hats and rings the players wear
    this.quests = new Quests(this, ctx, cache.get('missions'), cache.get('input')); // story 9.1: missions, phone booths, the objective
    this.dayFlow = new DayFlow(this, ctx, cache.get('dayflow'), cache.get('input')); // story 8.5: the gate, the ride home, bedtime
    this.progress = new Progress(ctx, cache.get('xp')); // story 10.2: xp for activities, level-up celebration
    this.stickers = new Stickers(ctx, cache.get('stickers')); // story 10.3: the sticker collection
    this.achievements = new Achievements(ctx, cache.get('achievements')); // story 10.4: achievements and daily streaks
    this.activities = new Activities(this, ctx, cache.get('activities'), cache.get('input')); // story 9.2: the Pfand machine and the bakery counter
    this.lookouts = new Lookouts(this, ctx); // story 7.2
    this.phone = new Phone(this, ctx, cache.get('phone')); // story 11.3
    this.playTime = new PlayTime(ctx, minutes => ctx.quests.show(ctx.t('parent.reminder.title'), [ctx.t('parent.reminder.body', { n: minutes })])); // story 11.4: the break reminder
    this.beltTags = new BeltTags(this, ctx, cache.get('karate'));
    this.garage = new Garage(this, ctx);
    this.caught = new Caught(this, ctx, cache.get('chase').caught, this.mountables);
    this.theft = new BikeTheft(this, ctx, cache.get('theft'), this.bikes, this.parking, cache.get('vehicles')); // needs the chase director's spawns and paths
    this.rig = new CameraRig(ctx, this.zoomCfg); // AD-18: focus, fit zoom and tether of all players
    this.markers = new PlayerMarkers(this, ctx, this.zoomCfg.coop);
    this.streamer = new WallStreamer(this, ctx, cache.get('quality').wallRadius);

    // Own camera follow (see followCamera). The base zoom is the render scale, so the view still
    // covers the same world area as at 480x270; the speed zoom (camera.json) multiplies it.
    const cam = this.cameras.main;
    cam.setZoom(res.scale * this.zoomCfg.max);
    // Phaser floors the scroll of a roundPixels camera to whole world pixels in preRender (2 screen pixels
    // at zoom 2). followCamera snaps to screen pixels itself, so that floor is skipped here; sprites are
    // rounded to pixels only at an exactly integer zoom.
    const preRender = cam.preRender;
    cam.preRender = function () {
      this.roundPixels = false;
      preRender.call(this);
      this.roundPixels = true;
      this.renderRoundPixels = Number.isInteger(this.zoomX) && Number.isInteger(this.zoomY);
    };
    this.zoomGoal = cam.zoom;
    this.zoomVel = 0;
    this.focus = this.rig.focus;
    this.snapCamera();
    this.crowd = new CrowdDirector(this, ctx, cache.get('npcs')); // after the camera: it prefills the view

    // UIScene asks for pause (a freezing screen is open) / quit through events; the world is only changed here.
    this.paused = false;
    this.physAcc = 0;
    events.on('game:pause', () => this.setPaused(true));
    events.on('game:resume', () => this.setPaused(false));
    events.on('game:quit', () => this.scene.start('Menu'));
    ctx.day.start();
    if (window.SCHULWEG_GAME) { // ?debug and ?bench
      window.SCHULWEG_GAME.addPlayer = () => this.addDebugPlayer();
      window.SCHULWEG_GAME.spawnDog = (x, y, state) => ctx.dogs.spawn(x, y, state); // a free dog (CHASE by default)
      window.SCHULWEG_GAME.startMinigame = (id, opts) => ctx.minigames.start(id, opts); // resolves with the result (AD-20)
      window.SCHULWEG_GAME.setCoop = (on) => { state.dispatch('coop.set', { on }); this.scene.restart(); }; // restarts the run with or without the second player
    }
    this.scene.launch('UI', { ctx });
    this.events.once('shutdown', () => {
      this.scene.stop('UI');
      events.removeAllListeners(); // the shared emitter outlives this run; menu re-subscribes in create
    });
  }

  // Creates the next player (ctx.players[index], its intent is ctx.input.intents[index]) with its own tool belt.
  // The game starts with the players of the state (one unless co-op is on); SCHULWEG_GAME.addPlayer() (?debug) adds a second to a running one-player game.
  addPlayer(x, y) {
    const { ctx } = this;
    const index = ctx.players.length;
    const player = new Player(this, ctx, index, x, y, this.cache.json.get('vehicles'), 'foot');
    ctx.players.push(player);
    player.toolbelt = new ToolBelt(this, ctx, this.toolCfg, player);
    ctx.characters.apply(player);
    return player;
  }

  // The character's start vehicle (it is always owned); anything but the bike, the skateboard and the skates means on foot.
  mountStartVehicle(player) {
    this.ctx.ownership.unlock(player.startVehicle, 'start');
    if (player.startVehicle === 'bike') this.bikes.giveBike(player);
    else if (player.startVehicle === 'skateboard') this.skateboards.giveBoard(player);
    else if (player.startVehicle === 'skates') this.skates.giveBoard(player);
  }

  // Debug helper behind SCHULWEG_GAME.addPlayer(): a second player at the first one's position, driven by
  // the player-2 intent (arrow keys, right Ctrl / Shift, Enter, , . and Numpad0, or the first gamepad).
  addDebugPlayer() {
    const { players, maxPlayers } = this.ctx;
    if (players.length >= maxPlayers) return null;
    const p = this.addPlayer(players[0].x, players[0].y);
    this.mountStartVehicle(p);
    return p;
  }

  // Puts the camera on the players at once (start, map switch) instead of easing towards them.
  snapCamera() {
    this.rig.update(0);
    this.camX = this.camOutX = this.focus.x;
    this.camY = this.camOutY = this.focus.y;
    this.followCamera(1);
    this.cameras.main.preRender(); // worldView, which prop culling and the crowd's first fill read
  }

  // Zoom follows real speed continuously (1.0 standing .. 0.6 at top speed) times the render scale.
  // The speed is low-passed with a small dead band (hysteresis, so noise in the speed never moves the
  // target), the zoom itself is a critically damped spring with a maximum rate, so it neither pops nor
  // overshoots, and it lands exactly on its target (an exact integer at the base zoom, where the
  // renderer rounds sprites to pixels). Only the main camera zooms; UIScene has its own camera.
  updateZoom(dt) {
    const z = this.zoomCfg;
    const scale = this.ctx.res.scale;
    const t = Math.min(1, this.focus.speed / z.speedForMin);
    const raw = Math.min(z.max + (z.min - z.max) * t, this.focus.zoomCap) * scale; // the fit zoom of the rig also has to hold (one player: no cap)
    if (raw >= z.max * scale || raw <= z.min * scale || Math.abs(raw - this.zoomGoal) > z.deadband * scale) this.zoomGoal = raw;
    const cam = this.cameras.main;
    const err = this.zoomGoal - cam.zoom;
    if (Math.abs(err) < 1e-4 * scale && Math.abs(this.zoomVel) < 1e-3 * scale) {
      this.zoomVel = 0;
      if (err) cam.setZoom(this.zoomGoal);
      return;
    }
    const w = z.smooth;
    const max = z.maxRate * scale;
    const n = Math.ceil(dt / 0.01); // substeps keep the spring stable on slow frames
    const h = dt / n;
    let zoom = cam.zoom;
    for (let i = 0; i < n; i++) {
      this.zoomVel += (w * w * (this.zoomGoal - zoom) - 2 * w * this.zoomVel) * h;
      this.zoomVel = Phaser.Math.Clamp(this.zoomVel, -max, max);
      zoom += this.zoomVel * h;
    }
    cam.setZoom(zoom);
  }

  // Eased follow of the player, in place of Phaser's startFollow: that one floors the scroll to whole
  // *world* pixels, which at a base zoom of 2 would move the view in 2-screen-pixel jumps. The view
  // centre is snapped to whole *screen* pixels only while the zoom is (almost) an integer, where
  // sprites are rounded too and pixel art has to stay crisp; between integers it is left sub-pixel so
  // nothing jumps against the filtered textures, and the two blend over a small zoom range.
  // Something else moving the camera (respawn, test teleports) is picked up instead of eased towards.
  followCamera(dt) {
    const cam = this.cameras.main;
    const hw = cam.width / 2;
    const hh = cam.height / 2;
    if (Math.abs(cam.scrollX + hw - this.camOutX) > 0.01 || Math.abs(cam.scrollY + hh - this.camOutY) > 0.01) {
      this.camX = cam.scrollX + hw;
      this.camY = cam.scrollY + hh;
    }
    const k = 1 - Math.pow(1 - this.zoomCfg.follow, dt * 60);
    this.camX += (this.focus.x - this.camX) * k;
    this.camY += (this.focus.y - this.camY) * k;
    const z = cam.zoom;
    const vw = cam.width / z / 2; // half of the visible world, so the view stays inside the map
    const vh = cam.height / z / 2;
    const cx = this.worldW > vw * 2 ? Phaser.Math.Clamp(this.camX, vw, this.worldW - vw) : this.worldW / 2;
    const cy = this.worldH > vh * 2 ? Phaser.Math.Clamp(this.camY, vh, this.worldH - vh) : this.worldH / 2;
    const snap = Phaser.Math.Clamp(1 - Math.abs(z - Math.round(z)) / SNAP_RANGE, 0, 1);
    this.camOutX = cx + (Math.round(cx * z) / z - cx) * snap;
    this.camOutY = cy + (Math.round(cy * z) / z - cy) * snap;
    cam.setScroll(this.camOutX - hw, this.camOutY - hh);
  }

  setPaused(on) {
    this.paused = on;
    this.syncWorld();
  }

  freeze(on) {
    this.caughtFrozen = on;
    this.syncWorld();
  }

  syncWorld() {
    this.ctx.frozen = this.paused || this.caughtFrozen;
    if (this.ctx.frozen) this.matter.world.pause(); else this.matter.world.resume();
  }

  // Fixed-step Matter without the library runner (its frame-delta smoothing sorted and sliced a
  // 100-entry history every frame). Slow frames catch up with at most 3 steps; 120 Hz screens step every other frame.
  stepPhysics(delta) {
    const world = this.matter.world;
    if (!world.enabled) { this.physAcc = 0; return; }
    this.physAcc = Math.min(this.physAcc + delta, MAX_BACKLOG);
    while (this.physAcc >= STEP_MS * STEP_SLACK) {
      world.step(STEP_MS);
      this.physAcc = Math.max(0, this.physAcc - STEP_MS);
    }
  }

  update(time, delta) {
    const dt = Math.min(delta, 50) / 1000;
    this.ctx.input.update();
    if (this.paused) return;
    this.ctx.world.update();
    this.stepPhysics(delta);
    if (this.ctx.input.intent.weather) this.ctx.weather.toggle(); // global intents come from P1 only
    if (this.ctx.input.intent.map) this.ctx.minimap?.toggle(); // story 11.2
    if (this.ctx.input.intent.phone) this.ctx.phone?.toggle(); // story 11.3

    this.ctx.day.update(dt);
    this.ctx.wind.update(dt);
    this.ctx.weather.update(dt);
    this.caught.update(dt);
    if (this.ctx.frozen) {
      this.flags.update(dt);
      this.ctx.particles.update(dt);
      return;
    }
    for (const p of this.ctx.players) if (p.pinned) p.hold(); else p.update(dt);
    for (const p of this.ctx.players) p.toolbelt.update(dt);
    this.defense.update(dt);
    this.karate.update(dt);
    this.dojo.update(dt);
    this.school.update();
    this.home.update();
    this.commute.update(dt);
    this.shops.update();
    this.cosmetics.update(dt);
    this.quests.update(dt);
    this.playTime.update(dt);
    this.activities.update();
    this.lookouts.update(dt);
    this.ammo.update(dt);
    for (const p of this.ctx.players) p.vehicleSwapped = false;
    this.grabs.update(dt);
    this.traffic.update(dt); // before the mounting services: a tumbling player cannot mount
    for (const service of this.rollers) service.update(dt);
    this.tricks.update(dt);
    this.bikes.update(dt);
    this.street.update();
    this.garage.update();
    this.theft.update(dt);
    this.zones.update();
    this.park.update();
    this.doors.update();
    this.doorbells.update(dt);
    this.chase.update(dt);
    this.rig.update(dt);
    this.updateZoom(dt);
    this.followCamera(dt);
    this.crowd.update(dt);
    this.props.update(dt);
    this.play.update(dt);
    this.loot.update(dt);
    this.bushes.update(dt);
    this.pinata.update(dt);
    this.balloons.update(dt);
    this.dogs.update(dt);
    this.flags.update(dt);
    this.ctx.particles.update(dt);
    this.streamer.update();
    this.markers.update();
    this.beltTags.update();
  }
}
