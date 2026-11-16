// Building definitions: rules, economy numbers, and voxel models as plain box lists.
// A box is { p: [x, y, z] centre, s: [w, h, d] size, c: colour }. One cell = 1 unit;
// y = 0 is the ground. Models face +z (the "front"). No rendering code here.

const box = (x, y, z, w, h, d, c) => ({ p: [x, y + h / 2, z], s: [w, h, d], c });

const C = {
  asphalt: 0x4c515b, kerb: 0xcfcabd, line: 0xf1e9d2, wood: 0x9a7b55, rail: 0xece5d3, stone: 0xb7bbc2,
  glass: 0x5f7389, lit: 0xffd98a, door: 0x6b4a34, trunk: 0x7a5236, sandPath: 0xe6d4a6,
};
const WALLS = [0xf6ecd6, 0xdce9f2, 0xf5dcd6, 0xdcefdd];
const ROOFS = [0xc8553d, 0x3f6f8f, 0x8a5a3c];
const TOWER = [0xe9e4da, 0xd6e2ea, 0xeadfce];
const AWNING = [0x2f9e8f, 0xe0a030, 0xd65a6a];
const LEAF = [[0x5fb062, 0x79c46c], [0x4f9d5b, 0x6bb862], [0x3f8a5c, 0x57a069]];

export const DIR = { N: 1, E: 2, S: 4, W: 8 };
const EDGES = [
  [DIR.N, 0, -0.45, 1, 0.1], [DIR.S, 0, 0.45, 1, 0.1], [DIR.E, 0.45, 0, 0.1, 1], [DIR.W, -0.45, 0, 0.1, 1],
];
const ARMS = [[DIR.N, 0, -0.3, 0.07, 0.22], [DIR.S, 0, 0.3, 0.07, 0.22], [DIR.E, 0.3, 0, 0.22, 0.07], [DIR.W, -0.3, 0, 0.22, 0.07]];

// mask: which neighbours are also road (bitwise DIR).
export function roadParts(mask) {
  const parts = [box(0, 0, 0, 1, 0.04, 1, C.asphalt)];
  for (const [bit, x, z, w, d] of EDGES) if (!(mask & bit)) parts.push(box(x, 0, z, w, 0.055, d, C.kerb));
  for (const [bit, x, z, w, d] of ARMS) if (mask & bit) parts.push(box(x, 0.04, z, w, 0.006, d, C.line));
  return parts;
}

export function bridgeParts(mask) {
  const parts = [box(0, -0.08, 0, 1, 0.12, 1, C.wood), box(0, 0.04, 0, 0.7, 0.004, 0.7, 0xa98a62),
    box(0, -0.62, 0, 0.26, 0.54, 0.26, C.stone)];
  for (const [bit, x, z, w, d] of EDGES) if (!(mask & bit)) parts.push(box(x, 0.04, z, Math.max(w, 0.07), 0.2, Math.max(d, 0.07), C.rail));
  return parts;
}

function smallTree(x, z, v, scale = 1) {
  const [a, b] = LEAF[v % 3];
  return [box(x, 0, z, 0.12 * scale, 0.28 * scale, 0.12 * scale, C.trunk),
    box(x, 0.24 * scale, z, 0.5 * scale, 0.4 * scale, 0.5 * scale, a),
    box(x, 0.64 * scale, z, 0.3 * scale, 0.22 * scale, 0.3 * scale, b)];
}

export const DEFS = {
  road: {
    name: 'Road', cat: 'road', size: [1, 1], cost: 5, upkeep: 0.02, terrain: 'land', paint: true, height: 0.1,
    swatch: [C.asphalt, C.kerb], blurb: 'Connects buildings. Drag to lay several.',
    parts: () => roadParts(0),
  },
  bridge: {
    name: 'Bridge', cat: 'road', size: [1, 1], cost: 25, upkeep: 0.1, terrain: 'water', paint: true, height: 0.3,
    swatch: [C.wood, C.rail], blurb: 'A road over water.',
    parts: () => bridgeParts(0),
  },
  house: {
    name: 'House', cat: 'home', size: [1, 1], cost: 40, upkeep: 0.1, terrain: 'land', needsRoad: true,
    capacity: 4, power: 1, variants: 12, height: 0.8, swatch: [ROOFS[0], WALLS[0]], blurb: 'Home for 4.',
    parts: (v, lit) => [
      box(0, 0, 0, 0.72, 0.42, 0.62, WALLS[v % 4]),
      box(0, 0.42, 0, 0.8, 0.12, 0.7, ROOFS[v % 3]), box(0, 0.54, 0, 0.56, 0.12, 0.7, ROOFS[v % 3]),
      box(0, 0.66, 0, 0.3, 0.1, 0.7, ROOFS[v % 3]),
      box(0, 0, 0.315, 0.14, 0.24, 0.03, C.door),
      box(-0.22, 0.18, 0.315, 0.12, 0.12, 0.02, lit ? C.lit : C.glass), box(0.22, 0.18, 0.315, 0.12, 0.12, 0.02, lit ? C.lit : C.glass),
      box(0.2, 0.5, -0.15, 0.1, 0.32, 0.1, 0x8a8f98),
    ],
  },
  apartments: {
    name: 'Apartments', cat: 'home', size: [2, 2], cost: 180, upkeep: 0.6, terrain: 'land', needsRoad: true,
    capacity: 20, power: 5, variants: 3, height: 1.6, swatch: [0x7d8794, TOWER[0]], blurb: 'Homes for 20.',
    parts: (v, lit) => {
      const win = lit ? C.lit : C.glass;
      const parts = [box(0, 0, 0, 1.5, 1.25, 1.3, TOWER[v % 3]), box(0, 1.25, 0, 1.6, 0.08, 1.4, 0x7d8794),
        box(0.3, 1.33, -0.2, 0.4, 0.22, 0.4, 0x9aa3ad), box(0, 0, 0.655, 0.26, 0.3, 0.03, C.door)];
      for (const y of [0.42, 0.72, 1.0]) {
        parts.push(box(0, y, 0.655, 1.2, 0.14, 0.02, win), box(0, y, -0.655, 1.2, 0.14, 0.02, win),
          box(0.755, y, 0, 0.02, 0.14, 1.0, win), box(-0.755, y, 0, 0.02, 0.14, 1.0, win));
      }
      return parts;
    },
  },
  shop: {
    name: 'Shop', cat: 'work', size: [1, 1], cost: 90, upkeep: 0.5, terrain: 'land', needsRoad: true,
    jobs: 6, income: 0.9, power: 2, variants: 3, height: 0.7, swatch: [AWNING[0], 0xf2ead8], blurb: '6 jobs. Earns from shoppers.',
    parts: (v, lit) => [
      box(0, 0, 0, 0.78, 0.44, 0.64, 0xf2ead8), box(0, 0.44, 0, 0.84, 0.06, 0.7, 0x8f6b4f),
      box(0, 0.3, 0.38, 0.8, 0.06, 0.2, AWNING[v % 3]), box(0, 0.5, 0.2, 0.42, 0.16, 0.05, AWNING[v % 3]),
      box(-0.12, 0.08, 0.325, 0.4, 0.18, 0.02, lit ? C.lit : C.glass), box(0.26, 0, 0.325, 0.14, 0.26, 0.02, C.door),
    ],
  },
  workshop: {
    name: 'Workshop', cat: 'work', size: [2, 2], cost: 220, upkeep: 1.5, terrain: 'land', needsRoad: true,
    jobs: 16, income: 1.0, power: 8, joy: { radius: 3, amount: -12 }, height: 1.6,
    swatch: [0x8c93a0, 0xb5654a], blurb: '16 jobs. Neighbours dislike the smoke.',
    parts: (v, lit) => {
      const parts = [box(0, 0, 0, 1.6, 0.55, 1.2, 0xb5654a), box(0, 0, 0.61, 0.5, 0.34, 0.03, 0x4a4f58),
        box(0.6, 0.55, -0.35, 0.2, 0.9, 0.2, 0x9b5b45), box(0.6, 1.45, -0.35, 0.26, 0.08, 0.26, 0x3b3f46)];
      for (const x of [-0.5, 0, 0.5]) {
        parts.push(box(x, 0.55, 0, 0.5, 0.16, 1.2, 0x8c93a0), box(x - 0.12, 0.71, 0, 0.26, 0.12, 1.2, 0xa7aeb9));
      }
      for (const x of [-0.55, 0.55]) parts.push(box(x, 0.2, 0.61, 0.26, 0.16, 0.02, lit ? C.lit : C.glass));
      return parts;
    },
  },
  turbine: {
    name: 'Wind turbine', cat: 'power', size: [1, 1], cost: 150, upkeep: 1.0, terrain: 'land', supply: 30, height: 2.2,
    swatch: [0xf3f4f1, 0xd65a4a], blurb: 'Powers 30 units. No road needed.',
    parts: () => [box(0, 0, 0, 0.34, 0.08, 0.34, 0xb9bec6), box(0, 0.08, 0, 0.12, 1.45, 0.12, 0xf3f4f1),
      box(0, 1.48, 0.03, 0.18, 0.16, 0.34, 0xe7e9e4)],
    rotor: { at: [0, 1.56, 0.24], parts: [
      { p: [0, 0, 0], s: [0.08, 1.3, 0.04], c: 0xf7f7f3 }, { p: [0, 0, 0], s: [1.3, 0.08, 0.04], c: 0xf7f7f3 },
      { p: [0, 0, 0.02], s: [0.16, 0.16, 0.08], c: 0xd65a4a }] },
  },
  tree: {
    name: 'Tree', cat: 'nature', size: [1, 1], cost: 4, upkeep: 0, terrain: 'land', paint: true, sway: true,
    joy: { radius: 2, amount: 2 }, variants: 9, height: 0.9, swatch: [LEAF[0][1], LEAF[0][0]], blurb: 'A little joy nearby.',
    parts: (v) => {
      const ox = ((v * 37) % 5 - 2) * 0.05, oz = ((v * 53) % 5 - 2) * 0.05;
      if (v % 3 === 2) { // pine
        return [box(ox, 0, oz, 0.12, 0.22, 0.12, C.trunk), box(ox, 0.2, oz, 0.6, 0.2, 0.6, 0x3f8a5c),
          box(ox, 0.4, oz, 0.44, 0.2, 0.44, 0x4a9a66), box(ox, 0.6, oz, 0.26, 0.24, 0.26, 0x57a973)];
      }
      return smallTree(ox, oz, v, 1 + (v % 2) * 0.12);
    },
  },
  park: {
    name: 'Park', cat: 'nature', size: [2, 2], cost: 70, upkeep: 0.4, terrain: 'land',
    joy: { radius: 4, amount: 12 }, height: 0.9, swatch: [0xe86a92, 0x8fd07a], blurb: 'Lifts happiness around it.',
    parts: () => [box(0, 0, 0, 1.9, 0.04, 1.9, 0x8fd07a), box(0, 0.04, 0, 1.9, 0.015, 0.28, C.sandPath),
      box(0, 0.04, 0, 0.28, 0.015, 1.9, C.sandPath), box(0, 0.04, 0, 0.46, 0.08, 0.46, 0xe86a92),
      box(-0.55, 0.04, 0.55, 0.5, 0.025, 0.4, 0x4fb3e6), box(0.55, 0.04, -0.52, 0.4, 0.1, 0.12, C.wood),
      ...smallTree(-0.6, -0.6, 0, 0.9), ...smallTree(0.6, 0.58, 1, 0.8)],
  },
  fountain: {
    name: 'Fountain', cat: 'nature', size: [1, 1], cost: 30, upkeep: 0.2, terrain: 'land',
    joy: { radius: 3, amount: 6 }, height: 0.6, swatch: [0x4fb3e6, C.stone], blurb: 'A pleasant little plaza.',
    parts: () => [box(0, 0, 0, 0.9, 0.03, 0.9, 0xd8d2c4), box(0, 0.03, 0, 0.62, 0.14, 0.62, C.stone),
      box(0, 0.15, 0, 0.5, 0.04, 0.5, 0x4fb3e6), box(0, 0.17, 0, 0.12, 0.3, 0.12, C.stone), box(0, 0.47, 0, 0.2, 0.05, 0.2, 0x4fb3e6)],
  },
};

export const PALETTE = ['road', 'bridge', 'house', 'apartments', 'shop', 'workshop', 'turbine', 'tree', 'park', 'fountain'];
export const isRoad = (type) => type === 'road' || type === 'bridge';
