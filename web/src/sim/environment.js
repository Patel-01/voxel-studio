// Clock, seasons and weather. `step` is the deterministic part; `ease` only
// smooths what is drawn (so controls respond even while paused).

import { DAY_SECONDS, SEASON_DAYS, START, WEATHER } from '../config.js';
import { hash3 } from './rng.js';

const SEGMENTS_PER_DAY = 3;

export class Environment {
  constructor(seed) {
    this.seed = seed;
    this.blend = { cloud: 0, rain: 0, snow: 0, fog: 0, wind: 0 };
    this.weights = [1, 0, 0, 0]; // how much of each season is showing
    this.reset();
  }

  reset() {
    this.time = (START.hour / 24) * DAY_SECONDS;
    this.startSegment = Math.floor(this.time / (DAY_SECONDS / SEGMENTS_PER_DAY));
    this.seasonTarget = START.season;
    this.season = START.season;
    this.cycleSeasons = START.cycleSeasons;
    this.weatherMode = START.weather;
    this.weather = this._pickWeather();
    Object.assign(this.blend, WEATHER[this.weather]);
    this.snowCover = 0;
    this._updateWeights();
  }

  get hour() { return ((this.time % DAY_SECONDS) / DAY_SECONDS) * 24; }
  get day() { return Math.floor(this.time / DAY_SECONDS); }
  get seasonIndex() { return ((Math.round(this.seasonTarget) % 4) + 4) % 4; }
  get isNight() { const h = this.hour; return h < 5.6 || h > 19.4; }
  get isEvening() { const h = this.hour; return h < 6.0 || h > 19.0; }
  get sheltering() { return this.weather === 'rain' || this.weather === 'snow'; }

  setHour(hour) { this.time = this.day * DAY_SECONDS + (hour / 24) * DAY_SECONDS; this.weather = this._pickWeather(); }

  // Move forward to the next occurrence of a season (or stay if already there).
  setSeason(index) {
    const current = Math.round(this.seasonTarget);
    const delta = (((index - current) % 4) + 4) % 4;
    this.seasonTarget = current + delta;
    this.weather = this._pickWeather();
  }

  setWeatherMode(mode) { this.weatherMode = mode; this.weather = this._pickWeather(); }

  _pickWeather() {
    if (this.weatherMode !== 'auto') return this.weatherMode;
    const segment = Math.floor(this.time / (DAY_SECONDS / SEGMENTS_PER_DAY));
    if (segment <= this.startSegment + 1) return 'clear'; // a calm opening
    const r = hash3(segment, this.seed, 91);
    const season = this.seasonIndex;
    if (season === 3) return r < 0.4 ? 'clear' : r < 0.78 ? 'snow' : 'fog';
    if (season === 1) return r < 0.7 ? 'clear' : r < 0.9 ? 'rain' : 'fog';
    return r < 0.5 ? 'clear' : r < 0.8 ? 'rain' : 'fog';
  }

  step(dt) {
    this.time += dt;
    if (this.cycleSeasons) this.seasonTarget += dt / (SEASON_DAYS * DAY_SECONDS);
    this.weather = this._pickWeather();
  }

  _updateWeights() {
    const s = ((this.season % 4) + 4) % 4;
    for (let k = 0; k < 4; k++) {
      let d = Math.abs(s - k);
      if (d > 2) d = 4 - d;
      this.weights[k] = Math.max(0, 1 - d);
    }
  }

  // Returns true while anything visible is still settling.
  ease(realDt) {
    let moving = false;
    const kSeason = 1 - Math.exp(-realDt * 1.6);
    const gap = this.seasonTarget - this.season;
    if (Math.abs(gap) > 1e-4) { this.season += gap * kSeason; moving = true; } else this.season = this.seasonTarget;
    this._updateWeights();

    const target = WEATHER[this.weather];
    const k = 1 - Math.exp(-realDt * 0.9);
    for (const key in this.blend) {
      const d = target[key] - this.blend[key];
      if (Math.abs(d) > 1e-3) { this.blend[key] += d * k; moving = true; } else this.blend[key] = target[key];
    }
    const coverTarget = Math.max(this.weights[3], this.blend.snow);
    const dc = coverTarget - this.snowCover;
    if (Math.abs(dc) > 1e-3) { this.snowCover += dc * (1 - Math.exp(-realDt * 0.6)); moving = true; } else this.snowCover = coverTarget;
    return moving;
  }
}
