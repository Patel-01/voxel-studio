// Turns box lists into coloured meshes' geometry, with a cache so each model is built once.

import * as THREE from 'three';

const FACES = [
  { n: [1, 0, 0], c: [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]] },
  { n: [-1, 0, 0], c: [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]] },
  { n: [0, 1, 0], c: [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]] },
  { n: [0, -1, 0], c: [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]] },
  { n: [0, 0, 1], c: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]] },
  { n: [0, 0, -1], c: [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]] },
];
const colour = new THREE.Color();

export class GeometryBuilder {
  constructor() { this.pos = []; this.nor = []; this.col = []; this.idx = []; }

  // Append boxes, shifted by (ox, oy, oz).
  add(parts, ox = 0, oy = 0, oz = 0) {
    for (const { p, s, c } of parts) {
      colour.setHex(c);
      for (const face of FACES) {
        const base = this.pos.length / 3;
        for (const k of face.c) {
          this.pos.push(ox + p[0] + k[0] * s[0] / 2, oy + p[1] + k[1] * s[1] / 2, oz + p[2] + k[2] * s[2] / 2);
          this.nor.push(face.n[0], face.n[1], face.n[2]);
          this.col.push(colour.r, colour.g, colour.b);
        }
        this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }
    return this;
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    return g;
  }
}

export class ModelCache {
  constructor() { this.cache = new Map(); }

  // Geometry for a building definition, a colour variant and its lit/unlit state.
  get(type, def, id, lit) {
    const variant = def.variants ? id % def.variants : 0;
    const key = `${type}|${variant}|${lit ? 1 : 0}`;
    let g = this.cache.get(key);
    if (!g) { g = new GeometryBuilder().add(def.parts(variant, lit)).build(); this.cache.set(key, g); }
    return g;
  }

  rotor(type, def) {
    const key = `${type}|rotor`;
    let g = this.cache.get(key);
    if (!g) { g = new GeometryBuilder().add(def.rotor.parts).build(); this.cache.set(key, g); }
    return g;
  }
}
