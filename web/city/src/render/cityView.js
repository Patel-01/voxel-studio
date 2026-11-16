// Draws the city from game state: buildings, the merged road layer, placement
// ghost, selection, warning pins, turbine rotors and cars. Reads state only.

import * as THREE from 'three';
import { GRID } from '../config.js';
import { DEFS, DIR, bridgeParts, isRoad, roadParts } from '../buildings.js';
import { makeRng } from '../rng.js';
import { GeometryBuilder, ModelCache } from './models.js';
import { buildTerrain, buildWater } from './terrainMesh.js';

const GHOST = { ok: 0x2fbf71, bad: 0xe5484d, swap: 0xf2a52b, hover: 0xffffff, select: 0xffd23f };
const CAR_COLOURS = [0xd65a4a, 0x3f7fbf, 0xf2c14e, 0xf4f1ea, 0x4fae7a];
const DIRS = [[0, -1, DIR.N], [1, 0, DIR.E], [0, 1, DIR.S], [-1, 0, DIR.W]];

export class CityView {
  constructor(scene, game) {
    this.scene = scene;
    this.game = game;
    this.models = new ModelCache();
    this.items = new Map();   // building id -> { group, mesh, pin, rotor, key }
    this.rotors = [];
    this.uTime = { value: 0 };
    this.root = new THREE.Group();
    scene.add(this.root);

    this.root.add(buildTerrain(game.grid), buildWater(game.grid, this.uTime));

    this.material = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.treeMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.treeMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.uTime;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          float phase = modelMatrix[3].x * 1.3 + modelMatrix[3].z * 0.9;
          transformed.x += sin(uTime * 1.6 + phase) * 0.05 * position.y;
          transformed.z += cos(uTime * 1.3 + phase) * 0.03 * position.y;`);
    };

    this.roadMesh = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
    this.roadMesh.receiveShadow = true; this.roadMesh.castShadow = true;
    this.root.add(this.roadMesh);
    this.roadKey = '';
    this.roadCells = [];

    // Placement ghost: a tinted copy of the model plus a footprint tile.
    this.ghostMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.6, depthWrite: false });
    this.ghost = new THREE.Mesh(new THREE.BufferGeometry(), this.ghostMaterial);
    this.ghost.visible = false; this.ghost.renderOrder = 5;
    const tileGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.tile = new THREE.Mesh(tileGeo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.5, depthWrite: false }));
    this.tile.visible = false; this.tile.renderOrder = 4;
    this.selTile = new THREE.Mesh(tileGeo, new THREE.MeshBasicMaterial({ color: GHOST.select, transparent: true, opacity: 0.95, depthWrite: false }));
    this.selTile.visible = false; this.selTile.renderOrder = 3;
    this.root.add(this.ghost, this.tile, this.selTile);
    this._ghostGeo = new Map();

    const pinGeo = new THREE.BoxGeometry(0.2, 0.2, 0.2).rotateZ(Math.PI / 4).rotateX(Math.PI / 4);
    this.pinGeo = pinGeo;
    this.pinMats = [null, new THREE.MeshBasicMaterial({ color: 0xe5484d }), new THREE.MeshBasicMaterial({ color: 0xf2b632 })];

    // Cars: a small pool, shown as traffic grows.
    this.cars = [];
    this.carRng = makeRng(5);
    const carGeo = new GeometryBuilder().add([
      { p: [0, 0.07, 0], s: [0.16, 0.08, 0.3], c: 0xffffff }, { p: [0, 0.14, -0.02], s: [0.14, 0.07, 0.16], c: 0xdfe8ee }]).build();
    for (let k = 0; k < 12; k++) {
      const mat = new THREE.MeshLambertMaterial({ vertexColors: true, color: CAR_COLOURS[k % CAR_COLOURS.length] });
      const mesh = new THREE.Mesh(carGeo, mat);
      mesh.castShadow = true; mesh.visible = false;
      this.root.add(mesh);
      this.cars.push({ mesh, from: -1, to: -1, prev: -1, t: 0 });
    }
    this.sync();
  }

  _centre(type, x, z, rot, out) {
    const [w, d] = DEFS[type].size;
    const fw = rot % 2 ? d : w, fd = rot % 2 ? w : d;
    out.position.set(x + fw / 2 - GRID / 2, 0, z + fd / 2 - GRID / 2);
    out.rotation.y = -rot * Math.PI / 2;
    return [fw, fd];
  }

  // Bring meshes in line with the game's buildings. Cheap: only differences are touched.
  sync() {
    const grid = this.game.grid, seen = new Set();
    let roadKey = '';
    for (const b of grid.buildings.values()) {
      if (isRoad(b.type)) { roadKey += `${b.type[0]}${b.x},${b.z};`; continue; }
      seen.add(b.id);
      const def = DEFS[b.type];
      const lit = b.pop > 0 || (def.jobs && b.road && b.powered);
      const pin = def.needsRoad && !b.road ? 1 : def.power && !b.powered ? 2 : 0;
      let item = this.items.get(b.id);
      if (!item) {
        const group = new THREE.Group();
        const mesh = new THREE.Mesh(this.models.get(b.type, def, b.id, lit), def.sway ? this.treeMaterial : this.material);
        mesh.castShadow = true; mesh.receiveShadow = true;
        group.add(mesh);
        item = { group, mesh, pin: null, pinKind: 0, lit, born: performance.now() };
        if (def.rotor) {
          item.rotor = new THREE.Mesh(this.models.rotor(b.type, def), this.material);
          item.rotor.position.set(...def.rotor.at);
          item.rotor.castShadow = true;
          group.add(item.rotor);
          this.rotors.push(item.rotor);
        }
        this.items.set(b.id, item);
        this.root.add(group);
      } else if (item.lit !== lit) {
        item.mesh.geometry = this.models.get(b.type, def, b.id, lit);
      }
      item.lit = lit;
      this._centre(b.type, b.x, b.z, b.rot, item.group);
      if (item.pinKind !== pin) {
        if (!item.pin && pin) { item.pin = new THREE.Mesh(this.pinGeo, this.pinMats[pin]); item.group.add(item.pin); }
        if (item.pin) { item.pin.visible = pin > 0; if (pin) { item.pin.material = this.pinMats[pin]; item.pin.userData.y = def.height + 0.35; } }
        item.pinKind = pin;
      }
    }
    for (const [id, item] of this.items) {
      if (seen.has(id)) continue;
      this.root.remove(item.group);
      if (item.rotor) this.rotors.splice(this.rotors.indexOf(item.rotor), 1);
      this.items.delete(id);
    }
    if (roadKey !== this.roadKey) { this.roadKey = roadKey; this._rebuildRoads(); }
  }

  _rebuildRoads() {
    const grid = this.game.grid, builder = new GeometryBuilder();
    this.roadCells.length = 0;
    for (const b of grid.buildings.values()) {
      if (!isRoad(b.type)) continue;
      let mask = 0;
      for (const [dx, dz, bit] of DIRS) if (isRoad(grid.typeAt(b.x + dx, b.z + dz))) mask |= bit;
      builder.add(b.type === 'road' ? roadParts(mask) : bridgeParts(mask), b.x + 0.5 - GRID / 2, 0, b.z + 0.5 - GRID / 2);
      this.roadCells.push(b.z * GRID + b.x);
    }
    this.roadMesh.geometry.dispose();
    this.roadMesh.geometry = builder.build();
  }

  // state: 'ok' | 'bad' | 'swap'. Pass null to hide.
  setGhost(ghost) {
    if (!ghost) { this.ghost.visible = false; this.tile.visible = false; return; }
    const { type, x, z, rot, state } = ghost;
    const def = DEFS[type];
    let geo = this._ghostGeo.get(type);
    if (!geo) {
      const builder = new GeometryBuilder().add(def.parts(0, false));
      if (def.rotor) builder.add(def.rotor.parts, ...def.rotor.at);
      geo = builder.build();
      this._ghostGeo.set(type, geo);
    }
    this.ghost.geometry = geo;
    const [fw, fd] = this._centre(type, x, z, rot, this.ghost);
    this.ghost.position.y = 0.02;
    this.ghostMaterial.color.setHex(GHOST[state]);
    this.ghost.visible = true;
    this._placeTile(this.tile, x, z, fw, fd, GHOST[state]);
  }

  // Highlight a building's footprint (bulldoze / hover). Pass null to hide.
  setTile(building, state) {
    this.ghost.visible = false;
    if (!building) { this.tile.visible = false; return; }
    const [w, d] = DEFS[building.type].size;
    const fw = building.rot % 2 ? d : w, fd = building.rot % 2 ? w : d;
    this._placeTile(this.tile, building.x, building.z, fw, fd, GHOST[state]);
  }

  setCellTile(cell, state) {
    this.ghost.visible = false;
    if (!cell) { this.tile.visible = false; return; }
    this._placeTile(this.tile, cell.x, cell.z, 1, 1, GHOST[state]);
  }

  setSelection(building) {
    if (!building) { this.selTile.visible = false; return; }
    const [w, d] = DEFS[building.type].size;
    const fw = building.rot % 2 ? d : w, fd = building.rot % 2 ? w : d;
    this._placeTile(this.selTile, building.x, building.z, fw + 0.2, fd + 0.2, GHOST.select, -0.1);
  }

  _placeTile(tile, x, z, w, d, colour, shift = 0) {
    tile.position.set(x + w / 2 - GRID / 2 + shift, 0.075, z + d / 2 - GRID / 2 + shift);
    tile.scale.set(w, 1, d);
    tile.material.color.setHex(colour);
    tile.visible = true;
  }

  _roadNeighbours(cell, out) {
    const grid = this.game.grid, x = cell % GRID, z = Math.floor(cell / GRID);
    out.length = 0;
    for (const [dx, dz] of DIRS) if (isRoad(grid.typeAt(x + dx, z + dz))) out.push((z + dz) * GRID + x + dx);
    return out;
  }

  _updateCars(simDt) {
    const grid = this.game.grid, cells = this.roadCells;
    const wanted = this.game.stats.population > 0 ? Math.min(this.cars.length, Math.floor(cells.length / 7)) : 0;
    const scratch = this._scratch || (this._scratch = []);
    const onRoad = (c) => c >= 0 && isRoad(grid.typeAt(c % GRID, Math.floor(c / GRID)));
    for (let k = 0; k < this.cars.length; k++) {
      const car = this.cars[k];
      if (k >= wanted) { car.mesh.visible = false; car.from = -1; continue; }
      if (!onRoad(car.from) || !onRoad(car.to)) { // (re)spawn on a random road cell
        car.from = cells[Math.floor(this.carRng() * cells.length)];
        const nb = this._roadNeighbours(car.from, scratch);
        car.to = nb.length ? nb[Math.floor(this.carRng() * nb.length)] : car.from;
        car.prev = -1; car.t = 0;
      }
      car.t += simDt * 1.5;
      while (car.t >= 1) {
        car.t -= 1;
        car.prev = car.from; car.from = car.to;
        const nb = this._roadNeighbours(car.from, scratch);
        const forward = nb.filter((c) => c !== car.prev);
        const pick = forward.length ? forward : nb;
        car.to = pick.length ? pick[Math.floor(this.carRng() * pick.length)] : car.from;
      }
      const ax = car.from % GRID, az = Math.floor(car.from / GRID), bx = car.to % GRID, bz = Math.floor(car.to / GRID);
      const dx = bx - ax, dz = bz - az;
      // Keep to the right-hand lane.
      car.mesh.position.set(ax + dx * car.t + 0.5 - GRID / 2 - dz * 0.17, 0.04, az + dz * car.t + 0.5 - GRID / 2 + dx * 0.17);
      if (dx || dz) car.mesh.rotation.y = Math.atan2(dx, dz);
      car.mesh.visible = true;
    }
  }

  // realDt drives ambient motion; simDt (0 while paused) drives traffic.
  update(realDt, simDt) {
    this.uTime.value = (this.uTime.value + realDt) % 3600;
    const t = this.uTime.value, now = performance.now();
    for (const rotor of this.rotors) rotor.rotation.z -= realDt * 1.6;
    for (const item of this.items.values()) {
      if (item.born) { // pop-in when built
        const k = Math.min(1, (now - item.born) / 260);
        const s = 0.55 + 0.45 * (1 - (1 - k) * (1 - k)) + Math.sin(k * Math.PI) * 0.08;
        item.group.scale.setScalar(s);
        if (k >= 1) { item.group.scale.setScalar(1); item.born = 0; }
      }
      if (item.pin && item.pin.visible) { item.pin.position.y = item.pin.userData.y + Math.sin(t * 3) * 0.06; item.pin.rotation.y = t * 1.5; }
    }
    this._updateCars(simDt);
  }

  // After a load or reset nothing should animate in.
  settle() { for (const item of this.items.values()) { item.born = 0; item.group.scale.setScalar(1); } }
}
