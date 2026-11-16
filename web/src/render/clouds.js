// Blocky clouds that drift with the wind and thicken with the weather.

import * as THREE from 'three';

const SPAN = 130;
const FAIR = new THREE.Color(0xffffff), STORM = new THREE.Color(0x77818f);

export class Clouds {
  constructor(scene, rng, count) {
    this.material = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const box = new THREE.BoxGeometry(1, 1, 1);
    const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    this.items = [];
    for (let c = 0; c < count; c++) {
      const parts = 4 + Math.floor(rng() * 6);
      const mesh = new THREE.InstancedMesh(box, this.material, parts);
      for (let k = 0; k < parts; k++) {
        p.set((rng() - 0.5) * 9, (rng() - 0.5) * 1.2, (rng() - 0.5) * 6);
        s.set(3 + Math.floor(rng() * 5), 1 + Math.floor(rng() * 2), 3 + Math.floor(rng() * 4));
        mesh.setMatrixAt(k, m.compose(p, q, s));
      }
      mesh.castShadow = true;
      mesh.visible = false;
      scene.add(mesh);
      this.items.push({
        mesh, x: rng() * SPAN, y: 44 + rng() * 10, z: (rng() - 0.5) * 84,
        speed: 0.5 + rng() * 0.5, scale: 0, threshold: (c + 0.5) / count,
      });
    }
    // Shuffle which clouds appear first so thin cover is spread out.
    for (let c = count - 1; c > 0; c--) {
      const o = Math.floor(rng() * (c + 1));
      const tmp = this.items[c].threshold; this.items[c].threshold = this.items[o].threshold; this.items[o].threshold = tmp;
    }
  }

  reset() { for (const it of this.items) it.scale = 0; this._snap = true; }

  update(env, simDt, realDt) {
    const overcast = Math.min(1, Math.max(0, (env.blend.cloud - 0.3) / 0.7));
    this.material.color.copy(FAIR).lerp(STORM, overcast * 0.85);
    const ease = this._snap ? 1 : Math.min(1, realDt * 1.2);
    this._snap = false;
    for (const it of this.items) {
      it.x = (it.x + simDt * it.speed * (0.4 + env.blend.wind * 1.6)) % SPAN;
      const target = env.blend.cloud > it.threshold ? 1 : 0;
      it.scale += (target - it.scale) * ease;
      it.mesh.visible = it.scale > 0.02;
      if (!it.mesh.visible) continue;
      it.mesh.position.set(it.x - SPAN / 2, it.y, it.z);
      it.mesh.scale.setScalar(it.scale);
    }
  }
}
