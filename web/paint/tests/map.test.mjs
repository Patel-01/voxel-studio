// Checks for the terrain rules. Run: node tests/map.test.mjs

import assert from 'node:assert/strict';
import { PaintMap } from '../src/map.js';
import { N, WATER, GRASS, MOUNTAIN, SAND, FOREST, TOWN, SNOW_LINE, MAX_HEIGHT } from '../src/config.js';

const map = new PaintMap(N);
assert.ok(map.height.every((h) => h === 0), 'an empty map is flat water');

assert.equal(map.paint(28, 28, 10, GRASS), true, 'painting changes the map');
assert.equal(map.paint(28, 28, 10, GRASS), false, 'repainting the same thing changes nothing');
const centre = map.height[map.index(28, 28)], edge = map.height[map.index(28, 19)];
assert.ok(edge >= 1 && centre > edge, `land rises away from the shore (${edge} -> ${centre})`);
assert.equal(map.height[map.index(2, 2)], 0, 'untouched cells stay water');

map.paint(28, 28, 8, MOUNTAIN);
const peak = map.height[map.index(28, 28)], foot = map.height[map.index(28, 21)];
assert.ok(peak > foot + 4, `mountains peak in the middle (${foot} -> ${peak})`);
assert.ok(peak <= MAX_HEIGHT, 'heights are capped');
assert.equal(map.snow[map.index(28, 28)], peak >= SNOW_LINE ? 1 : 0, 'snow follows the snow line');
assert.equal(map.snow[map.index(28, 21)], 0, 'foothills have no snow');

map.paint(28, 28, 3, WATER);
assert.equal(map.height[map.index(28, 28)], 0, 'water can be painted back in (a crater lake)');
assert.ok(map.height[map.index(28, 23)] < peak, 'the peak drops when its middle is removed');

map.paint(10, 10, 3, SAND);
assert.equal(map.height[map.index(10, 10)], 1, 'sand is always one block high');

map.paint(0, 0, 4, GRASS);
assert.ok(map.height[map.index(0, 0)] >= 1, 'painting at the edge works');

const saved = map.serialize();
const copy = new PaintMap(N);
assert.equal(copy.restore(saved), true, 'a saved map restores');
assert.deepEqual(Array.from(copy.height), Array.from(map.height), 'restored terrain is identical');
assert.equal(copy.restore('nonsense'), false, 'bad saves are refused');
assert.equal(copy.restore(saved.slice(1) + '9'), false, 'unknown biomes are refused');

const island = new PaintMap(N);
island.generate(4);
const seen = new Set(island.biome);
for (const b of [WATER, SAND, GRASS, FOREST, MOUNTAIN, TOWN]) assert.ok(seen.has(b), `generated island has biome ${b}`);
const again = new PaintMap(N);
again.generate(4);
assert.deepEqual(Array.from(again.biome), Array.from(island.biome), 'generation is repeatable for a seed');

map.clear();
assert.ok(map.height.every((h) => h === 0), 'clear returns to open water');

console.log('map checks passed');
