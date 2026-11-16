// Placement rules. Pure: decides whether something may go somewhere and what it costs.

import { ECON, TERRAIN } from './config.js';
import { DEFS } from './buildings.js';
import { footprint } from './grid.js';

// Returns { ok, reason, replace: [ids], cost }.
//   ignoreId: a building being moved (its own cells don't block it)
//   free:     moving costs nothing
export function validate(grid, type, x, z, rot, { ignoreId = 0, money = Infinity, free = false } = {}) {
  const def = DEFS[type];
  const cells = footprint(type, x, z, rot);
  const fail = (reason) => ({ ok: false, reason, replace: [], cost: 0 });

  for (const [cx, cz] of cells) {
    if (!grid.inside(cx, cz)) return fail('Outside the island');
    const water = grid.terrainAt(cx, cz) === TERRAIN.WATER;
    if (def.terrain === 'water' && !water) return fail('Bridges go over water');
    if (def.terrain === 'land' && water) return fail('Needs dry land');
  }

  // Anything already there must be replaceable as a whole.
  const inFootprint = new Set(cells.map(([cx, cz]) => cz * grid.size + cx));
  const replace = [];
  for (const [cx, cz] of cells) {
    const other = grid.buildingAt(cx, cz);
    if (!other || other.id === ignoreId || replace.includes(other.id)) continue;
    if (other.type === type) return fail(ignoreId ? 'Space is taken' : 'Already built here');
    const isTree = other.type === 'tree';
    // Painted things (roads, trees) and moves only clear trees; a deliberate single placement may swap a building it fully covers.
    const covers = footprint(other.type, other.x, other.z, other.rot).every(([ox, oz]) => inFootprint.has(oz * grid.size + ox));
    if (!isTree && (def.paint || ignoreId || !covers)) return fail('Space is taken');
    replace.push(other.id);
  }

  let refund = 0;
  for (const id of replace) refund += Math.floor(DEFS[grid.buildings.get(id).type].cost * ECON.refund);
  const cost = (free ? 0 : def.cost) - refund;
  if (cost > money) return { ok: false, reason: `Need $${Math.ceil(cost - money)} more`, replace: [], cost };
  return { ok: true, reason: '', replace, cost };
}
