// Grass tufts and flowers: one instanced mesh. Growth, bloom, sway and colour
// are shader-driven, so the instance matrices are written once.

import * as THREE from 'three';
import { K } from '../sim/world.js';
import { seasonColor } from './shared.js';

const PETALS = [0xfff3f0, 0xffd447, 0xe8559b, 0x9a7bf0, 0xff8a5c];

export class Flora {
  constructor(scene, world, rng, uniforms, counts) {
    this.uniforms = uniforms;
    this.grass = new THREE.Color();
    this.local = { uBloom: { value: 1 }, uGrow: { value: 1 }, uGrass: { value: this.grass } };
    const cells = world.grassCells;
    const total = cells.length ? counts.tufts + counts.flowers : 0;
    const geometry = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const isTuft = new Float32Array(total), seed = new Float32Array(total);
    const material = new THREE.MeshLambertMaterial();
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.local, { uTime: uniforms.uTime, uWind: uniforms.uWind });
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          attribute float aTuft; attribute float aSeed;
          uniform float uBloom, uGrow, uTime, uWind;
          varying float vTuft;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          float grown = aTuft > 0.5 ? uGrow * (0.75 + 0.25 * aSeed) : smoothstep(aSeed * 0.6, aSeed * 0.6 + 0.4, uBloom);
          transformed *= grown;
          transformed.x += transformed.y * sin(uTime * 2.1 + aSeed * 40.0) * 0.45 * uWind;
          vTuft = aTuft;`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uGrass;\nvarying float vTuft;')
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, uGrass, vTuft);');
    };
    this.mesh = new THREE.InstancedMesh(geometry, material, total);
    this.mesh.receiveShadow = true;
    const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    const colour = new THREE.Color();
    let patch = null;
    for (let k = 0; k < total; k++) {
      const tuft = k < counts.tufts;
      // Flowers grow in patches of eight around a shared spot.
      if (tuft || (k - counts.tufts) % 8 === 0) patch = cells[Math.floor(rng() * cells.length)];
      let cell = patch;
      if (!tuft) {
        const near = cells[Math.floor(rng() * cells.length)];
        if (Math.abs(near.i - patch.i) + Math.abs(near.j - patch.j) <= 3) cell = near;
      }
      const y = cell.h + 1;
      p.set(world.sceneX(cell.i) + (rng() - 0.5) * 0.8, tuft ? y : y + 0.12 + rng() * 0.14, world.sceneZ(cell.j) + (rng() - 0.5) * 0.8);
      if (tuft) s.set(0.13, 0.3 + rng() * 0.35, 0.13); else s.setScalar(0.2 + rng() * 0.08);
      this.mesh.setMatrixAt(k, m.compose(p, q, s));
      this.mesh.setColorAt(k, colour.set(tuft ? 0xffffff : PETALS[Math.floor(rng() * PETALS.length)]));
      isTuft[k] = tuft ? 1 : 0;
      seed[k] = rng();
    }
    geometry.setAttribute('aTuft', new THREE.InstancedBufferAttribute(isTuft, 1));
    geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 1));
    scene.add(this.mesh);
  }

  update(env) {
    const w = env.weights;
    seasonColor(this.uniforms.palette, K.GRASS, w, this.grass).multiplyScalar(0.8);
    this.local.uBloom.value = Math.max(0, w[0] + 0.7 * w[1] + 0.12 * w[2] - env.snowCover);
    this.local.uGrow.value = Math.max(0.12, (1 - 0.3 * w[2]) * (1 - 0.9 * env.snowCover));
  }
}
