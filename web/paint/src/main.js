// Worldbrush: wires the painted map, the 3D world and the page controls together.

import { N, BRUSHES, TIMES, SAVE_KEY, GRASS } from './config.js';
import { PaintMap } from './map.js';
import { World } from './world.js';
import { Painter } from './painter.js';

const $ = (id) => document.getElementById(id);
const map = new PaintMap(N);
let world;
try {
  world = new World($('scene'));
} catch (err) {
  $('hint').textContent = 'This browser could not start 3D graphics (WebGL).';
  throw err;
}

// ---- saving ---------------------------------------------------------------
function load() {
  try { return map.restore(localStorage.getItem(SAVE_KEY)); } catch { return false; }
}
let saveTimer = 0;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { try { localStorage.setItem(SAVE_KEY, map.serialize()); } catch { /* private mode: play on without saving */ } }, 400);
}

// ---- undo -----------------------------------------------------------------
const history = [];
function remember() {
  history.push(map.serialize());
  if (history.length > 40) history.shift();
  $('undo').disabled = false;
}
function undo() {
  const prev = history.pop();
  if (prev === undefined) return;
  map.restore(prev);
  $('undo').disabled = history.length === 0;
  changed(false);
}

// ---- map changes ----------------------------------------------------------
function changed(wave) {
  world.sync(map, wave);
  painter.draw();
  const s = world.stats;
  $('stats').textContent = `Land ${s.land}%  ·  Peak ${s.peak}  ·  Trees ${s.trees}  ·  Homes ${s.homes}`;
  save();
}

const painter = new Painter($('map'), map, {
  onStrokeStart: () => { remember(); $('hint').classList.add('gone'); },
  onChange: () => changed(false),
});

// ---- brushes --------------------------------------------------------------
const brushBox = $('brushes');
BRUSHES.forEach((b, k) => {
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'brush'; btn.dataset.id = b.id;
  btn.setAttribute('role', 'radio');
  btn.title = `${b.name} (${k + 1})`;
  btn.innerHTML = `<i style="background:${b.color}"></i><span>${b.name}</span>`;
  btn.addEventListener('click', () => pickBrush(b.id));
  brushBox.append(btn);
});
function pickBrush(id) {
  painter.brush = id;
  for (const btn of brushBox.children) {
    const on = Number(btn.dataset.id) === id;
    btn.setAttribute('aria-checked', on); btn.tabIndex = on ? 0 : -1;
  }
}
pickBrush(GRASS);

const sizeInput = $('size');
function setSize(v) {
  painter.size = Math.max(1, Math.min(7, v));
  sizeInput.value = painter.size; $('size-value').textContent = painter.size;
  painter.draw();
}
sizeInput.addEventListener('input', () => setSize(Number(sizeInput.value)));
setSize(3);

// ---- buttons --------------------------------------------------------------
let seed = 4;
$('new').addEventListener('click', () => { remember(); seed = 1 + Math.floor(Math.random() * 9999); map.generate(seed); changed(true); });
$('clear').addEventListener('click', () => { remember(); map.clear(); changed(true); });
$('undo').addEventListener('click', undo);
$('undo').disabled = true;

const skies = TIMES.map((t, k) => {
  const layer = document.createElement('div');
  layer.className = 'sky';
  layer.style.background = `linear-gradient(${t.sky[0]}, ${t.sky[1]})`;
  layer.style.opacity = k === 0 ? 1 : 0;
  $('view').prepend(layer);
  return layer;
});
let time = 0;
function setTime(k) {
  time = k % TIMES.length;
  world.setTime(time);
  skies.forEach((layer, j) => { layer.style.opacity = j === time ? 1 : 0; });
  $('time').textContent = TIMES[time].name;
  $('view').dataset.time = TIMES[time].name.toLowerCase();
}
$('time').addEventListener('click', () => setTime(time + 1));
setTime(0);

$('spin').addEventListener('click', () => {
  world.controls.autoRotate = !world.controls.autoRotate;
  $('spin').setAttribute('aria-pressed', world.controls.autoRotate);
});

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement && e.target.type !== 'range') return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const n = Number(e.key);
  if (n >= 1 && n <= BRUSHES.length) pickBrush(BRUSHES[n - 1].id);
  else if (e.key === '[') setSize(painter.size - 1);
  else if (e.key === ']') setSize(painter.size + 1);
  else if (e.key.toLowerCase() === 't') setTime(time + 1);
});

// ---- start ----------------------------------------------------------------
if (!load()) map.generate(seed);
changed(true);

new ResizeObserver(() => world.resize()).observe($('scene'));
world.resize();

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  if (window.__manual) return;          // a recorder is driving the world step by step
  // Catch up in small steps so a slow or throttled tab does not play in slow motion.
  let remaining = Math.min((now - last) / 1000, 0.5);
  last = now;
  while (remaining > 0.0005) { const dt = Math.min(remaining, 1 / 30); world.step(dt); remaining -= dt; }
  world.render();
}
requestAnimationFrame(frame);

// For the console, tests and recording.
window.wb = { map, world, painter, changed, setTime, pickBrush, setSize, remember };
