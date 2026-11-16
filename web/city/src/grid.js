// The world grid: terrain per cell, which building occupies each cell, and the building list.

import { TERRAIN } from './config.js';
import { DEFS } from './buildings.js';

// Cells covered by a building of this type at (x, z). Rotation swaps width and depth.
export function footprint(type, x, z, rot = 0) {
  const [w, d] = DEFS[type].size;
  const fw = rot % 2 ? d : w, fd = rot % 2 ? w : d;
  const cells = [];
  for (let dz = 0; dz < fd; dz++) for (let dx = 0; dx < fw; dx++) cells.push([x + dx, z + dz]);
  return cells;
}

export class WorldGrid {
  constructor(size, terrain) {
    this.size = size;
    this.terrain = terrain;
    this.occ = new Int32Array(size * size); // building id per cell, 0 = empty
    this.buildings = new Map();
    this.nextId = 1;
  }

  inside(x, z) { return x >= 0 && z >= 0 && x < this.size && z < this.size; }
  terrainAt(x, z) { return this.inside(x, z) ? this.terrain[z * this.size + x] : TERRAIN.WATER; }
  idAt(x, z) { return this.inside(x, z) ? this.occ[z * this.size + x] : 0; }
  buildingAt(x, z) { return this.buildings.get(this.idAt(x, z)) || null; }
  typeAt(x, z) { const b = this.buildingAt(x, z); return b ? b.type : null; }

  _stamp(b, id) { for (const [x, z] of footprint(b.type, b.x, b.z, b.rot)) this.occ[z * this.size + x] = id; }

  add(type, x, z, rot = 0, pop = 0, id = 0) {
    const b = { id: id || this.nextId, type, x, z, rot, pop, road: false, powered: false, joy: 0, net: 0 };
    this.nextId = Math.max(this.nextId, b.id + 1);
    this.buildings.set(b.id, b);
    this._stamp(b, b.id);
    return b;
  }

  remove(id) {
    const b = this.buildings.get(id);
    if (!b) return null;
    this._stamp(b, 0);
    this.buildings.delete(id);
    return b;
  }

  // Lift a building off the grid, change it, and put it back.
  relocate(id, x, z, rot) {
    const b = this.buildings.get(id);
    this._stamp(b, 0);
    b.x = x; b.z = z; b.rot = rot;
    this._stamp(b, id);
    return b;
  }
}
