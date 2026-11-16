// Islanders: wander the walkable ground by day, walk home to the cabin at dusk
// or when the weather turns. Paths come from a breadth-first search over the grid
// using buffers allocated once.

const IDLE = 0, WALK = 1, HOME = 2, INSIDE = 3;
const MAX_PATH = 512;
const SPEED = 1.7; // cells per simulated second

export class Villagers {
  constructor(world, rng, count) {
    this.world = world;
    this.rng = rng;
    this.count = count;
    const cells = world.size * world.size;
    this._prev = new Int32Array(cells);
    this._queue = new Int32Array(cells);
    this.pos = new Float32Array(count * 3);
    this.yaw = new Float32Array(count);
    this.visible = new Float32Array(count); // 0 inside, 1 out
    this.list = [];
    for (let v = 0; v < count; v++) {
      this.list.push({ state: IDLE, cell: 0, next: 0, t: 0, timer: 0, path: new Int32Array(MAX_PATH), len: 0, at: 0 });
    }
    this.reset();
  }

  reset() {
    for (let v = 0; v < this.count; v++) {
      const p = this.list[v];
      p.state = IDLE; p.cell = this.world.door; p.next = p.cell; p.t = 0; p.len = 0; p.at = 0;
      p.timer = 0.5 + v * 1.5;
      this.visible[v] = 1;
      this._place(v, p);
    }
  }

  // Fills p.path with cells from start (exclusive) to goal (inclusive). Returns false if unreachable.
  _findPath(p, start, goal) {
    const { walk, size: n } = this.world;
    if (start === goal || walk[goal] < 0) return false;
    const prev = this._prev, queue = this._queue;
    prev.fill(-1);
    let head = 0, tail = 0;
    queue[tail++] = start;
    prev[start] = start;
    while (head < tail) {
      const c = queue[head++];
      if (c === goal) break;
      const i = Math.floor(c / n), j = c % n, h = walk[c];
      for (let d = 0; d < 4; d++) {
        const ni = i + (d === 0) - (d === 1), nj = j + (d === 2) - (d === 3);
        if (ni < 0 || nj < 0 || ni >= n || nj >= n) continue;
        const nc = ni * n + nj;
        if (prev[nc] !== -1 || walk[nc] < 0 || Math.abs(walk[nc] - h) > 1) continue;
        prev[nc] = c;
        queue[tail++] = nc;
      }
    }
    if (prev[goal] === -1) return false;
    let len = 0;
    for (let c = goal; c !== start; c = prev[c]) len++;
    if (len > MAX_PATH) return false;
    let k = len;
    for (let c = goal; c !== start; c = prev[c]) p.path[--k] = c;
    p.len = len; p.at = 0;
    return true;
  }

  _place(v, p) {
    const w = this.world, n = w.size;
    const ai = Math.floor(p.cell / n), aj = p.cell % n, bi = Math.floor(p.next / n), bj = p.next % n;
    const t = p.t;
    const ya = w.walk[p.cell] + 1, yb = w.walk[p.next] + 1;
    this.pos[v * 3] = w.sceneX(ai + (bi - ai) * t);
    this.pos[v * 3 + 1] = ya + (yb - ya) * t + Math.abs(Math.sin(t * Math.PI)) * (0.16 + Math.abs(yb - ya) * 0.3);
    this.pos[v * 3 + 2] = w.sceneZ(aj + (bj - aj) * t);
    if (p.next !== p.cell) this.yaw[v] = Math.atan2(bi - ai, bj - aj);
  }

  _startWalk(p, goal, state) {
    if (!this._findPath(p, p.cell, goal)) return false;
    p.state = state; p.next = p.path[0]; p.t = 0;
    return true;
  }

  step(dt, env) {
    const w = this.world, n = w.size;
    const wantHome = env.isEvening || env.sheltering;
    for (let v = 0; v < this.count; v++) {
      const p = this.list[v];
      const target = p.state === INSIDE ? 0 : 1;
      this.visible[v] += (target - this.visible[v]) * Math.min(1, dt * 4);

      if (p.state === INSIDE) {
        if (!wantHome && env.hour > 6.2 + v * 0.2) { p.state = IDLE; p.timer = 0.4 + v * 0.8; }
        continue;
      }
      if (p.state === IDLE) {
        if (wantHome) {
          if (p.cell === w.door || !this._startWalk(p, w.door, HOME)) { p.state = INSIDE; }
          continue;
        }
        p.timer -= dt;
        if (p.timer > 0) continue;
        // Pick somewhere nearby to stroll to.
        const ci = Math.floor(p.cell / n), cj = p.cell % n;
        let started = false;
        for (let attempt = 0; attempt < 8 && !started; attempt++) {
          const goal = w.walkCells[Math.floor(this.rng() * w.walkCells.length)];
          const gi = Math.floor(goal / n), gj = goal % n;
          if (Math.abs(gi - ci) + Math.abs(gj - cj) > 14) continue;
          started = this._startWalk(p, goal, WALK);
        }
        if (!started) p.timer = 1;
        continue;
      }
      // WALK or HOME
      p.t += dt * SPEED;
      while (p.t >= 1) {
        p.t -= 1;
        p.cell = p.next;
        p.at++;
        if (p.at >= p.len) {
          p.t = 0;
          if (p.state === HOME) p.state = INSIDE;
          else { p.state = IDLE; p.timer = 1 + this.rng() * 4; }
          break;
        }
        if (p.state === WALK && wantHome) { // turn back at the next cell
          p.t = 0;
          if (!this._startWalk(p, w.door, HOME)) p.state = INSIDE;
          break;
        }
        p.next = p.path[p.at];
      }
      if (p.state === IDLE || p.state === INSIDE) p.next = p.cell;
      this._place(v, p);
    }
  }
}
