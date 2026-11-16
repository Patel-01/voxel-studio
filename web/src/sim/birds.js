// A small flock: circles the island by day, roosts on tree tops at night or in bad weather.
// State lives in typed arrays; stepping allocates nothing.

export const FLYING = 0, PERCHED = 1;

export class Birds {
  constructor(world, rng, count) {
    this.world = world;
    this.count = count;
    this.pos = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.roost = new Float32Array(count * 3);
    this.state = new Uint8Array(count);
    this.yaw = new Float32Array(count);
    this.pitch = new Float32Array(count);
    this.flap = new Float32Array(count);   // wing phase
    this.offset = new Float32Array(count); // per-bird variation
    const crowns = world.crowns;
    for (let b = 0; b < count; b++) {
      this.offset[b] = rng();
      const crown = crowns.length ? crowns[Math.floor(rng() * crowns.length)] : { i: world.half, j: world.half, h: 12 };
      this.roost[b * 3] = world.sceneX(crown.i) + (rng() - 0.5) * 0.5;
      this.roost[b * 3 + 1] = crown.h + 0.16;
      this.roost[b * 3 + 2] = world.sceneZ(crown.j) + (rng() - 0.5) * 0.5;
    }
    this.reset();
  }

  reset() {
    this.clock = 0;
    for (let b = 0; b < this.count; b++) {
      const a = b * 0.24;
      this.pos[b * 3] = Math.cos(a) * 16;
      this.pos[b * 3 + 1] = 20 + (b % 3);
      this.pos[b * 3 + 2] = Math.sin(a) * 16;
      this.vel[b * 3] = -Math.sin(a) * 5;
      this.vel[b * 3 + 1] = 0;
      this.vel[b * 3 + 2] = Math.cos(a) * 5;
      this.state[b] = FLYING;
      this.flap[b] = this.offset[b] * 6.28;
    }
  }

  step(dt, env) {
    this.clock += dt;
    const t = this.clock;
    const wantRoost = env.isNight || env.sheltering;
    const { pos, vel, roost } = this;
    for (let b = 0; b < this.count; b++) {
      const o = b * 3;
      if (this.state[b] === PERCHED) {
        // Staggered take-off in the morning.
        if (!wantRoost && (env.hour > 5.9 + this.offset[b] * 0.5 || env.hour > 12)) {
          this.state[b] = FLYING;
          vel[o + 1] = 2.5;
        }
        continue;
      }
      let tx, ty, tz, maxSpeed;
      if (wantRoost) {
        tx = roost[o]; ty = roost[o + 1]; tz = roost[o + 2];
      } else {
        const a = t * 0.33 + b * 0.24 + this.offset[b] * 0.3;
        const r = 15 + 4 * Math.sin(t * 0.13 + b);
        tx = Math.cos(a) * r;
        ty = 20 + 2.5 * Math.sin(t * 0.21 + b * 1.7);
        tz = Math.sin(a) * r;
      }
      const dx = tx - pos[o], dy = ty - pos[o + 1], dz = tz - pos[o + 2];
      const dist = Math.hypot(dx, dy, dz);
      if (wantRoost && dist < 0.25) {
        pos[o] = tx; pos[o + 1] = ty; pos[o + 2] = tz;
        vel[o] = vel[o + 1] = vel[o + 2] = 0;
        this.state[b] = PERCHED;
        this.pitch[b] = 0;
        continue;
      }
      maxSpeed = wantRoost ? Math.min(7.5, dist * 1.4 + 0.6) : 7.5;
      const inv = dist > 1e-5 ? maxSpeed / dist : 0;
      const steer = Math.min(1, dt * (wantRoost ? 3.5 : 1.8));
      vel[o] += (dx * inv - vel[o]) * steer;
      vel[o + 1] += (dy * inv - vel[o + 1]) * steer;
      vel[o + 2] += (dz * inv - vel[o + 2]) * steer;
      pos[o] += vel[o] * dt;
      pos[o + 1] += vel[o + 1] * dt;
      pos[o + 2] += vel[o + 2] * dt;
      const flat = Math.hypot(vel[o], vel[o + 2]);
      if (flat > 0.05) this.yaw[b] = Math.atan2(vel[o], vel[o + 2]);
      this.pitch[b] = Math.atan2(vel[o + 1], flat + 1e-5);
      this.flap[b] += dt * 11;
    }
  }
}
