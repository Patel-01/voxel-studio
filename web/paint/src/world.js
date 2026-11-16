// The 3D diorama. Every map cell is a column that springs toward its target height;
// trees and houses pop in on top. Nothing here knows about the page or the brush.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { N, WATER, SAND, GRASS, FOREST, MOUNTAIN, TOWN, TIMES } from './config.js';
import { hash3 } from './map.js';

const HS = 0.5;        // world units per height step
const BASE = -1.5;     // bottom of every column
const CAP = 0.22;      // thickness of the coloured top layer
const WATER_Y = 0.12;
const NONE = 0, TREE = 1, HOUSE = 2;
const CELLS = N * N;

const topOf = (h) => h * HS - 0.5 + Math.min(Math.max(h, 0), 1) * 0.5;

function propFor(biome, h, snow, x, z) {
  const r = hash3(x, z, 91);
  if (biome === FOREST) return r < 0.78 ? TREE : NONE;
  if (biome === GRASS) return r < 0.035 ? TREE : NONE;
  if (biome === MOUNTAIN) return !snow && h < 8 && r < 0.1 ? TREE : NONE;
  if (biome === TOWN) return r < 0.62 ? HOUSE : NONE;
  return NONE;
}

// Write a translate * rotateY * scale matrix straight into an instance buffer.
function put(arr, i, px, py, pz, sx, sy, sz, rot = 0) {
  const o = i * 16, c = Math.cos(rot), s = Math.sin(rot);
  arr[o] = c * sx; arr[o + 1] = 0; arr[o + 2] = -s * sx; arr[o + 3] = 0;
  arr[o + 4] = 0; arr[o + 5] = sy; arr[o + 6] = 0; arr[o + 7] = 0;
  arr[o + 8] = s * sz; arr[o + 9] = 0; arr[o + 10] = c * sz; arr[o + 11] = 0;
  arr[o + 12] = px; arr[o + 13] = py; arr[o + 14] = pz; arr[o + 15] = 1;
}

const HOUSE_WALLS = [0xf3e6cf, 0xe9c9a0, 0xf6f1e7, 0xd9a27a, 0xcfd8dc];
const HOUSE_ROOFS = [0xb9472f, 0x8c3b2a, 0x5b6470, 0xc56a3a];

export class World {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(30, 1, 1, 600);
    this.camera.position.set(42, 52, 78);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(0, 1.5, 0);
    this.controls.enablePan = false;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.1;
    this.controls.minPolarAngle = 0.35; this.controls.maxPolarAngle = 1.35;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.7;

    this.hemi = new THREE.HemisphereLight(0xe4f2ff, 0xb9a27c, 1.7);
    this.sun = new THREE.DirectionalLight(0xfff3df, 2.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -44; sc.right = 44; sc.top = 44; sc.bottom = -44; sc.near = 1; sc.far = 200;
    this.sun.shadow.bias = -0.0005; this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.hemi, this.sun, this.sun.target);

    // Per-cell animation state.
    this.cur = new Float32Array(CELLS);      // current height
    this.vel = new Float32Array(CELLS);
    this.target = new Float32Array(CELLS);
    this.delay = new Float32Array(CELLS);    // seconds before a cell starts moving (for waves)
    this.active = new Uint8Array(CELLS);
    this.pending = new Uint8Array(CELLS);    // colours and props still to be applied
    this.kind = new Uint8Array(CELLS);       // prop currently shown
    this.want = new Uint8Array(CELLS);       // prop the map asks for
    this.ps = new Float32Array(CELLS);       // prop scale
    this.pv = new Float32Array(CELLS);
    this.stats = { land: 0, peak: 0, trees: 0, homes: 0 };
    this.map = null;

    this._build();
    this.timeIndex = 0;
    this._time = { ...this._timeTarget(0) };
    this._applyTime();
    for (let i = 0; i < CELLS; i++) { this.active[i] = 1; this.pending[i] = 1; }
  }

  _mesh(geometry, material, shadows = true) {
    const mesh = new THREE.InstancedMesh(geometry, material, CELLS);
    mesh.frustumCulled = false;
    mesh.castShadow = shadows; mesh.receiveShadow = true;
    mesh.instanceMatrix.array.fill(0);
    const white = new THREE.Color(1, 1, 1);
    for (let i = 0; i < CELLS; i++) mesh.setColorAt(i, white);
    this.scene.add(mesh);
    return mesh;
  }

  _build() {
    const box = (w, h, d, y) => new THREE.BoxGeometry(w, h, d).translate(0, y, 0);
    const mat = (opts = {}) => new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, ...opts });

    this.body = this._mesh(box(1, 1, 1, 0.5), mat());
    this.cap = this._mesh(box(1, CAP, 1, -CAP / 2), mat());
    this.trunk = this._mesh(box(0.16, 0.5, 0.16, 0.25), mat({ color: 0x7a5234 }));
    this.leafA = this._mesh(box(0.72, 0.46, 0.72, 0.66), mat());
    this.leafB = this._mesh(box(0.44, 0.4, 0.44, 1.05), mat());
    this.wall = this._mesh(box(0.64, 0.5, 0.64, 0.25), mat());
    this.roof = this._mesh(new THREE.ConeGeometry(0.52, 0.36, 4).rotateY(Math.PI / 4).translate(0, 0.18, 0), mat());
    this.windowMat = mat({ color: 0x3b4a5a, emissive: 0xffc860, emissiveIntensity: 0 });
    this.windows = this._mesh(box(0.67, 0.17, 0.3, 0.3), this.windowMat, false);
    this.meshes = [this.body, this.cap, this.trunk, this.leafA, this.leafB, this.wall, this.roof, this.windows];

    this.waterMat = new THREE.MeshStandardMaterial({ color: 0x3f93d6, transparent: true, opacity: 0.74, roughness: 0.25, metalness: 0.1 });
    this.water = new THREE.Mesh(new THREE.BoxGeometry(N - 0.02, WATER_Y + 0.5, N - 0.02), this.waterMat);
    this.water.position.y = (WATER_Y - 0.5) / 2;
    this.water.receiveShadow = true;
    this.scene.add(this.water);

    const slab = new THREE.Mesh(new THREE.BoxGeometry(N + 1.2, 0.5, N + 1.2), mat({ color: 0x2b2f3a }));
    slab.position.y = BASE - 0.25;
    slab.receiveShadow = true;
    this.scene.add(slab);

    // A few drifting clouds; their shadows slide over the land.
    const puffs = 18;
    this.clouds = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat({ color: 0xffffff, transparent: true, opacity: 0.92 }), puffs);
    this.clouds.castShadow = true; this.clouds.frustumCulled = false;
    this.cloudData = [];
    for (let c = 0; c < puffs / 3; c++) {
      const cx = (hash3(c, 1, 3) - 0.5) * 80, cz = (hash3(c, 2, 3) - 0.5) * 60, cy = 13 + hash3(c, 3, 3) * 4;
      for (let p = 0; p < 3; p++) {
        this.cloudData.push({ x: cx + (p - 1) * 2.2, y: cy + (p === 1 ? 0.5 : 0), z: cz + (hash3(c, p, 4) - 0.5) * 1.5,
          sx: 3 + hash3(c, p, 5) * 2, sy: 1 + (p === 1 ? 0.6 : 0), sz: 2.2 + hash3(c, p, 6) * 1.4 });
      }
    }
    this.scene.add(this.clouds);

    const starPos = new Float32Array(260 * 3);
    for (let i = 0; i < 260; i++) {
      const a = hash3(i, 1, 8) * Math.PI * 2, e = 0.12 + hash3(i, 2, 8) * 1.3, r = 260;
      starPos[i * 3] = Math.cos(a) * Math.cos(e) * r; starPos[i * 3 + 1] = Math.sin(e) * r; starPos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    this.starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, transparent: true, opacity: 0 });
    this.scene.add(new THREE.Points(starGeo, this.starMat));
  }

  // ---- time of day -------------------------------------------------------
  _timeTarget(index) {
    const t = TIMES[index];
    return {
      sun: new THREE.Color(t.sun), sunI: t.sunI, hemiI: t.hemiI, pos: new THREE.Vector3(...t.sunPos),
      glow: [0, 1.6, 2.8][index], stars: [0, 0.25, 1][index],
      water: new THREE.Color([0x3f93d6, 0x6d6aa8, 0x27469a][index]), cloud: [0.92, 0.8, 0.35][index],
    };
  }

  setTime(index) { this.timeIndex = index; }

  _applyTime() {
    const t = this._time;
    this.sun.color.copy(t.sun); this.sun.intensity = t.sunI; this.hemi.intensity = t.hemiI;
    this.sun.position.copy(t.pos);
    this.windowMat.emissiveIntensity = t.glow;
    this.starMat.opacity = t.stars;
    this.waterMat.color.copy(t.water);
    this.clouds.material.opacity = t.cloud;
  }

  _stepTime(dt) {
    const goal = this._timeTarget(this.timeIndex), t = this._time, k = 1 - Math.exp(-dt * 3);
    t.sun.lerp(goal.sun, k); t.water.lerp(goal.water, k); t.pos.lerp(goal.pos, k);
    for (const key of ['sunI', 'hemiI', 'glow', 'stars', 'cloud']) t[key] += (goal[key] - t[key]) * k;
    this._applyTime();
  }

  // ---- map -> world ------------------------------------------------------
  // Pull new targets from the map. With wave = true the change ripples out from the centre.
  sync(map, wave = false) {
    this.map = map;
    const c = (N - 1) / 2, stats = { land: 0, peak: 0, trees: 0, homes: 0 };
    if (!this._biome) { this._biome = new Uint8Array(CELLS).fill(255); this._snow = new Uint8Array(CELLS); }
    for (let i = 0; i < CELLS; i++) {
      const x = i % N, z = (i / N) | 0, b = map.biome[i], h = map.height[i], s = map.snow[i];
      const prop = propFor(b, h, s, x, z);
      if (b !== WATER) stats.land++;
      if (h > stats.peak) stats.peak = h;
      if (prop === TREE) stats.trees++; else if (prop === HOUSE) stats.homes++;
      if (this.target[i] === h && this._biome[i] === b && this._snow[i] === s) continue;
      this.target[i] = h; this._biome[i] = b; this._snow[i] = s; this.want[i] = prop;
      this.active[i] = 1; this.pending[i] = 1;
      this.delay[i] = wave ? Math.hypot(x - c, z - c) * 0.022 : 0;
    }
    stats.land = Math.round((stats.land / CELLS) * 100);
    this.stats = stats;
  }

  _colour(i) {
    const x = i % N, z = (i / N) | 0, b = this._biome[i], h = this.target[i];
    const j = 0.94 + hash3(x, z, 3) * 0.12, col = World._c;
    let top, side;
    if (b === WATER) { top = 0xb9ad84; side = 0x8f8566; }
    else if (b === SAND) { top = 0xeedfa6; side = 0xcdb97c; }
    else if (b === GRASS) { top = 0x7fc65c; side = 0x8a6a48; }
    else if (b === FOREST) { top = 0x4f9a48; side = 0x80603f; }
    else if (b === TOWN) { top = 0xd3c7ae; side = 0x97886c; }
    else { top = this._snow[i] ? 0xf7fbff : 0x9a9ca6; side = 0x777984; }
    col.setHex(top).multiplyScalar(j);
    if (b === MOUNTAIN && !this._snow[i]) col.multiplyScalar(0.82 + Math.min(h, 12) * 0.022);
    this.cap.setColorAt(i, col);
    this.body.setColorAt(i, col.setHex(side).multiplyScalar(j));
  }

  _propColour(i, kind) {
    const x = i % N, z = (i / N) | 0, col = World._c;
    if (kind === TREE) {
      const snowy = this._biome[i] === MOUNTAIN;
      col.setHex(snowy ? 0x3c7a52 : 0x3f8f45).multiplyScalar(0.85 + hash3(x, z, 12) * 0.35);
      this.leafA.setColorAt(i, col);
      this.leafB.setColorAt(i, col.multiplyScalar(1.12));
    } else if (kind === HOUSE) {
      this.wall.setColorAt(i, col.setHex(HOUSE_WALLS[(hash3(x, z, 13) * HOUSE_WALLS.length) | 0]));
      this.roof.setColorAt(i, col.setHex(HOUSE_ROOFS[(hash3(x, z, 14) * HOUSE_ROOFS.length) | 0]));
    }
  }

  // ---- animation ---------------------------------------------------------
  step(dt) {
    dt = Math.min(dt, 1 / 30);
    this._stepTime(dt);
    const half = N / 2, bodyM = this.body.instanceMatrix.array, capM = this.cap.instanceMatrix.array;
    const trunkM = this.trunk.instanceMatrix.array, laM = this.leafA.instanceMatrix.array, lbM = this.leafB.instanceMatrix.array;
    const wallM = this.wall.instanceMatrix.array, roofM = this.roof.instanceMatrix.array, winM = this.windows.instanceMatrix.array;
    let moved = false, coloured = false;

    for (let i = 0; i < CELLS; i++) {
      if (!this.active[i]) continue;
      if (this.delay[i] > 0) { this.delay[i] -= dt; continue; }
      moved = true;
      if (this.pending[i]) { this.pending[i] = 0; this._colour(i); coloured = true; }

      // Height spring (slightly under-damped so land lands with a small bounce).
      const dh = this.target[i] - this.cur[i];
      this.vel[i] += (dh * 150 - this.vel[i] * 15) * dt;
      this.cur[i] += this.vel[i] * dt;
      let settled = Math.abs(dh) < 0.004 && Math.abs(this.vel[i]) < 0.02;
      if (settled) { this.cur[i] = this.target[i]; this.vel[i] = 0; }

      // Prop spring: shrink the old prop away, swap, then grow the new one.
      const swapping = this.kind[i] !== this.want[i];
      const goal = swapping || this.kind[i] === NONE ? 0 : 1;
      const dp = goal - this.ps[i];
      this.pv[i] += (dp * 260 - this.pv[i] * 19) * dt;
      this.ps[i] += this.pv[i] * dt;
      if (swapping && this.ps[i] < 0.04) {
        this.kind[i] = this.want[i]; this.ps[i] = 0; this.pv[i] = 0;
        this._propColour(i, this.kind[i]); coloured = true;
        settled = false;
      } else if (Math.abs(dp) < 0.004 && Math.abs(this.pv[i]) < 0.02) this.ps[i] = goal;
      else settled = false;

      const x = i % N, z = (i / N) | 0, wx = x - half + 0.5, wz = z - half + 0.5;
      const top = topOf(this.cur[i]);
      put(bodyM, i, wx, BASE, wz, 1, Math.max(0.01, top - CAP - BASE), 1);
      put(capM, i, wx, top, wz, 1, 1, 1);

      const s = Math.max(0, this.ps[i]), kind = this.kind[i];
      const tree = kind === TREE ? s * (0.8 + hash3(x, z, 5) * 0.55) : 0;
      const ox = (hash3(x, z, 6) - 0.5) * 0.3, oz = (hash3(x, z, 7) - 0.5) * 0.3, rot = hash3(x, z, 9) * 1.57;
      put(trunkM, i, wx + ox, top, wz + oz, tree, tree, tree, rot);
      put(laM, i, wx + ox, top, wz + oz, tree, tree, tree, rot);
      put(lbM, i, wx + ox, top, wz + oz, tree, tree, tree, rot);

      const house = kind === HOUSE ? s : 0, r = hash3(x, z, 10);
      const floors = 1 + (r > 0.72 ? 1 : 0) + (r > 0.93 ? 1 : 0), turn = r > 0.5 ? 1.5708 : 0;
      put(wallM, i, wx, top, wz, house, house * floors, house, turn);
      put(roofM, i, wx, top + 0.5 * floors * house, wz, house, house, house, turn);
      put(winM, i, wx, top + 0.5 * (floors - 1) * house, wz, house, house, house, turn);

      if (settled) this.active[i] = 0;
    }

    if (moved) for (const m of this.meshes) m.instanceMatrix.needsUpdate = true;
    if (coloured) for (const m of this.meshes) m.instanceColor.needsUpdate = true;

    this._clock = (this._clock || 0) + dt;
    const tmp = this.clouds.instanceMatrix.array;
    this.cloudData.forEach((p, k) => {
      const x = ((p.x + this._clock * 0.9 + 55) % 110 + 110) % 110 - 55;
      put(tmp, k, x, p.y, p.z, p.sx, p.sy, p.sz);
    });
    this.clouds.instanceMatrix.needsUpdate = true;
    this.water.position.y = (WATER_Y - 0.5) / 2 + Math.sin(this._clock * 1.3) * 0.02;
    this.controls.update();
  }

  get busy() { return this.active.includes(1); }

  resize() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h, false);
    this.setAspect(w / h);
  }

  // Frame the whole diorama whatever the shape of the view.
  setAspect(aspect) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    const vHalf = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const hHalf = Math.atan(Math.tan(vHalf) * aspect);
    const dist = Math.max(31 / Math.tan(hHalf), 27 / Math.tan(vHalf));
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    this.camera.position.copy(this.controls.target).addScaledVector(dir, dist);
    this.controls.minDistance = dist * 0.45; this.controls.maxDistance = dist * 1.3;
  }

  render() { this.renderer.render(this.scene, this.camera); }
}

World._c = new THREE.Color();
