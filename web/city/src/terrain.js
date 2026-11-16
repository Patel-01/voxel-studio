// Generates the island: grass, sandy shores, sea, and a river that splits the land
// so bridges matter. Deterministic for a given seed.

import { TERRAIN } from './config.js';
import { hash3 } from './rng.js';

function valueNoise(x, z, scale, seed) {
  const fx = x / scale, fz = z / scale;
  const x0 = Math.floor(fx), z0 = Math.floor(fz);
  const tx = fx - x0, tz = fz - z0;
  const sx = tx * tx * (3 - 2 * tx), sz = tz * tz * (3 - 2 * tz);
  const a = hash3(x0, z0, seed), b = hash3(x0 + 1, z0, seed);
  const c = hash3(x0, z0 + 1, seed), d = hash3(x0 + 1, z0 + 1, seed);
  return (a * (1 - sx) + b * sx) * (1 - sz) + (c * (1 - sx) + d * sx) * sz;
}

export function generateTerrain(size, seed) {
  const t = new Uint8Array(size * size);
  const c = (size - 1) / 2;
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      const r = Math.hypot((x - c) / c, (z - c) / c);
      const n = valueNoise(x, z, 6, seed) * 0.6 + valueNoise(x, z, 3, seed + 7) * 0.4;
      const land = 1 - r * r * 1.05 + (n - 0.5) * 0.55 > 0.2;
      const riverZ = c + Math.sin(x * 0.33 + seed) * 2.6 + (valueNoise(x, 0, 5, seed + 3) - 0.5) * 3;
      const river = Math.abs(z - riverZ) < 1.15;
      const edge = x === 0 || z === 0 || x === size - 1 || z === size - 1;
      t[z * size + x] = land && !river && !edge ? TERRAIN.GRASS : TERRAIN.WATER;
    }
  }
  // Land that touches water becomes sand.
  const out = t.slice();
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      if (t[z * size + x] !== TERRAIN.GRASS) continue;
      let shore = false;
      for (let dz = -1; dz <= 1 && !shore; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, nz = z + dz;
          if (nx < 0 || nz < 0 || nx >= size || nz >= size || t[nz * size + nx] === TERRAIN.WATER) { shore = true; break; }
        }
      }
      if (shore) out[z * size + x] = TERRAIN.SAND;
    }
  }
  return out;
}
