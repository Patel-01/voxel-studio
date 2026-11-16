// The painted map and the terrain it implies. Pure data: no DOM, no rendering.
// Each cell holds a biome; heights are derived so that land rises away from water
// and mountains peak in the middle of whatever shape was painted.

import { WATER, SAND, GRASS, FOREST, MOUNTAIN, TOWN, SNOW_LINE, MAX_HEIGHT } from './config.js';

export function hash3(x, y = 0, z = 0) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// Smooth value noise in [0, 1).
function noise(x, z, seed) {
  const x0 = Math.floor(x), z0 = Math.floor(z);
  const fx = x - x0, fz = z - z0;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = hash3(x0, z0, seed), b = hash3(x0 + 1, z0, seed), c = hash3(x0, z0 + 1, seed), d = hash3(x0 + 1, z0 + 1, seed);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}

export class PaintMap {
  constructor(n) {
    this.n = n;
    this.biome = new Uint8Array(n * n);      // all water
    this.height = new Int16Array(n * n);     // target column heights (0 = water)
    this.snow = new Uint8Array(n * n);
    this._dist = new Int16Array(n * n);
    this._queue = new Int32Array(n * n);
    this.recompute();
  }

  index(x, z) { return z * this.n + x; }

  // Paint a disc. Returns true if anything changed.
  paint(cx, cz, radius, biome) {
    const n = this.n, r2 = (radius - 0.5) * (radius - 0.5);
    let changed = false;
    for (let z = Math.max(0, Math.floor(cz - radius)); z <= Math.min(n - 1, Math.ceil(cz + radius)); z++) {
      for (let x = Math.max(0, Math.floor(cx - radius)); x <= Math.min(n - 1, Math.ceil(cx + radius)); x++) {
        if ((x - cx) * (x - cx) + (z - cz) * (z - cz) > r2) continue;
        const i = z * n + x;
        if (this.biome[i] !== biome) { this.biome[i] = biome; changed = true; }
      }
    }
    if (changed) this.recompute();
    return changed;
  }

  clear() { this.biome.fill(WATER); this.recompute(); }

  // Distance (in cells, 4-neighbour) from every cell to the nearest cell where inside(i) is false.
  // The world's edge counts as "outside".
  _distance(inside) {
    const n = this.n, dist = this._dist, queue = this._queue;
    let head = 0, tail = 0;
    for (let i = 0; i < n * n; i++) {
      if (!inside(i)) { dist[i] = 0; queue[tail++] = i; } else dist[i] = -1;
    }
    for (let i = 0; i < n * n; i++) {
      if (dist[i] !== -1) continue;
      const x = i % n, z = (i / n) | 0;
      if (x === 0 || z === 0 || x === n - 1 || z === n - 1) { dist[i] = 1; queue[tail++] = i; }
    }
    while (head < tail) {
      const i = queue[head++], x = i % n, d = dist[i] + 1;
      if (x > 0 && dist[i - 1] === -1) { dist[i - 1] = d; queue[tail++] = i - 1; }
      if (x < n - 1 && dist[i + 1] === -1) { dist[i + 1] = d; queue[tail++] = i + 1; }
      if (i >= n && dist[i - n] === -1) { dist[i - n] = d; queue[tail++] = i - n; }
      if (i < n * n - n && dist[i + n] === -1) { dist[i + n] = d; queue[tail++] = i + n; }
    }
    return dist;
  }

  recompute() {
    const n = this.n, biome = this.biome, height = this.height;
    // Pass 1: gentle rise away from the shore.
    const shore = this._distance((i) => biome[i] !== WATER);
    for (let i = 0; i < n * n; i++) {
      const b = biome[i];
      if (b === WATER) { height[i] = 0; continue; }
      if (b === SAND) { height[i] = 1; continue; }
      const x = i % n, z = (i / n) | 0;
      let h = 1 + Math.min(3, Math.floor((shore[i] - 1) / 3));
      if ((b === GRASS || b === FOREST) && shore[i] > 2 && noise(x / 5, z / 5, 7) > 0.66) h += 1;
      height[i] = h;
    }
    // Pass 2: mountains climb toward the middle of the painted mountain area.
    const ridge = this._distance((i) => biome[i] === MOUNTAIN);
    for (let i = 0; i < n * n; i++) {
      this.snow[i] = 0;
      if (biome[i] !== MOUNTAIN) continue;
      const x = i % n, z = (i / n) | 0, d = ridge[i];
      const rough = (noise(x / 3, z / 3, 19) - 0.35) * 2.4 * Math.min(1, d / 2);
      const h = Math.min(MAX_HEIGHT, Math.round(height[i] + 1 + d * 1.75 + rough));
      height[i] = h;
      if (h >= SNOW_LINE) this.snow[i] = 1;
    }
  }

  // A ready-made island, so the first visit is not an empty sea.
  generate(seed) {
    const n = this.n, c = (n - 1) / 2;
    for (let z = 0; z < n; z++) {
      for (let x = 0; x < n; x++) {
        const dx = (x - c) / c, dz = (z - c) / c;
        const fall = 1 - Math.pow(dx * dx + dz * dz, 0.9);
        const e = fall * 0.88 + (noise(x / 9, z / 9, seed) - 0.5) * 0.55 + (noise(x / 4, z / 4, seed + 1) - 0.5) * 0.2;
        const m = noise(x / 7, z / 7, seed + 2);
        let b = WATER;
        if (e > 0.66 && m > 0.5) b = MOUNTAIN;
        else if (e > 0.34) b = m < 0.42 ? FOREST : GRASS;
        else if (e > 0.27) b = SAND;
        this.biome[z * n + x] = b;
      }
    }
    // One town on the best patch of grass near the coast.
    let best = -1, bestScore = -1;
    for (let z = 5; z < n - 5; z++) {
      for (let x = 5; x < n - 5; x++) {
        let grass = 0, sea = 0;
        for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) {
          const b = this.biome[(z + dz) * n + x + dx];
          if (Math.abs(dx) <= 2 && Math.abs(dz) <= 2 && (b === GRASS || b === FOREST)) grass++;
          if (b === WATER) sea++;
        }
        const score = grass * 2 + Math.min(sea, 12) + hash3(x, z, seed) * 2;
        if (grass >= 20 && score > bestScore) { bestScore = score; best = z * n + x; }
      }
    }
    if (best >= 0) {
      const bx = best % n, bz = (best / n) | 0;
      for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) {
        const i = (bz + dz) * n + bx + dx;
        if (dx * dx + dz * dz <= 17 && this.biome[i] !== WATER && this.biome[i] !== SAND) this.biome[i] = TOWN;
      }
    }
    this.recompute();
  }

  serialize() { return Array.from(this.biome).join(''); }

  restore(text) {
    if (typeof text !== 'string' || text.length !== this.n * this.n || /[^0-5]/.test(text)) return false;
    for (let i = 0; i < text.length; i++) this.biome[i] = text.charCodeAt(i) - 48;
    this.recompute();
    return true;
  }
}
