// Draws birds and islanders from simulation state. Matrices are composed into
// scratch objects created once.

import * as THREE from 'three';
import { PERCHED } from '../sim/birds.js';

const TUNICS = [0xc8553d, 0xd9a441, 0x3f8f8a, 0x7a5ea8, 0x4f7fc0];

export class Creatures {
  constructor(scene, sim) {
    const nb = sim.birds.count, nv = sim.villagers.count;
    this.birdBody = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.34, 0.26, 0.8), new THREE.MeshLambertMaterial({ color: 0xf5efe4 }), nb);
    this.birdWing = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.66, 0.05, 0.38).translate(0.33, 0, 0), new THREE.MeshLambertMaterial({ color: 0x9aa5b4 }), nb * 2);
    this.body = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.46, 0.6, 0.36).translate(0, 0.3, 0), new THREE.MeshLambertMaterial(), nv);
    this.head = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.34, 0.32, 0.34).translate(0, 0.78, 0), new THREE.MeshLambertMaterial({ color: 0xe9bb92 }), nv);
    const c = new THREE.Color();
    for (let v = 0; v < nv; v++) this.body.setColorAt(v, c.set(TUNICS[v % TUNICS.length]));
    for (const mesh of [this.birdBody, this.birdWing, this.body, this.head]) {
      mesh.castShadow = true;
      mesh.frustumCulled = false; // instances roam far from the mesh origin
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(mesh);
    }
    this._m = new THREE.Matrix4();
    this._w = new THREE.Matrix4();
    this._out = new THREE.Matrix4();
    this._e = new THREE.Euler(0, 0, 0, 'YXZ');
    this._p = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);
  }

  update(sim) {
    const { birds, villagers } = sim;
    const m = this._m, w = this._w, out = this._out;
    for (let b = 0; b < birds.count; b++) {
      const o = b * 3;
      m.makeRotationFromEuler(this._e.set(-birds.pitch[b], birds.yaw[b], 0));
      m.setPosition(birds.pos[o], birds.pos[o + 1], birds.pos[o + 2]);
      this.birdBody.setMatrixAt(b, m);
      const angle = birds.state[b] === PERCHED ? -1.25 : Math.sin(birds.flap[b]) * 0.75 + 0.1;
      w.makeRotationZ(angle).setPosition(0.14, 0.06, 0);
      this.birdWing.setMatrixAt(b * 2, out.multiplyMatrices(m, w));
      w.makeRotationZ(Math.PI - angle).setPosition(-0.14, 0.06, 0);
      this.birdWing.setMatrixAt(b * 2 + 1, out.multiplyMatrices(m, w));
    }
    this.birdBody.instanceMatrix.needsUpdate = true;
    this.birdWing.instanceMatrix.needsUpdate = true;

    for (let v = 0; v < villagers.count; v++) {
      const o = v * 3;
      this._p.set(villagers.pos[o], villagers.pos[o + 1], villagers.pos[o + 2]);
      this._q.setFromAxisAngle(this._up, villagers.yaw[v]);
      this._s.setScalar(Math.max(0.0001, villagers.visible[v]));
      m.compose(this._p, this._q, this._s);
      this.body.setMatrixAt(v, m);
      this.head.setMatrixAt(v, m);
    }
    this.body.instanceMatrix.needsUpdate = true;
    this.head.instanceMatrix.needsUpdate = true;
  }
}
