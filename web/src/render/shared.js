// Uniforms and colour helpers shared by the render modules.

import { KIND_COUNT } from '../sim/world.js';

const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

// One set of uniform objects, referenced by every material that reacts to the world.
export function makeWorldUniforms(world) {
  const palette = new Float32Array(4 * KIND_COUNT * 3);
  const leafAlt = new Float32Array(4 * 3);
  for (let s = 0; s < 4; s++) {
    for (let k = 0; k < KIND_COUNT; k++) {
      for (let c = 0; c < 3; c++) palette[(s * KIND_COUNT + k) * 3 + c] = toLinear(world.palettes[s][k][c]);
    }
    for (let c = 0; c < 3; c++) leafAlt[s * 3 + c] = toLinear(world.leafAlt[s][c]);
  }
  return {
    palette,
    uPalette: { value: palette },
    uLeafAlt: { value: leafAlt },
    uSeason: { value: 0 },
    uSnow: { value: 0 },
    uTime: { value: 0 },
    uWind: { value: 0 },
    uNight: { value: 0 },
  };
}

// Blend one block kind's colour across the seasons currently showing. Writes into `out`.
export function seasonColor(palette, kind, weights, out) {
  let r = 0, g = 0, b = 0;
  for (let s = 0; s < 4; s++) {
    const o = (s * KIND_COUNT + kind) * 3;
    r += palette[o] * weights[s]; g += palette[o + 1] * weights[s]; b += palette[o + 2] * weights[s];
  }
  out.setRGB(r, g, b);
  return out;
}

export const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
