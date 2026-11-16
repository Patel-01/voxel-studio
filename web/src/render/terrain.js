// Island mesh. Geometry is built once; season, snow, wind and lit windows are
// all computed in the shader from a per-block kind and hash, so nothing is
// rebuilt or re-uploaded as the world changes.

import * as THREE from 'three';
import { hash3 } from '../sim/rng.js';
import { K } from '../sim/world.js';

const FACES = [
  { n: [1, 0, 0], c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
  { n: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
  { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { n: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
];

const VERT_PARS = /* glsl */ `
attribute float aKind;
attribute float aHash;
attribute float aTop;
uniform vec3 uPalette[48];
uniform vec3 uLeafAlt[4];
uniform float uSeason, uSnow, uTime, uWind, uNight;
varying vec3 vTint;
varying float vGlow;
`;

const VERT_MAIN = /* glsl */ `
{
  int kind = int(aKind + 0.5);
  float s = mod(uSeason, 4.0);
  int s0 = int(floor(s));
  int s1 = (s0 + 1) % 4;
  // Each block turns at its own moment, so a season spreads across the island.
  float f = smoothstep(aHash * 0.5, aHash * 0.5 + 0.5, fract(s));
  vec3 c0 = uPalette[s0 * 12 + kind];
  vec3 c1 = uPalette[s1 * 12 + kind];
  if (kind == 8) {
    float alt = fract(aHash * 7.31);
    c0 = mix(c0, uLeafAlt[s0], alt);
    c1 = mix(c1, uLeafAlt[s1], alt);
    float sway = sin(uTime * 1.7 + position.x * 0.6 + position.z * 0.45) + 0.5 * sin(uTime * 3.1 + position.y);
    transformed.x += sway * 0.05 * uWind;
    transformed.z += sway * 0.03 * uWind;
  }
  vec3 c = mix(c0, c1, f);
  bool takesSnow = kind == 1 || kind == 2 || kind == 3 || kind == 4 || kind == 8 || kind == 10;
  if (aTop > 0.5 && takesSnow) {
    float settle = smoothstep(aHash * 0.75, aHash * 0.75 + 0.25, uSnow);
    c = mix(c, vec3(0.90, 0.94, 1.0), settle);
  }
  vTint = c * (0.93 + 0.14 * fract(aHash * 3.7));
  vGlow = kind == 11 ? uNight : 0.0;
}
`;

export function buildTerrain(world, uniforms) {
  const n = world.size, half = world.half;
  const pos = [], nor = [], kind = [], hash = [], top = [], index = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      for (let h = 0; h < world.depth; h++) {
        const k = world.get(i, j, h);
        if (k === K.AIR || k === K.WATER) continue;
        const blockHash = hash3(i, j, h);
        for (const face of FACES) {
          const nh = h + face.n[1];
          if (nh < 0) continue; // the underside of the slab is never seen
          const nb = world.get(i + face.n[0], j + face.n[2], nh);
          if (nb !== K.AIR && nb !== K.WATER) continue;
          const base = pos.length / 3;
          for (const c of face.c) {
            pos.push(i + c[0] - half, h + c[1], j + c[2] - half);
            nor.push(face.n[0], face.n[1], face.n[2]);
            kind.push(k); hash.push(blockHash); top.push(face.n[1] === 1 ? 1 : 0);
          }
          index.push(base, base + 1, base + 2, base, base + 2, base + 3);
        }
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geometry.setAttribute('aKind', new THREE.Float32BufferAttribute(kind, 1));
  geometry.setAttribute('aHash', new THREE.Float32BufferAttribute(hash, 1));
  geometry.setAttribute('aTop', new THREE.Float32BufferAttribute(top, 1));
  geometry.setIndex(index);

  const material = new THREE.MeshLambertMaterial();
  material.onBeforeCompile = (shader) => {
    for (const key of ['uPalette', 'uLeafAlt', 'uSeason', 'uSnow', 'uTime', 'uWind', 'uNight']) {
      shader.uniforms[key] = uniforms[key];
    }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_PARS}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERT_MAIN}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTint;\nvarying float vGlow;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= vTint;')
      .replace('#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.5, 0.95, 0.34) * vGlow;');
  };
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  return mesh;
}
