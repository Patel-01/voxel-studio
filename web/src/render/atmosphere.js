// Sky, sun and moon, light, shadows and fog, all driven by the hour and the weather.

import * as THREE from 'three';
import { COUNTS, FOG, LIGHT, SKY_KEYS } from '../config.js';
import { smoothstep } from './shared.js';

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const SKY_FRAG = /* glsl */ `
uniform vec3 uZenith, uHorizon;
varying vec3 vDir;
void main() {
  float h = normalize(vDir).y;
  vec3 col = mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.55));
  if (h < 0.0) col = mix(uHorizon, mix(uHorizon, uZenith, 0.55), clamp(-h * 1.6, 0.0, 1.0));
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

const NIGHT_FILL = new THREE.Color(0x5f74b8);

export class Atmosphere {
  constructor(scene, rng) {
    this.keys = SKY_KEYS.map((k) => ({
      h: k.h, ambient: k.ambient,
      zenith: new THREE.Color(k.zenith), horizon: new THREE.Color(k.horizon), light: new THREE.Color(k.light),
    }));
    this.zenith = new THREE.Color();
    this.horizon = new THREE.Color();
    this.lightColor = new THREE.Color();
    this._grey = new THREE.Color();
    this.night = 0;
    this.daylight = 1;

    scene.fog = new THREE.FogExp2(0xffffff, FOG.base);
    this.fog = scene.fog;

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x6b5a4a, 1);
    scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xffffff, 1);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const cam = this.sun.shadow.camera;
    cam.left = -40; cam.right = 40; cam.top = 40; cam.bottom = -40; cam.near = 1; cam.far = 240;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.05;
    this.sun.target.position.set(0, 4, 0);
    scene.add(this.sun, this.sun.target);

    this.skyUniforms = { uZenith: { value: this.zenith }, uHorizon: { value: this.horizon } };
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(450, 32, 16),
      new THREE.ShaderMaterial({ uniforms: this.skyUniforms, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG,
        side: THREE.BackSide, depthWrite: false, fog: false }));
    dome.renderOrder = -3;
    dome.frustumCulled = false;
    scene.add(dome);

    const starPos = new Float32Array(COUNTS.stars * 3);
    for (let s = 0; s < COUNTS.stars; s++) {
      const u = rng() * 2 - 1, a = rng() * Math.PI * 2, r = Math.sqrt(1 - u * u);
      starPos[s * 3] = r * Math.cos(a) * 420; starPos[s * 3 + 1] = u * 420; starPos[s * 3 + 2] = r * Math.sin(a) * 420;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    this.stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
      color: 0xfff6dd, size: 2, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false }));
    this.stars.renderOrder = -2;
    this.stars.frustumCulled = false;
    scene.add(this.stars);

    const orb = new THREE.BoxGeometry(1, 1, 1);
    this.sunOrb = new THREE.Mesh(orb, new THREE.MeshBasicMaterial({ color: 0xffe9a8, fog: false }));
    this.sunOrb.scale.setScalar(26);
    this.moonOrb = new THREE.Mesh(orb, new THREE.MeshBasicMaterial({ color: 0xdfe6ff, fog: false }));
    this.moonOrb.scale.setScalar(16);
    this.sunOrb.renderOrder = this.moonOrb.renderOrder = -1;
    scene.add(this.sunOrb, this.moonOrb);
  }

  update(env) {
    const hour = env.hour;
    let k = 0;
    while (k < this.keys.length - 2 && hour >= this.keys[k + 1].h) k++;
    const a = this.keys[k], b = this.keys[k + 1];
    const t = (hour - a.h) / (b.h - a.h);
    this.zenith.lerpColors(a.zenith, b.zenith, t);
    this.horizon.lerpColors(a.horizon, b.horizon, t);
    this.lightColor.lerpColors(a.light, b.light, t);
    const ambient = a.ambient + (b.ambient - a.ambient) * t;

    // Overcast skies flatten toward grey and dim the sun.
    const overcast = Math.min(1, Math.max(0, (env.blend.cloud - 0.3) / 0.7));
    const murk = Math.max(overcast, env.blend.fog * 0.8);
    const lum = Math.pow(ambient / 0.95, 2); // overcast nights stay dark
    this._grey.setRGB(0.30 * lum, 0.34 * lum, 0.40 * lum);
    this.zenith.lerp(this._grey, murk * 0.8);
    this._grey.setRGB(0.50 * lum, 0.54 * lum, 0.58 * lum);
    this.horizon.lerp(this._grey, murk * 0.8);

    const phi = ((hour - 5.5) / 14) * Math.PI; // sun up 05:30, down 19:30
    const elev = Math.sin(phi);
    const sunUp = smoothstep(-0.02, 0.2, elev), moonUp = smoothstep(0.02, 0.25, -elev);
    const side = elev >= 0 ? 1 : -1;
    const dx = Math.cos(phi) * side, dy = Math.abs(elev) * 0.9, dz = 0.45;
    const len = Math.hypot(dx, dy, dz);
    this.sun.position.set((dx / len) * 110, (dy / len) * 110 + 4, (dz / len) * 110);
    this.sun.color.copy(this.lightColor);
    this.sun.intensity = Math.max(sunUp * LIGHT.sun, moonUp * LIGHT.moon) * (1 - LIGHT.overcastDim * murk);

    this.night = 1 - smoothstep(-0.12, 0.1, elev);
    // The sky is nearly black at night, so fill light leans on a fixed moonlit blue instead.
    this.hemi.color.copy(this.zenith).lerp(this.horizon, 0.5).lerp(NIGHT_FILL, this.night * 0.85);
    this.hemi.intensity = LIGHT.hemi * ambient * (1 - 0.25 * murk);

    this.fog.color.copy(this.horizon);
    this.fog.density = FOG.base + FOG.weather * Math.pow(env.blend.fog, 1.5);

    this.daylight = ambient;
    this.stars.material.opacity = this.night * (1 - murk);
    this.stars.visible = this.stars.material.opacity > 0.01;

    const sx = Math.cos(phi), sy = elev * 0.9;
    this.sunOrb.position.set(sx * 330, sy * 330, 150);
    this.moonOrb.position.set(-sx * 330, -sy * 330, 150);
    this.sunOrb.rotation.z = this.moonOrb.rotation.z = phi * 0.5;
    this.sunOrb.visible = sy > -0.12 && murk < 0.85;
    this.moonOrb.visible = sy < 0.12 && murk < 0.85;
  }
}
