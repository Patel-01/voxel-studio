// Tunable numbers for the city game. No logic.

export const GRID = 30;
export const WORLD_SEED = 11;
export const TERRAIN = { WATER: 0, SAND: 1, GRASS: 2 };
export const LEVEL = { ground: 0, water: -0.2, seabed: -0.62, base: -1.1 };

export const ECON = {
  startMoney: 1500,
  starterMoney: 900,
  refund: 0.5,          // share of cost returned on removal
  tickSeconds: 1.2,     // one "day" at 1x
  tax: 0.35,            // per resident per day
  jobSlack: 1.15,       // homes fill until residents exceed jobs by this factor (+4)
  baseJoy: 55,
};

export const SPEEDS = [1, 2, 4];
export const SAVE_KEY = 'miniature-city-v1';
export const SAVE_VERSION = 1;
