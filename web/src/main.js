// Entry point: load the world, wire simulation -> view -> panel, run the loop.

import { Simulation } from './sim/simulation.js';
import { World } from './sim/world.js';
import { Panel } from './ui/panel.js';

const overlay = document.getElementById('overlay');
const overlayText = document.getElementById('overlay-text');
const canvas = document.getElementById('scene');

function showMessage(title, detail) {
  overlay.hidden = false;
  overlay.classList.add('error');
  overlayText.innerHTML = '';
  const h = document.createElement('strong');
  h.textContent = title;
  const p = document.createElement('span');
  p.textContent = detail;
  overlayText.append(h, p);
}

async function loadWorld() {
  let response;
  try {
    response = await fetch('./data/world.json');
  } catch {
    throw new Error('Open this page through the local server: run "python live.py" in the project folder.');
  }
  if (!response.ok) throw new Error('World data is missing. Run "python export_world.py" (or live.py) first.');
  return new World(await response.json());
}

async function start() {
  if (!window.WebGL2RenderingContext) {
    showMessage('This browser cannot show the island', 'It needs WebGL 2, which this browser or device does not provide.');
    return;
  }
  let world, view, sim;
  try {
    world = await loadWorld();
    sim = new Simulation(world);
    const { View } = await import('./render/view.js');
    view = new View(canvas, world, sim);
  } catch (error) {
    console.error(error);
    showMessage('The island could not be loaded', error.message || String(error));
    return;
  }

  const panel = new Panel(sim, {
    changed: () => { view.dirty = true; },
    reset: () => { sim.reset(); view.resetCamera(); view.resetScenery(sim); panel.sim = sim; panel.note('World reset'); },
    capture: async () => {
      try {
        view.update(sim, 0);
        const blob = await view.capture();
        const env = sim.env;
        const hh = String(Math.floor(env.hour)).padStart(2, '0'), mm = String(Math.floor((env.hour % 1) * 60)).padStart(2, '0');
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `island-day${env.day + 1}-${hh}${mm}.png`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 2000);
        panel.note(`Saved ${link.download}`);
      } catch (error) {
        panel.note('Capture failed');
        console.error(error);
      }
    },
  });

  let raf = 0, last = performance.now(), lost = false;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const realDt = Math.min((now - last) / 1000, 0.1);
    last = now;
    if (lost) return;
    const stepped = sim.advance(realDt);
    const easing = sim.env.ease(realDt);
    view.controls.update(); // flags view.dirty through its change event
    if (stepped || easing || view.dirty) {
      view.update(sim, realDt);
      view.render();
    }
    panel.sync();
  }

  new ResizeObserver(() => view.resize()).observe(canvas);
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    lost = true;
    showMessage('Graphics were interrupted', 'The browser paused the 3D view. It will resume on its own; reload if it does not.');
  });
  canvas.addEventListener('webglcontextrestored', () => {
    lost = false;
    overlay.hidden = true;
    overlay.classList.remove('error');
    view.dirty = true;
  });
  document.addEventListener('visibilitychange', () => { last = performance.now(); });

  // First frame, then reveal.
  sim.env.ease(0);
  view.update(sim, 0);
  view.render();
  overlay.hidden = true;
  document.body.classList.add('ready');
  raf = requestAnimationFrame(frame);

  window.island = { sim, view, world, stop: () => cancelAnimationFrame(raf) }; // for debugging in the console
}

start();
