// Static island mesh (grass, sand, cliffs, seabed) and the animated water sheet.

import * as THREE from 'three';
import { LEVEL, TERRAIN } from '../config.js';
import { hash3 } from '../rng.js';

const GRASS = [0x86c66b, 0x7cbc63], SAND = 0xe9d9a8, SOIL = 0x9a7352, SEABED = 0x6f9aa8, ROCK = 0x6c7078;

export function buildTerrain(grid) {
  const n = grid.size, half = n / 2;
  const pos = [], nor = [], col = [], idx = [];
  const c = new THREE.Color();
  const quad = (pts, normal, hex, shade = 1) => {
    const base = pos.length / 3;
    c.setHex(hex).multiplyScalar(shade);
    for (const p of pts) { pos.push(p[0] - half, p[1], p[2] - half); nor.push(...normal); col.push(c.r, c.g, c.b); }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  const sides = [[1, 0, [1, 0, 0]], [-1, 0, [-1, 0, 0]], [0, 1, [0, 0, 1]], [0, -1, [0, 0, -1]]];
  const wall = (x, z, dx, dz, normal, top, bottom, hex) => {
    // Corners of the cell edge facing (dx, dz), wound so the face points outward.
    const x0 = dx === 1 ? x + 1 : x, x1 = dx === -1 ? x : x + 1, z0 = dz === 1 ? z + 1 : z, z1 = dz === -1 ? z : z + 1;
    let a, b;
    if (dx === 1) { a = [x + 1, z + 1]; b = [x + 1, z]; } else if (dx === -1) { a = [x, z]; b = [x, z + 1]; }
    else if (dz === 1) { a = [x, z + 1]; b = [x + 1, z + 1]; } else { a = [x + 1, z]; b = [x, z]; }
    void x0; void x1; void z0; void z1;
    quad([[a[0], bottom, a[1]], [b[0], bottom, b[1]], [b[0], top, b[1]], [a[0], top, a[1]]], normal, hex);
  };

  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      const t = grid.terrainAt(x, z);
      const land = t !== TERRAIN.WATER;
      const y = land ? LEVEL.ground : LEVEL.seabed;
      const jitter = 0.95 + hash3(x, z, 5) * 0.1;
      const hex = t === TERRAIN.GRASS ? GRASS[(x + z) % 2] : t === TERRAIN.SAND ? SAND : SEABED;
      quad([[x, y, z + 1], [x + 1, y, z + 1], [x + 1, y, z], [x, y, z]], [0, 1, 0], hex, jitter);
      for (const [dx, dz, normal] of sides) {
        const nx = x + dx, nz = z + dz;
        const outside = !grid.inside(nx, nz);
        if (land && (outside || grid.terrainAt(nx, nz) === TERRAIN.WATER)) {
          wall(x, z, dx, dz, normal, LEVEL.ground, LEVEL.seabed, t === TERRAIN.SAND ? 0xd3bf8c : SOIL);
        }
        if (outside) wall(x, z, dx, dz, normal, LEVEL.seabed, LEVEL.base, ROCK);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geometry.setIndex(idx);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.receiveShadow = true;
  return mesh;
}

export function buildWater(grid, uTime) {
  const n = grid.size, half = n / 2, y = LEVEL.water;
  const pos = [], nor = [], cell = [], lift = [], idx = [];
  const quad = (pts, normal, x, z) => {
    const base = pos.length / 3;
    for (const p of pts) { pos.push(p[0] - half, p[1], p[2] - half); nor.push(...normal); cell.push(x, z); lift.push(p[3]); }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      if (grid.terrainAt(x, z) !== TERRAIN.WATER) continue;
      quad([[x, y, z + 1, 1], [x + 1, y, z + 1, 1], [x + 1, y, z, 1], [x, y, z, 1]], [0, 1, 0], x, z);
      const b = LEVEL.seabed;
      if (x === n - 1) quad([[n, b, z + 1, 0], [n, b, z, 0], [n, y, z, 1], [n, y, z + 1, 1]], [1, 0, 0], x, z);
      if (x === 0) quad([[0, b, z, 0], [0, b, z + 1, 0], [0, y, z + 1, 1], [0, y, z, 1]], [-1, 0, 0], x, z);
      if (z === n - 1) quad([[x, b, n, 0], [x + 1, b, n, 0], [x + 1, y, n, 1], [x, y, n, 1]], [0, 0, 1], x, z);
      if (z === 0) quad([[x + 1, b, 0, 0], [x, b, 0, 0], [x, y, 0, 1], [x + 1, y, 0, 1]], [0, 0, -1], x, z);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geometry.setAttribute('aCell', new THREE.Float32BufferAttribute(cell, 2));
  geometry.setAttribute('aLift', new THREE.Float32BufferAttribute(lift, 1));
  geometry.setIndex(idx);
  const material = new THREE.MeshLambertMaterial({ color: 0x3fa7d6, transparent: true, opacity: 0.8, depthWrite: false });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aCell;\nattribute float aLift;\nuniform float uTime;\nvarying float vWave;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float swell = sin(uTime * 1.2 + position.x * 0.9 + position.z * 0.4) + cos(uTime * 0.9 + position.z * 1.0 - position.x * 0.3);
        transformed.y += aLift * swell * 0.022;
        vWave = sin(uTime * 1.2 + aCell.x * 0.9 + aCell.y * 0.4) + cos(uTime * 0.9 + aCell.y * 1.0 - aCell.x * 0.3);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vWave;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= 1.0 + vWave * 0.07;');
  };
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.renderOrder = 1;
  return mesh;
}
