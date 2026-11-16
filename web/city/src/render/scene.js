// Renderer, isometric camera, lights and picking (screen point -> grid cell).

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GRID } from '../config.js';

const VIEW = 23; // world units visible vertically at zoom 1

export class Scene {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    if (!this.renderer.capabilities.isWebGL2) throw new Error('This browser does not support WebGL 2.');
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
    this.controls = new OrbitControls(this.camera, canvas);
    // Left button and single taps belong to the game; the camera uses the others.
    this.controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
    this.controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.screenSpacePanning = false;
    this.controls.minZoom = 0.6; this.controls.maxZoom = 4;
    this.controls.minPolarAngle = 0.45; this.controls.maxPolarAngle = 1.25;
    this.controls.addEventListener('change', () => {
      const t = this.controls.target, lim = GRID / 2;
      t.x = Math.max(-lim, Math.min(lim, t.x)); t.z = Math.max(-lim, Math.min(lim, t.z)); t.y = 0;
    });
    this.resetCamera();

    this.scene.add(new THREE.HemisphereLight(0xe4f2ff, 0xb9a27c, 1.7));
    const sun = new THREE.DirectionalLight(0xfff3df, 2.3);
    sun.position.set(-22, 34, 14);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -24; sc.right = 24; sc.top = 24; sc.bottom = -24; sc.near = 1; sc.far = 120;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
    this.scene.add(sun, sun.target);

    this._ray = new THREE.Raycaster();
    this._ndc = new THREE.Vector2();
    this._ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this._hit = new THREE.Vector3();
    this._v = new THREE.Vector3();
    this.resize();
  }

  resetCamera() {
    this.controls.target.set(0, 0, 0);
    this.camera.position.set(40, 36, 40); // classic isometric three-quarter view
    this.camera.zoom = 1;
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  resize() {
    const w = this.canvas.clientWidth || 1, h = this.canvas.clientHeight || 1;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h, false);
    const aspect = w / h;
    // Keep the whole island in view on narrow screens too.
    const half = Math.max(VIEW / 2, (VIEW * 0.78) / aspect);
    this.camera.left = -half * aspect; this.camera.right = half * aspect;
    this.camera.top = half; this.camera.bottom = -half;
    this.camera.updateProjectionMatrix();
  }

  // Grid cell under a screen point, or null if the ray misses the ground.
  cellAt(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    this._ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this._ray.setFromCamera(this._ndc, this.camera);
    if (!this._ray.ray.intersectPlane(this._ground, this._hit)) return null;
    const x = Math.floor(this._hit.x + GRID / 2), z = Math.floor(this._hit.z + GRID / 2);
    return x >= 0 && z >= 0 && x < GRID && z < GRID ? { x, z } : null;
  }

  // Screen position of a cell's centre (used by tests and callouts).
  screenOf(x, z) {
    const r = this.canvas.getBoundingClientRect();
    this._v.set(x + 0.5 - GRID / 2, 0, z + 0.5 - GRID / 2).project(this.camera);
    return { x: r.left + ((this._v.x + 1) / 2) * r.width, y: r.top + ((1 - this._v.y) / 2) * r.height };
  }

  render() { this.renderer.render(this.scene, this.camera); }
}
