// Water as flat block tops that bob cell by cell, so it stays voxel-shaped while it moves.

import * as THREE from 'three';
import { K } from '../sim/world.js';
import { seasonColor } from './shared.js';

const ICE = new THREE.Color().setRGB(0.62, 0.78, 0.9);

export class Water {
  constructor(world, uniforms) {
    this.world = world;
    this.uniforms = uniforms;
    this.amp = { value: 1 };
    this._colour = new THREE.Color();
    const n = world.size, half = world.half, surface = world.waterLevel;
    const pos = [], nor = [], cell = [], lift = [], index = [];
    const quad = (corners, normal, i, j) => {
      const base = pos.length / 3;
      for (const [x, y, z, isTop] of corners) {
        pos.push(x - half, y, z - half); nor.push(...normal); cell.push(i, j); lift.push(isTop);
      }
      index.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };
    const isWater = (i, j) => world.get(i, j, surface - 1) === K.WATER;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (!isWater(i, j)) continue;
        const y = surface;
        quad([[i, y, j + 1, 1], [i + 1, y, j + 1, 1], [i + 1, y, j, 1], [i, y, j, 1]], [0, 1, 0], i, j);
        let floor = surface - 1;
        while (floor > 0 && world.get(i, j, floor - 1) === K.WATER) floor--;
        // Skirts on the slab's edge so the sea reads as a solid block.
        if (i === n - 1) quad([[n, floor, j + 1, 0], [n, floor, j, 0], [n, y, j, 1], [n, y, j + 1, 1]], [1, 0, 0], i, j);
        if (i === 0) quad([[0, floor, j, 0], [0, floor, j + 1, 0], [0, y, j + 1, 1], [0, y, j, 1]], [-1, 0, 0], i, j);
        if (j === n - 1) quad([[i, floor, n, 0], [i + 1, floor, n, 0], [i + 1, y, n, 1], [i, y, n, 1]], [0, 0, 1], i, j);
        if (j === 0) quad([[i + 1, floor, 0, 0], [i, floor, 0, 0], [i, y, 0, 1], [i + 1, y, 0, 1]], [0, 0, -1], i, j);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geometry.setAttribute('aCell', new THREE.Float32BufferAttribute(cell, 2));
    geometry.setAttribute('aLift', new THREE.Float32BufferAttribute(lift, 1));
    geometry.setIndex(index);

    this.material = new THREE.MeshLambertMaterial({ transparent: true, opacity: 0.84, depthWrite: false });
    this.material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uniforms.uTime;
      shader.uniforms.uAmp = this.amp;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>',
          '#include <common>\nattribute vec2 aCell;\nattribute float aLift;\nuniform float uTime, uAmp;\nvarying float vWave;')
        .replace('#include <begin_vertex>', /* glsl */ `#include <begin_vertex>
          // Height follows the vertex (a continuous sheet, no seams); brightness follows the cell (blocky shimmer).
          float swell = sin(uTime * 1.3 + position.x * 0.55 + position.z * 0.21) + cos(uTime * 1.05 + position.z * 0.6 - position.x * 0.17);
          transformed.y += aLift * (swell * 0.07 * uAmp - 0.14);
          vWave = (sin(uTime * 1.3 + aCell.x * 0.55 + aCell.y * 0.21) + cos(uTime * 1.05 + aCell.y * 0.6 - aCell.x * 0.17)) * uAmp;`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vWave;')
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= 1.0 + vWave * 0.09;');
    };
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.receiveShadow = true;
    this.mesh.renderOrder = 1;
    this.mesh.name = 'water';
  }

  update(env) {
    const freeze = Math.min(1, env.weights[3] * 1.2);
    seasonColor(this.uniforms.palette, K.WATER, env.weights, this._colour);
    this.material.color.copy(this._colour).lerp(ICE, freeze * 0.75);
    this.material.opacity = 0.84 + freeze * 0.12;
    this.amp.value = (1 - freeze * 0.92) * (0.7 + 0.6 * env.blend.wind);
  }
}
