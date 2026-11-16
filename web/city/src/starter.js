// Lays out the starter town using the same placement rules as the player, so it
// can never produce an illegal city. Anything that doesn't fit is skipped.

import { ECON, TERRAIN } from './config.js';
import { tick } from './economy.js';
import { makeRng } from './rng.js';

export function buildStarterTown(game) {
  game.clear(1e9);
  const grid = game.grid, n = grid.size, mid = Math.floor(n / 2);
  const put = (type, x, z, rot = 0) => game.place(type, x, z, rot).ok;
  const water = (x, z) => grid.terrainAt(x, z) === TERRAIN.WATER;

  // Find the narrowest river crossing near the middle of the island.
  let best = null;
  for (let x = mid - 5; x <= mid + 5; x++) {
    let top = -1, bottom = -1;
    for (let z = mid - 7; z <= mid + 7; z++) if (water(x, z)) { if (top < 0) top = z; bottom = z; }
    if (top < 0) continue;
    const width = bottom - top + 1;
    if (!best || width < best.width || (width === best.width && Math.abs(x - mid) < Math.abs(best.x - mid))) best = { x, top, bottom, width };
  }
  const ax = best ? best.x : mid, top = best ? best.top : mid, bottom = best ? best.bottom : mid;
  const north = top - 4, south = bottom + 4;

  // Avenue across the river, with a street on each bank.
  for (let z = north - 4; z <= south + 3; z++) put(water(ax, z) ? 'bridge' : 'road', ax, z);
  for (let x = ax - 7; x <= ax + 7; x++) put('road', x, north);
  for (let x = ax - 6; x <= ax + 6; x++) put('road', x, south);

  put('turbine', ax - 9, north - 2); put('turbine', ax - 9, north + 1);
  put('park', ax + 1, north + 1); put('fountain', ax - 1, north + 1);
  put('shop', ax - 1, north - 1, 0); put('shop', ax + 1, north - 1, 0); put('shop', ax + 2, north - 1, 0);
  put('apartments', ax + 4, north - 2, 0);
  put('workshop', ax + 4, south + 1, 2); put('shop', ax - 1, south - 1, 0);
  for (let x = ax - 7; x <= ax - 2; x++) { put('house', x, north - 1, 0); if (x % 2) put('house', x, north + 1, 2); }
  for (let x = ax + 4; x <= ax + 7; x++) put('house', x, north + 1, 2);
  for (let x = ax - 6; x <= ax - 2; x++) { put('house', x, south - 1, 0); put('house', x, south + 1, 2); }
  for (let x = ax + 1; x <= ax + 3; x++) put('house', x, south - 1, 0);

  // Scatter trees over the remaining grass, thicker toward the edges.
  const rng = makeRng(77);
  for (let k = 0; k < 1100; k++) {
    const x = Math.floor(rng() * n), z = Math.floor(rng() * n);
    if (grid.terrainAt(x, z) !== TERRAIN.GRASS || grid.idAt(x, z)) continue;
    const nearTown = Math.abs(x - ax) < 9 && z > north - 4 && z < south + 4;
    if (rng() < (nearTown ? 0.14 : 0.6)) put('tree', x, z);
  }

  for (let d = 0; d < 40; d++) tick(game); // let people move in
  game.money = ECON.starterMoney;
  game.ticks = 0;
  game.stats.income = 0; game.stats.net = 0;
  game._changed('load');
}
