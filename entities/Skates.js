// Inline skates (story 5.3): lying pairs from map objects (type "skates"), mounted with the interact intent, and everything
// a skateboard does (hop on the jump intent, rail grinds and Style through vehicles/TrickSystem.js) because it is the same
// service as entities/Skateboards.js with the `skates` profile of data/vehicles.json: the most agile ride (quick accel and
// turning), bad on cobble and grass (see data/surfaces.json), and the only one that can hang on to a bus (entities/GrabTargets.js).
// Poses (scenes/SkatesArt.js): gliding when at speed, alternating push-off frames while accelerating, crouched for a hop
// and low with a stretched arm while towed or tumbling.
import { Skateboards } from './Skateboards.js';

export class Skates extends Skateboards {
  constructor(scene, ctx, bikes, kind = { id: 'skates', object: 'skates', texture: 'skates' }) {
    super(scene, ctx, bikes, kind);
  }

  poseFor(dt, player, r, s, i) {
    const { poses, push } = this.profile;
    if (player.grabbing && poses.grab) return poses.grab;
    if (player.stumbling || s.air > 0 || s.grind || i.jump) return poses.crouch;
    const m = player.move;
    const target = this.profile.maxSpeed * m.speedMult * this.ctx.surfaces.props(m.surface).speed[this.id];
    const moving = i.move.x !== 0 || i.move.y !== 0;
    if (!moving || m.velSpeed >= push.glideFrac * target) return '';
    r.pushT += dt;
    return poses.push[Math.floor(r.pushT / push.interval) % 2];
  }
}
