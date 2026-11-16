// Entry point: restore or start a city, then wire game -> view -> interface and run the loop.

import { ECON, SPEEDS } from './config.js';
import { Game } from './game.js';
import { Input } from './input.js';
import { clearSave, loadSave, saveGame } from './persistence.js';
import { buildStarterTown } from './starter.js';
import { Tools } from './tools.js';
import { Hud } from './ui/hud.js';

const overlay = document.getElementById('overlay');
const overlayText = document.getElementById('overlay-text');
const canvas = document.getElementById('scene');

function fail(title, detail) {
  overlay.hidden = false;
  overlay.classList.add('error');
  overlayText.replaceChildren(Object.assign(document.createElement('strong'), { textContent: title }),
    Object.assign(document.createElement('span'), { textContent: detail }));
}

async function start() {
  if (!window.WebGL2RenderingContext) { fail('This browser cannot run the game', 'It needs WebGL 2, which this browser or device does not provide.'); return; }
  let game, scene, view;
  try {
    game = new Game();
    const saved = loadSave();
    if (saved) game.restore(saved); else buildStarterTown(game);
    const [{ Scene }, { CityView }] = await Promise.all([import('./render/scene.js'), import('./render/cityView.js')]);
    scene = new Scene(canvas);
    view = new CityView(scene.scene, game);
  } catch (error) {
    console.error(error);
    fail('The city could not be loaded', error.message || String(error));
    return;
  }

  const tools = new Tools();
  let savePending = false;
  const save = () => { savePending = false; if (saveGame(game)) hud.flashSaved(); };
  const queueSave = () => { if (!savePending) { savePending = true; setTimeout(save, 400); } };

  const hud = new Hud(game, tools, {
    rotate: () => {
      if (tools.mode === 'build' || tools.mode === 'move') tools.rotate();
      else if (tools.selectedId) { const r = game.rotate(tools.selectedId); if (!r.ok) hud.toast(r.reason, 'bad'); }
      else hud.toast('Select a building or pick one to build first', 'info');
    },
    reset: (mode) => {
      clearSave();
      tools.select(0);
      if (mode === 'starter') buildStarterTown(game);
      else { game.clear(ECON.startMoney); game._changed('load'); }
      scene.resetCamera();
      view.settle();
      save();
      hud.toast(mode === 'starter' ? 'Starter town restored' : 'Empty island: build from scratch', 'info');
    },
  });
  const input = new Input(canvas, scene, game, view, tools, hud);

  game.on((kind) => {
    if (kind !== 'speed') view.sync();
    if (kind === 'load') view.settle();
    if (kind === 'tick') { if (game.ticks % 5 === 0) queueSave(); } else queueSave();
  });
  view.settle();

  let last = performance.now(), lost = false;
  function frame(now) {
    requestAnimationFrame(frame);
    const realDt = Math.min((now - last) / 1000, 0.1);
    last = now;
    if (lost) return;
    game.update(realDt);
    scene.controls.update();
    view.update(realDt, game.paused ? 0 : realDt * SPEEDS[game.speedIndex]);
    scene.render();
  }

  new ResizeObserver(() => scene.resize()).observe(canvas);
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; fail('Graphics were interrupted', 'The 3D view paused. It should resume on its own; reload if it does not.'); });
  canvas.addEventListener('webglcontextrestored', () => { lost = false; overlay.hidden = true; overlay.classList.remove('error'); });
  document.addEventListener('visibilitychange', () => { last = performance.now(); if (document.hidden) save(); });
  window.addEventListener('pagehide', save);

  scene.render();
  overlay.hidden = true;
  document.body.classList.add('ready');
  requestAnimationFrame(frame);

  window.city = { game, scene, view, tools, input, hud, save }; // for debugging and automated checks
}

start();
