// Rain, snow and falling leaves. Motion is computed in the vertex shader from a
// time uniform, so there is no per-frame CPU work and nothing to allocate.

import * as THREE from 'three';

const FALL_VERT = /* glsl */ `
uniform float uTime, uSpeed, uSize, uScale, uSway, uDrift;
uniform vec3 uBox;
attribute float aSeed;
void main() {
  vec3 p = position;
  p.y = mod(p.y - uTime * uSpeed * (0.75 + 0.5 * aSeed), uBox.y);
  p.x = mod(p.x + uTime * uDrift + sin(uTime * 1.3 + aSeed * 30.0) * uSway + uBox.x * 0.5, uBox.x) - uBox.x * 0.5;
  p.z += cos(uTime * 1.1 + aSeed * 17.0) * uSway;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * uScale / -mv.z;
}`;
const FALL_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity, uStreak;
void main() {
  if (abs(gl_PointCoord.x - 0.5) > uStreak) discard;
  gl_FragColor = vec4(uColor, uOpacity);
  #include <colorspace_fragment>
}`;

class Fall {
  constructor(scene, rng, shared, { count, box, speed, size, sway, streak, color, opacity }) {
    const pos = new Float32Array(count * 3), seed = new Float32Array(count);
    for (let k = 0; k < count; k++) {
      pos[k * 3] = (rng() - 0.5) * box[0]; pos[k * 3 + 1] = rng() * box[1]; pos[k * 3 + 2] = (rng() - 0.5) * box[2];
      seed[k] = rng();
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.count = count;
    this.base = new THREE.Color(color);
    this.opacity = opacity;
    this.uniforms = {
      uTime: shared.uTime, uScale: shared.uPointScale,
      uSpeed: { value: speed }, uSize: { value: size }, uSway: { value: sway }, uDrift: { value: 0 },
      uBox: { value: new THREE.Vector3(...box) }, uStreak: { value: streak },
      uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity },
    };
    this.points = new THREE.Points(geometry, new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: FALL_VERT, fragmentShader: FALL_FRAG, transparent: true, depthWrite: false }));
    this.points.frustumCulled = false;
    this.points.visible = false;
    this.points.renderOrder = 3;
    scene.add(this.points);
  }

  set(amount, brightness, drift) {
    this.points.visible = amount > 0.01;
    if (!this.points.visible) return;
    this.points.geometry.setDrawRange(0, Math.floor(this.count * amount));
    this.uniforms.uColor.value.copy(this.base).multiplyScalar(brightness);
    this.uniforms.uDrift.value = drift;
  }
}

const LEAF_VERT = /* glsl */ `
uniform float uTime, uScale, uWind;
attribute float aSeed;
attribute vec3 color;
varying vec3 vColor;
varying float vFade;
void main() {
  float fall = fract(uTime * 0.11 * (0.6 + aSeed) + aSeed * 7.0);
  vec3 p = position + vec3(
    sin(fall * 6.0 + aSeed * 20.0) * 1.1 + fall * uWind * 3.5,
    -fall * (2.5 + aSeed * 3.0),
    cos(fall * 5.0 + aSeed * 11.0) * 1.1);
  vColor = color;
  vFade = smoothstep(0.0, 0.08, fall) * (1.0 - smoothstep(0.75, 1.0, fall));
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = 0.2 * uScale / -mv.z;
}`;
const LEAF_FRAG = /* glsl */ `
uniform float uBright;
varying vec3 vColor;
varying float vFade;
void main() {
  gl_FragColor = vec4(vColor * uBright, vFade);
  #include <colorspace_fragment>
}`;

export class Precipitation {
  constructor(scene, rng, shared, world) {
    this.rain = new Fall(scene, rng, shared, {
      count: 2600, box: [70, 44, 70], speed: 30, size: 1.3, sway: 0.0, streak: 0.045, color: 0xbcd4ee, opacity: 0.55 });
    this.snow = new Fall(scene, rng, shared, {
      count: 1500, box: [70, 44, 70], speed: 2.6, size: 0.17, sway: 0.8, streak: 0.5, color: 0xffffff, opacity: 0.9 });

    const crowns = world.crowns, perTree = 6, count = crowns.length * perTree;
    const pos = new Float32Array(count * 3), seed = new Float32Array(count), col = new Float32Array(count * 3);
    const tint = new THREE.Color();
    for (let k = 0; k < count; k++) {
      const c = crowns[Math.floor(k / perTree)];
      pos[k * 3] = world.sceneX(c.i); pos[k * 3 + 1] = c.h - 0.5; pos[k * 3 + 2] = world.sceneZ(c.j);
      seed[k] = rng();
      tint.setHSL(0.02 + rng() * 0.09, 0.85, 0.5);
      col[k * 3] = tint.r; col[k * 3 + 1] = tint.g; col[k * 3 + 2] = tint.b;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.leafCount = count;
    this.leafUniforms = { uTime: shared.uTime, uScale: shared.uPointScale, uWind: shared.uWind, uBright: { value: 1 } };
    this.leaves = new THREE.Points(geometry, new THREE.ShaderMaterial({
      uniforms: this.leafUniforms, vertexShader: LEAF_VERT, fragmentShader: LEAF_FRAG, transparent: true, depthWrite: false }));
    this.leaves.frustumCulled = false;
    this.leaves.visible = false;
    scene.add(this.leaves);
  }

  update(env, brightness) {
    const light = 0.1 + 0.9 * Math.pow(brightness, 1.6);
    this.rain.set(env.blend.rain, light, env.blend.wind * 5);
    this.snow.set(env.blend.snow, light, env.blend.wind * 1.5);
    const autumn = env.weights[2];
    this.leaves.visible = autumn > 0.05 && this.leafCount > 0;
    if (this.leaves.visible) {
      this.leaves.geometry.setDrawRange(0, Math.floor(this.leafCount * autumn));
      this.leafUniforms.uBright.value = light;
    }
  }
}
