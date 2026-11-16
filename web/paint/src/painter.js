// The flat map you paint on. Draws the biome grid and turns pointer strokes into map edits.

import { N, MAP_COLORS, MOUNTAIN } from './config.js';

function hexToRgb(hex) {
  const v = parseInt(hex.slice(1), 16);
  return [v >> 16, (v >> 8) & 255, v & 255];
}
const RGB = MAP_COLORS.map(hexToRgb);

export class Painter {
  // onStrokeStart() fires once per stroke (before the first edit); onChange() after every edit.
  constructor(canvas, map, { onStrokeStart, onChange }) {
    this.canvas = canvas; this.map = map;
    this.onStrokeStart = onStrokeStart; this.onChange = onChange;
    this.brush = 2; this.size = 3;
    this.ctx = canvas.getContext('2d');
    this.cells = document.createElement('canvas');
    this.cells.width = this.cells.height = N;
    this.cellCtx = this.cells.getContext('2d');
    this.image = this.cellCtx.createImageData(N, N);
    this.hover = null; this.last = null; this.down = false;

    canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      canvas.setPointerCapture(e.pointerId);
      this.down = true; this.last = null;
      this.onStrokeStart();
      this._stroke(e);
    });
    canvas.addEventListener('pointermove', (e) => { this.hover = this._cell(e); if (this.down) this._stroke(e); else this.draw(); });
    const end = () => { this.down = false; this.last = null; };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('pointerleave', () => { this.hover = null; this.draw(); });
    new ResizeObserver(() => this.draw()).observe(canvas);
  }

  _cell(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * N - 0.5, z: ((e.clientY - r.top) / r.height) * N - 0.5 };
  }

  _stroke(e) {
    const p = this._cell(e);
    this.strokeTo(p.x, p.z);
  }

  // Paint from the previous point of this stroke to (x, z), filling the gap between events.
  strokeTo(x, z) {
    const from = this.last || { x, z };
    const steps = Math.max(1, Math.ceil(Math.hypot(x - from.x, z - from.z) / 0.6));
    let changed = false;
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      if (this.map.paint(from.x + (x - from.x) * t, from.z + (z - from.z) * t, this.size, this.brush)) changed = true;
    }
    this.last = { x, z };
    this.hover = { x, z };
    if (changed) this.onChange();
    this.draw();
  }

  endStroke() { this.last = null; this.down = false; }

  draw() {
    const { canvas, ctx, map } = this;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = Math.max(1, Math.round(canvas.clientWidth * dpr));
    if (canvas.width !== size) canvas.width = canvas.height = size;

    const data = this.image.data;
    for (let i = 0; i < N * N; i++) {
      const b = map.biome[i];
      let [r, g, bl] = RGB[b];
      if (b === MOUNTAIN) { // relief shading: higher is lighter, snow is white
        const k = map.snow[i] ? 1 : Math.min(0.55, map.height[i] * 0.045);
        r += (250 - r) * k; g += (252 - g) * k; bl += (255 - bl) * k;
      }
      data[i * 4] = r; data[i * 4 + 1] = g; data[i * 4 + 2] = bl; data[i * 4 + 3] = 255;
    }
    this.cellCtx.putImageData(this.image, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.cells, 0, 0, size, size);

    const cell = size / N;
    ctx.strokeStyle = 'rgba(8, 24, 44, 0.13)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let k = 4; k < N; k += 4) {
      const p = Math.round(k * cell) + 0.5;
      ctx.moveTo(p, 0); ctx.lineTo(p, size); ctx.moveTo(0, p); ctx.lineTo(size, p);
    }
    ctx.stroke();

    if (this.hover) {
      const cx = (this.hover.x + 0.5) * cell, cy = (this.hover.z + 0.5) * cell, r = Math.max(cell * 0.5, (this.size - 0.5) * cell);
      ctx.lineWidth = Math.max(2, dpr * 1.5);
      ctx.strokeStyle = 'rgba(10, 20, 36, 0.85)';
      ctx.beginPath(); ctx.arc(cx, cy, r + ctx.lineWidth, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    }
  }
}
