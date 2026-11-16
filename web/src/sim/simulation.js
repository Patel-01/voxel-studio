// Owns all simulated state and advances it in fixed steps so runs are repeatable.

import { COUNTS, MAX_STEPS_PER_FRAME, SPEEDS, START } from '../config.js';
import { Birds } from './birds.js';
import { Environment } from './environment.js';
import { makeRng } from './rng.js';
import { Villagers } from './villagers.js';

export class Simulation {
  constructor(world) {
    this.world = world;
    this._build();
  }

  _build() {
    const seed = this.world.seed;
    this.env = new Environment(seed);
    this.birds = new Birds(this.world, makeRng(seed * 7919 + 1), COUNTS.birds);
    this.villagers = new Villagers(this.world, makeRng(seed * 7919 + 2), COUNTS.villagers);
    this.speedIndex = START.speedIndex;
    this.paused = false;
    this._acc = 0;
  }

  reset() { this._build(); }

  get speed() { return SPEEDS[this.speedIndex]; }

  // Smaller steps at slow speeds keep motion smooth; larger ones keep fast-forward cheap.
  get stepSize() { const s = this.speed; return s <= 0.5 ? 1 / 240 : s <= 2 ? 1 / 60 : 1 / 30; }

  step(dt) {
    this.env.step(dt);
    this.birds.step(dt, this.env);
    this.villagers.step(dt, this.env);
  }

  // Advance by a slice of real time. Returns true if the world moved.
  advance(realDt) {
    if (this.paused) return false;
    this._acc += realDt * this.speed;
    const dt = this.stepSize;
    let steps = 0;
    while (this._acc >= dt && steps < MAX_STEPS_PER_FRAME) { this.step(dt); this._acc -= dt; steps++; }
    if (steps === MAX_STEPS_PER_FRAME) this._acc = 0; // fell behind: drop the backlog
    return steps > 0;
  }
}
