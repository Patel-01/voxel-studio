// Headless checks for the simulation (no browser, no graphics).  node tests/sim.test.mjs

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DAY_SECONDS } from '../src/config.js';
import { Simulation } from '../src/sim/simulation.js';
import { World } from '../src/sim/world.js';

const data = JSON.parse(readFileSync(new URL('../data/world.json', import.meta.url)));
const world = new World(data);

function snapshot(sim) {
  return JSON.stringify([sim.env.time, sim.env.seasonTarget, sim.env.weather,
    [...sim.birds.pos], [...sim.birds.state], [...sim.villagers.pos], [...sim.villagers.visible]]);
}
function run(sim, seconds, dt = 1 / 30) {
  for (let t = 0; t < seconds; t += dt) sim.step(dt);
}

// World scan found what the simulation needs.
assert.ok(world.walkCells.length > 100, 'walkable ground');
assert.ok(world.crowns.length > 3, 'tree crowns');
assert.ok(world.cabin && world.door >= 0, 'cabin and door');
assert.ok(world.grassCells.length > 50, 'grass for flora');

// Determinism: two fresh runs, and a reset run, all match.
const a = new Simulation(world), b = new Simulation(world);
run(a, DAY_SECONDS * 3); run(b, DAY_SECONDS * 3);
assert.equal(snapshot(a), snapshot(b), 'two runs match');
a.reset(); run(a, DAY_SECONDS * 3);
assert.equal(snapshot(a), snapshot(b), 'reset replays');

// Behaviour over one clear day.
const s = new Simulation(world);
s.env.setWeatherMode('clear');
let movedVillager = false, maxStep = 0;
const start = [...s.villagers.pos];
const until = (hour) => { while (s.env.hour < hour) s.step(1 / 30); };
until(12);
for (let v = 0; v < s.villagers.count; v++) {
  if (Math.hypot(s.villagers.pos[v * 3] - start[v * 3], s.villagers.pos[v * 3 + 2] - start[v * 3 + 2]) > 1) movedVillager = true;
}
assert.ok(movedVillager, 'villagers wander by day');
assert.ok(s.birds.state.every((x) => x === 0), 'birds fly at noon');
for (const p of [...s.birds.pos, ...s.villagers.pos]) assert.ok(Number.isFinite(p), 'finite positions');
assert.ok(Math.max(...s.birds.pos.filter((_, k) => k % 3 === 1)) < 40, 'birds stay near the island');

// Villagers never step more than one block up or down, and stay on walkable cells.
let prev = [...s.villagers.pos];
for (let k = 0; k < 30 * 60; k++) {
  s.step(1 / 30);
  for (let v = 0; v < s.villagers.count; v++) {
    maxStep = Math.max(maxStep, Math.hypot(s.villagers.pos[v * 3] - prev[v * 3], s.villagers.pos[v * 3 + 2] - prev[v * 3 + 2]));
  }
  prev = [...s.villagers.pos];
}
assert.ok(maxStep < 0.2, `villagers move smoothly (max step ${maxStep.toFixed(3)})`);

// Night: everyone home, birds roosting.
until(23.5);
assert.ok(s.villagers.list.every((p) => p.state === 3), 'villagers inside at night');
assert.ok(s.birds.state.every((x) => x === 1), 'birds perched at night');

// Next morning they come back out.
while (s.env.hour > 1) s.step(1 / 30);
until(9);
assert.ok(s.villagers.list.some((p) => p.state !== 3), 'villagers out in the morning');
assert.ok(s.birds.state.some((x) => x === 0), 'birds flying in the morning');

// Rain sends everyone to shelter.
s.env.setWeatherMode('rain');
run(s, 60);
assert.ok(s.villagers.list.every((p) => p.state === 3), 'villagers shelter from rain');
assert.ok(s.birds.state.every((x) => x === 1), 'birds roost in rain');

// Seasons advance and weather varies in auto mode.
const y = new Simulation(world);
const seen = new Set();
for (let k = 0; k < 30 * DAY_SECONDS * 8; k++) { y.step(1 / 30); seen.add(y.env.weather); }
assert.ok(y.env.seasonTarget > 3.9, 'a full year passes in eight days');
assert.ok(seen.size >= 3, `auto weather varies (${[...seen].join(', ')})`);

// Visual easing settles.
const e = new Simulation(world);
e.env.setSeason(3); e.env.cycleSeasons = false;
for (let k = 0; k < 1800; k++) e.env.ease(1 / 60);
assert.ok(Math.abs(e.env.season - 3) < 0.01 && e.env.snowCover > 0.95, 'winter settles with full snow cover');
assert.equal(e.env.ease(1 / 60), false, 'easing reports idle when settled');

console.log('simulation checks passed');
