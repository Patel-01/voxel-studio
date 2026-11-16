// Economy simulation: road networks, power, jobs, happiness, growth and money.
// `analyse` only measures (safe to call any time); `tick` advances one day.

import { ECON } from './config.js';
import { DEFS, isRoad } from './buildings.js';
import { footprint } from './grid.js';

const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

// Label each road cell with the id of the connected network it belongs to.
export function roadNetworks(grid) {
  const n = grid.size, net = new Int32Array(n * n);
  let count = 0;
  const stack = [];
  for (let start = 0; start < n * n; start++) {
    if (net[start] || !isRoad(grid.typeAt(start % n, Math.floor(start / n)))) continue;
    net[start] = ++count;
    stack.push(start);
    while (stack.length) {
      const c = stack.pop(), x = c % n, z = Math.floor(c / n);
      for (const [dx, dz] of DIRS) {
        const nx = x + dx, nz = z + dz, ni = nz * n + nx;
        if (!grid.inside(nx, nz) || net[ni] || !isRoad(grid.typeAt(nx, nz))) continue;
        net[ni] = count;
        stack.push(ni);
      }
    }
  }
  return { net, count };
}

const centre = (b) => { const [w, d] = DEFS[b.type].size; return [b.x + w / 2, b.z + d / 2, Math.max(w, d) / 2]; };

export function analyse(game) {
  const grid = game.grid;
  const { net, count } = roadNetworks(grid);
  const jobs = new Float64Array(count + 1), pops = new Float64Array(count + 1);
  let supply = 0, demand = 0, upkeep = 0, roads = 0;
  const homes = [], works = [], moods = [];

  for (const b of grid.buildings.values()) {
    const def = DEFS[b.type];
    upkeep += def.upkeep;
    if (isRoad(b.type)) { roads++; continue; }
    b.net = 0;
    if (def.needsRoad) {
      for (const [cx, cz] of footprint(b.type, b.x, b.z, b.rot)) {
        for (const [dx, dz] of DIRS) {
          const nx = cx + dx, nz = cz + dz;
          if (!grid.inside(nx, nz)) continue;
          const id = net[nz * grid.size + nx];
          if (id && (!b.net || id < b.net)) b.net = id;
        }
      }
    }
    b.road = !def.needsRoad || b.net > 0;
    if (def.supply) supply += def.supply;
    if (def.power && b.road) demand += def.power;
    if (def.jobs) { works.push(b); if (b.road) jobs[b.net] += def.jobs; }
    if (def.capacity) { homes.push(b); if (b.road) pops[b.net] += b.pop; }
    if (def.joy) moods.push(b);
  }
  const power = demand === 0 ? 1 : Math.min(1, supply / demand);

  let population = 0, capacity = 0, joySum = 0, joyHomes = 0, totalJobs = 0;
  for (const b of works) { b.powered = power >= 1; if (b.road) totalJobs += DEFS[b.type].jobs; }
  for (const b of homes) {
    const def = DEFS[b.type];
    b.powered = power >= 1;
    const [hx, hz, hr] = centre(b);
    let nice = 0, nasty = 0;
    for (const m of moods) {
      const [mx, mz, mr] = centre(m);
      const { radius, amount } = DEFS[m.type].joy;
      if (Math.max(Math.abs(mx - hx), Math.abs(mz - hz)) > radius + hr + mr - 0.5) continue;
      if (amount > 0) nice += amount; else nasty += amount;
    }
    const employed = b.road ? Math.min(1, jobs[b.net] / Math.max(1, pops[b.net])) : 0;
    let joy = ECON.baseJoy + Math.min(30, nice) + Math.max(-30, nasty) + (employed * 20 - 10);
    if (!b.road) joy -= 25;
    if (power < 1) joy -= 15 * (1 - power) + 5;
    b.joy = Math.max(0, Math.min(100, Math.round(joy)));
    b.employed = employed;
    population += b.pop; capacity += def.capacity;
    joySum += b.joy * Math.max(1, b.pop); joyHomes += Math.max(1, b.pop);
  }

  game.stats = {
    ...game.stats, population, capacity, jobs: totalJobs, supply, demand, upkeep, roads,
    happiness: joyHomes ? Math.round(joySum / joyHomes) : 60,
    homes: homes.length, unroaded: homes.concat(works).filter((b) => !b.road).length, powerShort: power < 1 && demand > 0,
  };
  return { jobs, pops, power, homes, works };
}

export function tick(game) {
  const { jobs, pops, power, homes, works } = analyse(game);

  // Homes fill while they have a road, power, a decent mood and jobs on their network.
  for (const b of homes) {
    const cap = DEFS[b.type].capacity;
    const room = pops[b.net] < jobs[b.net] * ECON.jobSlack + 4;
    if (b.road && power >= 1 && b.joy >= 40 && room && b.pop < cap) {
      const grow = Math.min(cap - b.pop, Math.max(1, Math.round(cap * 0.08)));
      b.pop += grow; pops[b.net] += grow;
    } else if ((!b.road || b.joy < 25) && b.pop > 0) {
      const leave = Math.min(b.pop, Math.max(1, Math.round(cap * 0.1)));
      b.pop -= leave; if (b.road) pops[b.net] -= leave;
    }
  }

  let income = 0;
  for (const b of homes) income += b.pop * ECON.tax * (0.5 + 0.5 * (b.employed || 0));
  for (const b of works) {
    if (!b.road) continue;
    const def = DEFS[b.type];
    const staffed = Math.min(1, pops[b.net] / Math.max(1, jobs[b.net]));
    income += def.jobs * staffed * def.income * power;
  }
  analyse(game);
  const net = income - game.stats.upkeep;
  game.money += net;
  game.ticks++;
  game.stats.income = income;
  game.stats.net = net;
}
