// The control panel. Translates input into simulation calls and mirrors state
// back, touching the DOM only when a displayed value actually changes.

import { SPEEDS, WEATHER_LABEL } from '../config.js';

const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'];
const $ = (id) => document.getElementById(id);

function formatHour(hour) {
  const total = Math.floor(hour * 60) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export class Panel {
  constructor(sim, actions) {
    this.sim = sim;
    this.actions = actions;
    this._shown = {};
    this._dragging = false;
    this.el = {
      panel: $('panel'), time: $('clock-time'), meta: $('clock-meta'), toggle: $('toggle'),
      pause: $('pause'), reset: $('reset'), capture: $('capture'),
      hour: $('hour'), hourOut: $('hour-out'), speed: $('speed'), speedOut: $('speed-out'),
      cycle: $('cycle'), note: $('note'),
      seasons: [...document.querySelectorAll('[data-season]')],
      weathers: [...document.querySelectorAll('[data-weather]')],
    };
    const e = this.el;
    e.speed.max = String(SPEEDS.length - 1);

    e.pause.addEventListener('click', () => this.togglePause());
    e.reset.addEventListener('click', () => actions.reset());
    e.capture.addEventListener('click', () => actions.capture());
    e.toggle.addEventListener('click', () => {
      const open = e.panel.classList.toggle('collapsed') === false;
      e.toggle.setAttribute('aria-expanded', String(open));
    });
    e.hour.addEventListener('pointerdown', () => { this._dragging = true; });
    window.addEventListener('pointerup', () => { this._dragging = false; });
    e.hour.addEventListener('input', () => { sim.env.setHour(Number(e.hour.value)); actions.changed(); });
    e.speed.addEventListener('input', () => { sim.speedIndex = Number(e.speed.value); actions.changed(); });
    e.cycle.addEventListener('change', () => { sim.env.cycleSeasons = e.cycle.checked; actions.changed(); });
    for (const b of e.seasons) {
      b.addEventListener('click', () => { sim.env.setSeason(Number(b.dataset.season)); actions.changed(); });
    }
    for (const b of e.weathers) {
      b.addEventListener('click', () => { sim.env.setWeatherMode(b.dataset.weather); actions.changed(); });
    }
    window.addEventListener('keydown', (ev) => {
      if (ev.code !== 'Space' || ev.target.closest('button, input')) return;
      ev.preventDefault();
      this.togglePause();
    });
    if (window.matchMedia('(max-width: 640px)').matches) e.panel.classList.add('collapsed');
    e.toggle.setAttribute('aria-expanded', String(!e.panel.classList.contains('collapsed')));
    this.sync();
  }

  togglePause() {
    this.sim.paused = !this.sim.paused;
    this.actions.changed();
  }

  note(text) {
    this.el.note.textContent = text;
    clearTimeout(this._noteTimer);
    if (text) this._noteTimer = setTimeout(() => { this.el.note.textContent = ''; }, 4000);
  }

  _set(key, value, apply) {
    if (this._shown[key] === value) return;
    this._shown[key] = value;
    apply(value);
  }

  sync() {
    const { sim, el } = this;
    const env = sim.env;
    const clock = formatHour(env.hour);
    this._set('time', clock, (v) => { el.time.textContent = v; el.hourOut.textContent = v; });
    if (!this._dragging) this._set('hour', env.hour.toFixed(1), (v) => { el.hour.value = v; });
    const weather = WEATHER_LABEL[env.weather];
    this._set('meta', `Day ${env.day + 1} · ${SEASONS[env.seasonIndex]} · ${weather}`, (v) => { el.meta.textContent = v; });
    this._set('speed', sim.speedIndex, (v) => { el.speed.value = String(v); el.speedOut.textContent = `${SPEEDS[v]}×`; });
    this._set('paused', sim.paused, (v) => {
      el.pause.textContent = v ? 'Resume' : 'Pause';
      el.pause.setAttribute('aria-pressed', String(v));
    });
    this._set('cycle', env.cycleSeasons, (v) => { el.cycle.checked = v; });
    this._set('season', env.seasonIndex, (v) => {
      for (const b of el.seasons) b.setAttribute('aria-pressed', String(Number(b.dataset.season) === v));
    });
    this._set('weather', env.weatherMode, (v) => {
      for (const b of el.weathers) b.setAttribute('aria-pressed', String(b.dataset.weather === v));
    });
  }
}
