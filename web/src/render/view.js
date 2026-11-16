// Assembles the scene and draws it. Reads simulation state; never changes it.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CAMERA, COUNTS } from '../config.js';
import { makeRng } from '../sim/rng.js';
import { Atmosphere } from './atmosphere.js';
import { Clouds } from './clouds.js';
import { Creatures } from './creatures.js';
import { Flora } from './flora.js';
import { Precipitation } from './particles.js';
import { makeWorldUniforms } from './shared.js';
import { buildTerrain } from './terrain.js';
import { Water } from './water.js';

export class View {
  constructor(canvas, world, sim) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    if (!this.renderer.capabilities.isWebGL2) throw new Error('This browser does not support WebGL 2.');
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(CAMERA.fov, 1, 1, 1200);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.minDistance = CAMERA.minDistance;
    this.controls.maxDistance = CAMERA.maxDistance;
    this.controls.minPolarAngle = 0.25;
    this.controls.maxPolarAngle = 1.5;
    this.controls.addEventListener('change', () => { this.dirty = true; });
    this.resetCamera();

    const rng = makeRng(world.seed * 104729 + 5); // scenery only; separate from the simulation's streams
    this.uniforms = makeWorldUniforms(world);
    this.uniforms.uPointScale = { value: 1 };

    this.atmosphere = new Atmosphere(this.scene, rng);
    this.scene.add(buildTerrain(world, this.uniforms));
    this.water = new Water(world, this.uniforms);
    this.scene.add(this.water.mesh);
    this.flora = new Flora(this.scene, world, rng, this.uniforms, COUNTS);
    this.clouds = new Clouds(this.scene, rng, COUNTS.clouds);
    this.precipitation = new Precipitation(this.scene, rng, this.uniforms, world);
    this.creatures = new Creatures(this.scene, sim);

    this.lamp = new THREE.PointLight(0xffb463, 0, 11, 2);
    if (world.cabin) {
      this.lamp.position.set(world.sceneX(world.cabin.i), world.cabin.h + 1.2, world.sceneZ(world.cabin.j));
      this.scene.add(this.lamp);
    }

    this._lastTime = sim.env.time;
    this.dirty = true;
    this.resize();
  }

  resetCamera() {
    this.camera.position.set(...CAMERA.position);
    this.controls.target.set(...CAMERA.target);
    this.controls.update();
    this.dirty = true;
  }

  // Call after the simulation is reset so scenery restarts with it.
  resetScenery(sim) {
    this._lastTime = sim.env.time;
    this.clouds.reset();
    this.dirty = true;
  }

  resize() {
    const w = this.canvas.clientWidth || 1, h = this.canvas.clientHeight || 1;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    // World-unit point sizes: pixels per unit at distance 1.
    this.uniforms.uPointScale.value =
      (h * this.renderer.getPixelRatio()) / (2 * Math.tan(THREE.MathUtils.degToRad(CAMERA.fov) / 2));
    this.dirty = true;
  }

  update(sim, realDt) {
    const env = sim.env, u = this.uniforms;
    const simDt = Math.max(0, env.time - this._lastTime);
    this._lastTime = env.time;
    u.uTime.value = env.time % 3600;
    u.uSeason.value = ((env.season % 4) + 4) % 4;
    u.uSnow.value = env.snowCover;
    u.uWind.value = env.blend.wind;
    this.atmosphere.update(env);
    u.uNight.value = this.atmosphere.night;
    this.lamp.intensity = this.atmosphere.night * 26;
    this.water.update(env);
    this.flora.update(env);
    this.clouds.update(env, simDt, realDt);
    this.precipitation.update(env, this.atmosphere.daylight);
    this.creatures.update(sim);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
    this.dirty = false;
  }

  // Draws a fresh frame and hands back a PNG blob of exactly what is on screen.
  capture() {
    this.render();
    return new Promise((resolve, reject) => {
      this.canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not read the canvas.'))), 'image/png');
    });
  }
}
