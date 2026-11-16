// Shared constants for Worldbrush.

export const N = 56;                 // the map is N x N cells
export const SAVE_KEY = 'worldbrush-v1';

export const WATER = 0, SAND = 1, GRASS = 2, FOREST = 3, MOUNTAIN = 4, TOWN = 5;

// Order here is the order of the brush buttons.
export const BRUSHES = [
  { id: GRASS, name: 'Grass', color: '#7cc35a' },
  { id: FOREST, name: 'Forest', color: '#3f8f45' },
  { id: MOUNTAIN, name: 'Mountain', color: '#8d8f98' },
  { id: SAND, name: 'Sand', color: '#ead9a0' },
  { id: TOWN, name: 'Town', color: '#d98a5f' },
  { id: WATER, name: 'Water', color: '#3f8fd0' },
];

export const MAP_COLORS = ['#2f79bd', '#ead9a0', '#7cc35a', '#3f8f45', '#8d8f98', '#d98a5f'];

export const SNOW_LINE = 11;         // mountain columns this tall or taller are snow-capped
export const MAX_HEIGHT = 18;

// Lighting presets the Time button cycles through.
export const TIMES = [
  { name: 'Day', sky: ['#bfe3f5', '#eaf6fb'], sun: 0xfff3df, sunI: 2.4, hemiI: 1.7, sunPos: [-30, 46, 20], windows: 0x3b4a5a },
  { name: 'Dusk', sky: ['#f2a25c', '#6a4c7d'], sun: 0xffb070, sunI: 2.0, hemiI: 1.05, sunPos: [-46, 16, 10], windows: 0xffd27a },
  { name: 'Night', sky: ['#0f1a3d', '#2b3f78'], sun: 0xa9bcff, sunI: 1.25, hemiI: 0.95, sunPos: [24, 40, -26], windows: 0xffd98a },
];
