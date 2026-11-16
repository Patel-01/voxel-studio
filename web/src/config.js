// All tunable numbers live here. No logic.

export const DAY_SECONDS = 240;   // simulated seconds per day at 1x speed
export const SEASON_DAYS = 2;     // days per season when seasons cycle
export const SPEEDS = [0.25, 0.5, 1, 2, 4, 8, 16];
export const MAX_STEPS_PER_FRAME = 16;

export const START = { hour: 8.4, season: 0, weather: 'auto', speedIndex: 2, cycleSeasons: true };

// Visual targets per weather state (0-1).
export const WEATHER = {
  clear: { cloud: 0.3, rain: 0, snow: 0, fog: 0.0, wind: 0.45 },
  rain: { cloud: 1.0, rain: 1, snow: 0, fog: 0.3, wind: 1.0 },
  fog: { cloud: 0.5, rain: 0, snow: 0, fog: 1.0, wind: 0.15 },
  snow: { cloud: 0.85, rain: 0, snow: 1, fog: 0.35, wind: 0.55 },
};
export const WEATHER_LABEL = { clear: 'Clear', rain: 'Rain', fog: 'Fog', snow: 'Snow' };

// Sky and light through the day. Colours are sRGB hex.
export const SKY_KEYS = [
  { h: 0.0, zenith: 0x04060f, horizon: 0x0c1330, light: 0x8fa6ff, ambient: 0.27 },
  { h: 5.0, zenith: 0x0a1026, horizon: 0x1d2449, light: 0x8fa6ff, ambient: 0.28 },
  { h: 6.5, zenith: 0x3b4f8f, horizon: 0xf7a680, light: 0xffb07a, ambient: 0.50 },
  { h: 9.0, zenith: 0x3d83de, horizon: 0xc2e1fb, light: 0xfff0d8, ambient: 0.85 },
  { h: 13.0, zenith: 0x2f7ce4, horizon: 0xcbe7ff, light: 0xffffff, ambient: 0.95 },
  { h: 17.0, zenith: 0x3c77cf, horizon: 0xf6dbac, light: 0xffdfae, ambient: 0.80 },
  { h: 19.0, zenith: 0x3b2f6c, horizon: 0xfb8b4e, light: 0xff9858, ambient: 0.50 },
  { h: 20.5, zenith: 0x0d1230, horizon: 0x2a2550, light: 0x8fa6ff, ambient: 0.26 },
  { h: 24.0, zenith: 0x04060f, horizon: 0x0c1330, light: 0x8fa6ff, ambient: 0.27 },
];

export const LIGHT = { sun: 2.7, moon: 0.95, hemi: 2.0, overcastDim: 0.6 };
export const FOG = { base: 0.0016, weather: 0.011 };

export const CAMERA = {
  fov: 32,
  position: [50, 32, 47],
  target: [0, 6, 0],
  minDistance: 30,
  maxDistance: 150,
};

export const COUNTS = { birds: 7, villagers: 3, clouds: 12, tufts: 520, flowers: 170, stars: 900 };
