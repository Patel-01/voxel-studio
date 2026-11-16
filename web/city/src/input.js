// Pointer and keyboard input: turns clicks, taps and drags into game actions
// and keeps the placement preview up to date.

import { DEFS } from './buildings.js';

const TAP_SLOP = 7; // pixels a pointer may move and still count as a click

export class Input {
  constructor(canvas, scene, game, view, tools, hud) {
    Object.assign(this, { canvas, scene, game, view, tools, hud });
    this.cell = null;      // cell under the pointer
    this.armed = null;     // touch: cell awaiting a confirming second tap
    this.down = null;      // pointer-down info
    this.painting = false;

    canvas.addEventListener('pointermove', (e) => this._move(e));
    canvas.addEventListener('pointerdown', (e) => this._down(e));
    canvas.addEventListener('pointerup', (e) => this._up(e));
    canvas.addEventListener('pointercancel', () => { this.down = null; this.painting = false; });
    canvas.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') { this.cell = null; this.refresh(); } });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => this._key(e));
    tools.on(() => { this.armed = null; this.refresh(); });
    game.on(() => this.refresh());
  }

  // Redraw the preview for the current tool and cell.
  refresh() {
    const { tools, game, view } = this;
    const sel = game.grid.buildings.get(tools.selectedId) || null;
    view.setSelection(tools.mode === 'select' ? sel : null);
    const cell = this.armed || this.cell;
    if (!cell) { view.setGhost(null); return; }
    if (tools.mode === 'build' || tools.mode === 'move') {
      const opts = tools.mode === 'move' ? { ignoreId: tools.selectedId, free: true } : {};
      const result = game.check(tools.type, cell.x, cell.z, tools.rot, opts);
      const swaps = result.replace.some((id) => game.grid.buildings.get(id).type !== 'tree');
      view.setGhost({ type: tools.type, x: cell.x, z: cell.z, rot: tools.rot, state: !result.ok ? 'bad' : swaps ? 'swap' : 'ok' });
      this.hud.setPreview(result, tools, swaps, !!this.armed);
    } else if (tools.mode === 'bulldoze') {
      const b = game.grid.buildingAt(cell.x, cell.z);
      if (b) view.setTile(b, 'bad'); else view.setCellTile(cell, 'hover');
      this.hud.setPreview(null);
    } else {
      const b = game.grid.buildingAt(cell.x, cell.z);
      if (b && b.id !== tools.selectedId) view.setTile(b, 'hover'); else view.setGhost(null);
      this.hud.setPreview(null);
    }
  }

  _cellOf(e) { return this.scene.cellAt(e.clientX, e.clientY); }
  _same(a, b) { return a && b && a.x === b.x && a.z === b.z; }

  _move(e) {
    const cell = this._cellOf(e);
    if (e.pointerType !== 'mouse' && !this.down) return;
    if (!this._same(cell, this.cell)) {
      const from = this.cell;
      this.cell = cell;
      if (this.painting && cell) {
        // Fast drags skip cells; fill the straight line between the last cell and this one.
        const steps = from ? Math.max(Math.abs(cell.x - from.x), Math.abs(cell.z - from.z)) : 1;
        for (let k = 1; k <= steps; k++) {
          const t = k / steps;
          this._paint(from ? { x: Math.round(from.x + (cell.x - from.x) * t), z: Math.round(from.z + (cell.z - from.z) * t) } : cell);
        }
      }
      if (e.pointerType === 'mouse') this.refresh();
    }
  }

  _down(e) {
    if (e.button !== 0) return;
    const cell = this._cellOf(e);
    this.down = { x: e.clientX, y: e.clientY, cell, type: e.pointerType };
    this.cell = cell;
    // Mouse: roads, bridges and trees paint while dragging; bulldoze too.
    const paints = this.tools.mode === 'bulldoze' || (this.tools.mode === 'build' && DEFS[this.tools.type].paint);
    if (e.pointerType === 'mouse' && paints && cell) {
      this.painting = true;
      this.canvas.setPointerCapture(e.pointerId);
      this._paint(cell, true);
    }
  }

  _up(e) {
    if (e.button !== 0 || !this.down) return;
    const start = this.down;
    this.down = null;
    if (this.painting) { this.painting = false; return; }
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > TAP_SLOP) return; // it was a camera drag
    const cell = this._cellOf(e);
    if (cell) this._click(cell, e.pointerType);
  }

  _paint(cell, first = false) {
    const { tools, game } = this;
    if (tools.mode === 'bulldoze') {
      const b = game.grid.buildingAt(cell.x, cell.z);
      if (b) { game.remove(b.id); this.hud.toast(`Removed ${DEFS[b.type].name.toLowerCase()}`, 'info'); }
      return;
    }
    const result = game.place(tools.type, cell.x, cell.z, tools.rot);
    if (!result.ok && first) this.hud.toast(result.reason, 'bad');
  }

  _click(cell, pointerType) {
    const { tools, game, hud } = this;
    const touch = pointerType !== 'mouse';
    if (tools.mode === 'build' || tools.mode === 'move') {
      // On touch there is no hover, so the first tap previews and the second confirms.
      if (touch && !this._same(this.armed, cell)) { this.armed = cell; this.refresh(); return; }
      this.armed = null;
      const result = tools.mode === 'build'
        ? game.place(tools.type, cell.x, cell.z, tools.rot)
        : game.move(tools.selectedId, cell.x, cell.z, tools.rot);
      if (!result.ok) { hud.toast(result.reason, 'bad'); return; }
      if (tools.mode === 'move') tools.select(tools.selectedId);
      this.refresh();
    } else if (tools.mode === 'bulldoze') {
      const b = game.grid.buildingAt(cell.x, cell.z);
      if (b) game.remove(b.id);
    } else {
      const b = game.grid.buildingAt(cell.x, cell.z);
      tools.select(b ? b.id : 0);
    }
  }

  _key(e) {
    if (e.target.closest('input, textarea') || e.ctrlKey || e.metaKey) return;
    const { tools, game } = this;
    const key = e.key.toLowerCase();
    if (key === 'r') {
      if (tools.mode === 'build' || tools.mode === 'move') tools.rotate();
      else if (tools.selectedId) { const r = game.rotate(tools.selectedId); if (!r.ok) this.hud.toast(r.reason, 'bad'); }
    } else if (key === 'escape') tools.cancel();
    else if (key === 'b') tools.bulldoze();
    else if (key === 'v') tools.select(0);
    else if ((key === 'delete' || key === 'backspace') && tools.mode === 'select' && tools.selectedId) {
      game.remove(tools.selectedId); tools.select(0);
    } else if (key === ' ') { e.preventDefault(); game.togglePause(); }
    else return;
    this.refresh();
  }
}
