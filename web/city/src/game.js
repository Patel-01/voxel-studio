// Game state and the actions that change it. Every change goes through here,
// so validation, money and notifications stay in one place.

import { ECON, GRID, SPEEDS, WORLD_SEED } from './config.js';
import { DEFS } from './buildings.js';
import { analyse, tick } from './economy.js';
import { WorldGrid } from './grid.js';
import { validate } from './placement.js';
import { generateTerrain } from './terrain.js';

export class Game {
  constructor() {
    this.terrain = generateTerrain(GRID, WORLD_SEED);
    this.listeners = [];
    this.clear(ECON.startMoney);
  }

  clear(money) {
    this.grid = new WorldGrid(GRID, this.terrain);
    this.money = money;
    this.ticks = 0;
    this.speedIndex = 0;
    this.paused = false;
    this.stats = { income: 0, net: 0 };
    this._acc = 0;
    analyse(this);
  }

  on(fn) { this.listeners.push(fn); }
  emit(kind, detail) { for (const fn of this.listeners) fn(kind, detail); }
  _changed(kind, detail) { analyse(this); this.emit(kind, detail); }

  check(type, x, z, rot, opts = {}) { return validate(this.grid, type, x, z, rot, { money: this.money, ...opts }); }

  place(type, x, z, rot = 0) {
    const result = this.check(type, x, z, rot);
    if (!result.ok) return result;
    for (const id of result.replace) this.grid.remove(id);
    const b = this.grid.add(type, x, z, rot);
    this.money -= result.cost;
    this._changed('build', b);
    return { ...result, building: b };
  }

  move(id, x, z, rot) {
    const b = this.grid.buildings.get(id);
    if (!b) return { ok: false, reason: 'Nothing selected' };
    const result = this.check(b.type, x, z, rot, { ignoreId: id, free: true });
    if (!result.ok) return result;
    for (const other of result.replace) this.grid.remove(other);
    this.grid.relocate(id, x, z, rot);
    this.money -= result.cost; // negative cost = refund for cleared trees
    this._changed('move', b);
    return result;
  }

  rotate(id) {
    const b = this.grid.buildings.get(id);
    if (!b) return { ok: false, reason: 'Nothing selected' };
    return this.move(id, b.x, b.z, (b.rot + 1) % 4);
  }

  remove(id) {
    const b = this.grid.remove(id);
    if (!b) return { ok: false, reason: 'Nothing there' };
    const refund = Math.floor(DEFS[b.type].cost * ECON.refund);
    this.money += refund;
    this._changed('remove', b);
    return { ok: true, refund };
  }

  setSpeed(index) { this.speedIndex = index; this.paused = false; this.emit('speed'); }
  togglePause() { this.paused = !this.paused; this.emit('speed'); }

  // Advance by real seconds. Returns how many days passed.
  update(realDt) {
    if (this.paused) return 0;
    this._acc += realDt * SPEEDS[this.speedIndex];
    let days = 0;
    while (this._acc >= ECON.tickSeconds && days < 8) { this._acc -= ECON.tickSeconds; tick(this); days++; }
    if (days) this.emit('tick');
    return days;
  }

  serialize() {
    return {
      money: Math.round(this.money * 100) / 100, ticks: this.ticks, speedIndex: this.speedIndex,
      buildings: [...this.grid.buildings.values()].map((b) => [b.id, b.type, b.x, b.z, b.rot, b.pop]),
    };
  }

  // Rebuild from saved data, skipping anything that no longer fits. Returns how many entries were dropped.
  restore(data) {
    this.clear(Number.isFinite(data.money) ? data.money : ECON.startMoney);
    this.ticks = data.ticks | 0;
    this.speedIndex = Math.min(SPEEDS.length - 1, Math.max(0, data.speedIndex | 0));
    let dropped = 0;
    for (const [id, type, x, z, rot, pop] of data.buildings || []) {
      const def = DEFS[type];
      const fits = def && Number.isInteger(id) && id > 0 && !this.grid.buildings.has(id)
        && validate(this.grid, type, x, z, rot | 0).ok && validate(this.grid, type, x, z, rot | 0).replace.length === 0;
      if (!fits) { dropped++; continue; }
      this.grid.add(type, x, z, (rot | 0) % 4, Math.max(0, Math.min(def.capacity || 0, pop | 0)), id);
    }
    this._changed('load');
    return dropped;
  }
}
