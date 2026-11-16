// Headless checks for the city game's rules (no browser).  node tests/city.test.mjs

import assert from 'node:assert/strict';
import { ECON, GRID, SAVE_KEY, TERRAIN } from '../src/config.js';
import { DEFS } from '../src/buildings.js';
import { roadNetworks, tick } from '../src/economy.js';
import { Game } from '../src/game.js';
import { clearSave, loadSave, saveGame } from '../src/persistence.js';
import { buildStarterTown } from '../src/starter.js';

const game = new Game();
const grid = game.grid;
const find = (pred) => { for (let z = 0; z < GRID; z++) for (let x = 0; x < GRID; x++) if (pred(x, z)) return [x, z]; throw new Error('no cell'); };
const isT = (t) => (x, z) => grid.terrainAt(x, z) === t;
const grassBlock = (w) => find((x, z) => { for (let dz = 0; dz < w; dz++) for (let dx = 0; dx < w + 4; dx++) if (grid.terrainAt(x + dx, z + dz) !== TERRAIN.GRASS) return false; return true; });

// Terrain has everything the game needs.
const counts = [0, 0, 0];
for (const t of game.terrain) counts[t]++;
assert.ok(counts[TERRAIN.GRASS] > 250, `plenty of grass (${counts[TERRAIN.GRASS]})`);
assert.ok(counts[TERRAIN.WATER] > 100 && counts[TERRAIN.SAND] > 40, 'water and shores');

// Placement rules.
const [gx, gz] = grassBlock(3);
const [wx, wz] = find(isT(TERRAIN.WATER));
assert.equal(game.check('house', wx, wz, 0).reason, 'Needs dry land');
assert.equal(game.check('bridge', gx, gz, 0).reason, 'Bridges go over water');
assert.equal(game.check('house', -1, 0, 0).reason, 'Outside the island');
assert.ok(game.check('bridge', wx, wz, 0).ok, 'bridge on water');

const start = game.money;
const house = game.place('house', gx, gz, 0);
assert.ok(house.ok && game.money === start - DEFS.house.cost, 'placing charges the cost');
assert.equal(game.check('house', gx, gz, 0).reason, 'Already built here');
assert.equal(game.check('road', gx, gz, 0).reason, 'Space is taken', 'painting never replaces a building');

// Replace: a shop swaps a house it fully covers, with a refund.
const swap = game.check('shop', gx, gz, 0);
assert.ok(swap.ok && swap.replace.length === 1 && swap.cost === DEFS.shop.cost - 20, 'replace costs the difference');
game.place('shop', gx, gz, 0);
assert.equal(grid.buildingAt(gx, gz).type, 'shop');
assert.equal(grid.buildings.size, 1);

// Trees give way to anything; moving and rotating keep the grid consistent.
game.place('tree', gx + 2, gz, 0);
assert.ok(game.place('road', gx + 2, gz, 0).ok, 'roads clear trees');
const shop = grid.buildingAt(gx, gz);
assert.ok(game.move(shop.id, gx + 1, gz + 1, 1).ok, 'move');
assert.equal(grid.idAt(gx, gz), 0, 'old cell freed');
assert.equal(grid.idAt(gx + 1, gz + 1), shop.id, 'new cell taken');
assert.equal(game.move(shop.id, gx + 2, gz, 0).ok, false, 'cannot move onto a road');
assert.ok(game.rotate(shop.id).ok && shop.rot === 2, 'rotate');
const before = game.money;
assert.ok(game.remove(shop.id).ok && game.money === before + 45, 'removal refunds half');
assert.equal(grid.idAt(gx + 1, gz + 1), 0);
const park = game.place('park', gx + 4, gz, 0).building;
assert.equal(game.check('apartments', gx + 5, gz, 0).reason, 'Space is taken', 'partial overlap is refused');
assert.ok(game.check('apartments', gx + 4, gz, 0).ok, 'a full-cover swap is allowed');
game.remove(park.id);

// Not enough money.
game.money = 10;
assert.match(game.check('house', gx, gz, 0).reason, /^Need \$30 more$/);

// Economy: homes need a road, power and jobs.
const g = new Game();
const [bx, bz] = (() => { for (let z = 2; z < GRID - 4; z++) for (let x = 2; x < GRID - 8; x++) { let ok = true; for (let dz = 0; dz < 4 && ok; dz++) for (let dx = 0; dx < 8; dx++) if (g.grid.terrainAt(x + dx, z + dz) !== TERRAIN.GRASS) { ok = false; break; } if (ok) return [x, z]; } throw new Error('no block'); })();
const days = (k) => { for (let d = 0; d < k; d++) tick(g); };
const h1 = g.place('house', bx, bz, 0).building;
days(10);
assert.equal(h1.pop, 0, 'no road: nobody moves in');
for (let x = bx; x < bx + 6; x++) g.place('road', x, bz + 1, 0);
days(10);
assert.equal(h1.pop, 0, 'road but no power: still empty');
assert.ok(g.stats.powerShort, 'power shortage reported');
g.place('turbine', bx + 6, bz + 2, 0);
days(10);
assert.equal(h1.pop, 4, 'road and power: the first home fills (4 free settlers)');
for (let x = bx + 1; x < bx + 5; x++) g.place('house', x, bz, 0);
days(20);
assert.ok(g.stats.population < 12, `without jobs growth stalls (${g.stats.population})`);
g.place('shop', bx, bz + 2, 0); g.place('shop', bx + 1, bz + 2, 0); g.place('shop', bx + 2, bz + 2, 0);
days(20);
assert.equal(g.stats.population, 20, 'jobs let every home fill');
assert.ok(g.stats.net > 0, `a working town earns money (${g.stats.net.toFixed(1)}/day)`);
const joyBefore = g.stats.happiness;
g.place('park', bx + 3, bz + 2, 0);
days(1);
assert.ok(g.stats.happiness > joyBefore, 'a park raises happiness');
g.place('workshop', bx + 6, bz - 1 < 0 ? bz : bz, 0);

// Road networks: cutting a road disconnects the far side.
assert.equal(roadNetworks(g.grid).count, 1);
g.remove(g.grid.idAt(bx + 2, bz + 1));
assert.equal(roadNetworks(g.grid).count, 2, 'removing a road splits the network');

// Pause and speed.
const t0 = g.ticks;
g.togglePause(); assert.equal(g.update(10), 0, 'paused: no days pass');
g.setSpeed(2); assert.equal(g.paused, false);
assert.equal(g.update(ECON.tickSeconds / 4 + 1e-9), 1, '4x: a day passes in a quarter of the time');
assert.equal(g.ticks, t0 + 1);

// Save and load round-trip through a fake storage.
const fake = { data: {}, setItem(k, v) { this.data[k] = v; }, getItem(k) { return this.data[k] ?? null; }, removeItem(k) { delete this.data[k]; } };
assert.equal(loadSave(fake), null, 'nothing saved yet');
assert.ok(saveGame(g, fake));
const restored = new Game();
assert.equal(restored.restore(loadSave(fake)), 0, 'nothing dropped');
assert.deepEqual(restored.serialize(), g.serialize(), 'restored city is identical');
assert.deepEqual([...restored.grid.occ], [...g.grid.occ], 'occupancy matches');
assert.equal(restored.stats.population, g.stats.population);

// Corrupt or stale saves are ignored or cleaned, never fatal.
fake.data[SAVE_KEY] = '{not json';
assert.equal(loadSave(fake), null);
fake.data[SAVE_KEY] = JSON.stringify({ version: 999, buildings: [] });
assert.equal(loadSave(fake), null);
const bad = new Game();
const dropped = bad.restore({ money: 100, buildings: [[1, 'house', wx, wz, 0, 4], [2, 'nope', 1, 1, 0, 0], [3, 'house', gx, gz, 0, 99], [3, 'house', gx + 1, gz, 0, 0]] });
assert.equal(dropped, 3, 'invalid entries dropped');
assert.equal(bad.grid.buildings.get(3).pop, 4, 'population clamped to capacity');
clearSave(fake);
assert.equal(loadSave(fake), null);

// Starter town is legal, populated and solvent.
const s = new Game();
buildStarterTown(s);
const types = {};
for (const b of s.grid.buildings.values()) types[b.type] = (types[b.type] || 0) + 1;
assert.ok(types.road > 25 && types.bridge >= 1 && types.house >= 15 && types.shop >= 3 && types.tree > 30, JSON.stringify(types));
assert.ok(s.stats.population >= 40, `starter population ${s.stats.population}`);
assert.equal(s.stats.unroaded, 0, 'every starter building reaches a road');
assert.equal(s.stats.powerShort, false, 'starter town has enough power');
assert.equal(s.money, ECON.starterMoney);
tick(s);
assert.ok(s.stats.net > 0, `starter town earns (${s.stats.net.toFixed(1)}/day)`);
console.log('starter town:', JSON.stringify(types), 'pop', s.stats.population, 'happy', s.stats.happiness, 'net', s.stats.net.toFixed(1));

console.log('city checks passed');
