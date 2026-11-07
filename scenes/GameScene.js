import { Pools } from '../entities/pools.js';
import { Surfaces } from '../physics/surfaces.js';
import { WallStreamer } from '../physics/WallStreamer.js';
import { Input } from '../ui/input.js';
import { Bikes } from '../entities/Bike.js';
import { Skateboards } from '../entities/Skateboards.js';
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
import { Flags } from '../entities/Flag.js';
import { ChaseDirector } from '../ai/ChaseDirector.js';
import { Caught } from '../entities/Caught.js';
import { ToolBelt } from '../tools/ToolBelt.js';
import { AmmoPickups } from '../entities/AmmoPickups.js';
import { CrowdDirector } from '../ai/CrowdDirector.js';
import { Characters } from '../characters/Characters.js';
import { LearningEngine } from '../learning/LearningEngine.js';
import { Grades } from '../grading/Grades.js';
import { Minigames } from '../minigames/Minigames.js';

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
    const map = maps[index.start];
    const ts = map.tileSize;

    // AD-2: one ctx, created once, handed to every system.
    const { events, i18n, t, quality, res, state, saves } = this.registry.get('app');
    const ctx = {
      events,
      i18n,
      t,
      quality,
      state, // AD-16: saved data, changed only through state.dispatch
      saves, // save slots (save/load/delete/list)
      res, // render scale: world units stay the same, textures are drawn `res.scale` times finer (AD-14)
      pools: new Pools(),
      map,
      surfaces: new Surfaces(map, cache.get('surfaces'))
    };
    const inputCfg = cache.get('input');
    installPlayers(ctx, inputCfg.maxPlayers); // AD-18: ctx.players, helpers and the deprecated ctx.player alias
    ctx.input = new Input(this, events, inputCfg, ctx.players);
    ctx.characters = new Characters(ctx, cache.get('characters'), cache.get('attr-growth'), cache.get('vehicles')); // CAP-12
    const topicFiles = cache.get('learning-index').topics.map(({ grade, topic }) => cache.get(`learning-${grade}-${topic}`));
    ctx.learning = new LearningEngine(ctx, cache.get('learning'), topicFiles, cache.get('learning-reactions')); // AD-19
    if (window.SCHULWEG_GAME) window.SCHULWEG_GAME.learning = ctx.learning;
    ctx.grades = new Grades(ctx, { grading: cache.get('grading'), kopfnoten: cache.get('kopfnoten'), comments: cache.get('teacher-comments'), parents: cache.get('parent-reactions') }, { de: cache.get('de'), en: cache.get('en') }); // AD-20 / CAP-8
    if (window.SCHULWEG_GAME) window.SCHULWEG_GAME.grades = ctx.grades;
    ctx.minigames = new Minigames(this, ctx, cache.get('minigames')); // AD-20
    this.ctx = ctx;

    new World(this, ctx, index, maps).start(index.start); // AD-28: ground, walls and ctx.map of the first map

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
    this.bikes = new Bikes(this, ctx);
    this.skateboards = new Skateboards(this, ctx, this.bikes);
    for (const p of ctx.players) this.mountStartVehicle(p);
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
    this.ammo = new AmmoPickups(this, ctx, cache.get('tool'));
    this.flags = new Flags(this, ctx, wcfg.flag);
    this.chase = new ChaseDirector(this, ctx, cache.get('chase'), cache.get('vehicles'));
    this.caught = new Caught(this, ctx, cache.get('chase').caught, [this.bikes, this.skateboards]);
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

  // The character's start vehicle; anything but the bike and the skateboard (skates until story 5.3) means on foot.
  mountStartVehicle(player) {
    if (player.startVehicle === 'bike') this.bikes.giveBike(player);
    else if (player.startVehicle === 'skateboard') this.skateboards.giveBoard(player);
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
    this.ammo.update(dt);
    for (const p of this.ctx.players) p.vehicleSwapped = false;
    this.skateboards.update(dt);
    this.bikes.update(dt);
    this.zones.update();
    this.doors.update();
    this.chase.update(dt);
    this.rig.update(dt);
    this.updateZoom(dt);
    this.followCamera(dt);
    this.crowd.update(dt);
    this.props.update(dt);
    this.flags.update(dt);
    this.ctx.particles.update(dt);
    this.streamer.update();
    this.markers.update();
  }
}
