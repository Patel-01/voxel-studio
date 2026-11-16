// The static island: block grid plus the lookups the simulation and renderer need.
// Grid axes: i (east), j (north), h (up). Scene axes: x = i - size/2, y = h, z = j - size/2.

export const K = {
  AIR: 0, STONE: 1, SOIL: 2, GRASS: 3, SAND: 4, WATER: 5, SNOW: 6,
  TRUNK: 7, LEAVES: 8, CABIN: 9, ROOF: 10, WINDOW: 11,
};
export const KIND_COUNT = 12;
const GROUND = new Set([K.STONE, K.SOIL, K.GRASS, K.SAND, K.SNOW]);

function decodeBase64(text) {
  if (typeof atob === 'function') {
    const raw = atob(text);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }
  return new Uint8Array(Buffer.from(text, 'base64'));
}

export class World {
  constructor(data) {
    this.seed = data.seed;
    this.size = data.size;
    this.depth = data.depth;
    this.waterLevel = data.waterLevel;
    this.palettes = data.palettes;
    this.leafAlt = data.leafAlt;
    this.blocks = decodeBase64(data.blocks);
    if (this.blocks.length !== this.size * this.size * this.depth) {
      throw new Error('World data is the wrong size. Re-run export_world.py.');
    }
    this.half = this.size / 2;
    this._scan();
  }

  get(i, j, h) {
    if (i < 0 || j < 0 || h < 0 || i >= this.size || j >= this.size || h >= this.depth) return K.AIR;
    return this.blocks[(i * this.size + j) * this.depth + h];
  }

  cellIndex(i, j) { return i * this.size + j; }
  sceneX(i) { return i + 0.5 - this.half; }
  sceneZ(j) { return j + 0.5 - this.half; }

  _scan() {
    const n = this.size;
    // walk[c] = height index of the ground block a villager can stand on, or -1.
    this.walk = new Int16Array(n * n).fill(-1);
    this.grassCells = [];   // open grass tops, for flora
    this.crowns = [];       // tree tops, for roosting birds and falling leaves
    this.walkCells = [];
    let wx = 0, wz = 0, wy = 0, windows = 0;

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        let top = -1, lowestLeaf = 999, highestLeaf = -1, hasTrunk = false, built = false;
        for (let h = this.depth - 1; h >= 0; h--) {
          const k = this.get(i, j, h);
          if (k === K.AIR || k === K.WATER) continue;
          if (k === K.LEAVES) { lowestLeaf = h; if (highestLeaf < 0) highestLeaf = h; continue; }
          if (k === K.TRUNK) { hasTrunk = true; continue; }
          if (k === K.CABIN || k === K.ROOF || k === K.WINDOW) {
            built = true;
            if (k === K.WINDOW) { wx += i; wz += j; wy = h; windows++; }
            continue;
          }
          if (GROUND.has(k)) { top = h; break; }
        }
        if (hasTrunk && highestLeaf >= 0) this.crowns.push({ i, j, h: highestLeaf + 1 });
        const dry = top >= this.waterLevel;
        const headroom = lowestLeaf - top >= 3;
        if (top >= 0 && dry && !hasTrunk && !built && headroom) {
          this.walk[this.cellIndex(i, j)] = top;
          this.walkCells.push(this.cellIndex(i, j));
          if (this.get(i, j, top) === K.GRASS && lowestLeaf === 999) this.grassCells.push({ i, j, h: top });
        }
      }
    }

    this.cabin = windows ? { i: wx / windows, j: wz / windows, h: wy } : null;
    // Door: the walkable cell nearest the cabin.
    this.door = this.walkCells[0] ?? -1;
    if (this.cabin) {
      let best = Infinity;
      for (const c of this.walkCells) {
        const i = Math.floor(c / n), j = c % n;
        const d = (i - this.cabin.i) ** 2 + (j - this.cabin.j) ** 2;
        if (d < best) { best = d; this.door = c; }
      }
    }
  }
}
