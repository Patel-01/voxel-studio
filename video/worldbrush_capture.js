// Records Worldbrush for the short. Runs in the browser, imported from the capture server:
//
//   const m = await import('http://127.0.0.1:8138/worldbrush_capture.js');
//   await m.run(iframe.contentWindow, 'wb_main');
//
// The page must be the real app at 540 x 960 CSS pixels (an iframe that size); it is drawn at 2x. Each frame the
// world is stepped by hand, the 3D view, the map and the tool column are drawn into one canvas,
// and the JPEG is posted to the capture server, which writes video/frames/<shot>/NNNNN.jpg.

const FPS = 30;
const SKIES = [['#bfe3f5', '#eaf6fb'], ['#f2a25c', '#6a4c7d'], ['#0f1a3d', '#2b3f78']];
const MONO = 'ui-monospace, "Cascadia Mono", Consolas, monospace';
const NAVY = '#0e2036', NAVY2 = '#16304f', LINE = 'rgba(234, 242, 248, 0.2)', CHALK = '#eaf2f8', DIM = '#9db3c8', BUOY = '#ff7a45';
const B = { water: 0, sand: 1, grass: 2, forest: 3, mountain: 4, town: 5 };

// ---- the script of the short ------------------------------------------------
// Strokes are in map cells (0..55). Each stroke picks its brush a moment before it starts,
// so the button highlight is visible in the tool column.
const STROKES = [
  { t: 0.6, d: 1.1, brush: 'grass', size: 6, pts: [[13, 31], [27, 25], [42, 21]] },
  { t: 1.9, d: 1.0, brush: 'grass', size: 6, pts: [[15, 39], [29, 37], [43, 33]] },
  { t: 3.0, d: 0.9, brush: 'grass', size: 6, pts: [[24, 15], [26, 30], [30, 45]] },
  { t: 4.1, d: 0.6, brush: 'grass', size: 5, pts: [[40, 40], [36, 46]] },
  { t: 5.6, d: 1.4, brush: 'mountain', size: 4, pts: [[19, 27], [26, 24], [33, 26], [37, 31]] },
  { t: 7.2, d: 0.6, brush: 'mountain', size: 3, pts: [[25, 19], [28, 22]] },
  { t: 8.6, d: 1.0, brush: 'forest', size: 4, pts: [[16, 37], [24, 41]] },
  { t: 9.8, d: 0.9, brush: 'forest', size: 4, pts: [[37, 19], [43, 25]] },
  { t: 11.2, d: 0.35, brush: 'town', size: 3, pts: [[39, 36], [40, 36]] },
  { t: 11.75, d: 0.35, brush: 'town', size: 3, pts: [[43, 31], [44, 31]] },
  { t: 13.2, d: 1.3, brush: 'water', size: 2, pts: [[30, 29], [31, 35], [34, 41], [33, 47]] },
  { t: 14.8, d: 0.9, brush: 'sand', size: 2, pts: [[10, 33], [12, 40], [16, 44]] },
];
const EVENTS = [
  { t: 17.0, run: (wb) => wb.setTime(1) },
  { t: 19.5, run: (wb) => wb.setTime(2) },
  { t: 22.5, run: (wb) => { wb.setTime(0); wb.map.generate(4); wb.changed(true); } },
  { t: 24.5, run: (wb) => { wb.map.generate(813); wb.changed(true); } },
  { t: 26.5, run: (wb) => { wb.setTime(1); wb.map.generate(52); wb.changed(true); } },
];
export const DURATION = 38;

// ---- helpers ------------------------------------------------------------------
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => t * t * (3 - 2 * t);

function along(pts, t) {
  const lens = [];
  let total = 0;
  for (let k = 1; k < pts.length; k++) { const l = Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]); lens.push(l); total += l; }
  let d = t * total;
  for (let k = 0; k < lens.length; k++) {
    if (d <= lens[k] || k === lens.length - 1) { const u = lens[k] ? Math.min(1, d / lens[k]) : 1; return [lerp(pts[k][0], pts[k + 1][0], u), lerp(pts[k][1], pts[k + 1][1], u)]; }
    d -= lens[k];
  }
  return pts[pts.length - 1];
}

// Where the "finger" is at time t, and whether it is pressing.
function finger(t) {
  for (let k = 0; k < STROKES.length; k++) {
    const s = STROKES[k];
    if (t >= s.t && t <= s.t + s.d) return { p: along(s.pts, ease((t - s.t) / s.d)), down: true, k };
    const next = STROKES[k + 1];
    if (next && t > s.t + s.d && t < next.t) {
      const u = ease((t - s.t - s.d) / (next.t - s.t - s.d));
      const a = s.pts[s.pts.length - 1], b = next.pts[0];
      return { p: [lerp(a[0], b[0], u), lerp(a[1], b[1], u)], down: false, k: -1 };
    }
  }
  if (t < STROKES[0].t) return { p: STROKES[0].pts[0], down: false, k: -1 };
  return null;
}

function rel(el, doc) {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

function rrect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }

// ---- drawing one frame --------------------------------------------------------
function compose(ctx, w, sky, fingerState) {
  const doc = w.document, wb = w.wb;
  const view = rel(doc.getElementById('view')), panel = rel(doc.getElementById('panel'));
  ctx.setTransform(2, 0, 0, 2, 0, 0);
  ctx.fillStyle = NAVY; ctx.fillRect(0, 0, 540, 960);

  // Sky, blended the same way the world blends its light.
  for (let k = 0; k < SKIES.length; k++) {
    if (sky[k] < 0.003) continue;
    const g = ctx.createLinearGradient(0, view.y, 0, view.y + view.h);
    g.addColorStop(0, SKIES[k][0]); g.addColorStop(1, SKIES[k][1]);
    ctx.globalAlpha = k === 0 ? 1 : sky[k];
    ctx.fillStyle = g; ctx.fillRect(view.x, view.y, view.w, view.h);
  }
  ctx.globalAlpha = 1;
  ctx.drawImage(doc.getElementById('scene'), view.x, view.y, view.w, view.h);

  // Stats line.
  const night = sky[0] < 0.5;
  ctx.font = `600 11px ${MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = night ? CHALK : NAVY;
  ctx.fillText(doc.getElementById('stats').textContent, view.x + view.w / 2, view.y + view.h - 9);

  // Chart table.
  ctx.fillStyle = NAVY; ctx.fillRect(panel.x, panel.y, panel.w, panel.h);
  ctx.strokeStyle = 'rgba(234, 242, 248, 0.035)'; ctx.lineWidth = 1; ctx.beginPath();
  for (let x = panel.x + 23.5; x < panel.x + panel.w; x += 24) { ctx.moveTo(x, panel.y); ctx.lineTo(x, panel.y + panel.h); }
  for (let y = panel.y + 23.5; y < panel.y + panel.h; y += 24) { ctx.moveTo(panel.x, y); ctx.lineTo(panel.x + panel.w, y); }
  ctx.stroke();
  ctx.fillStyle = LINE; ctx.fillRect(panel.x, panel.y, panel.w, 1);

  const chart = rel(doc.getElementById('chart')), map = rel(doc.getElementById('map'));
  ctx.strokeStyle = LINE; ctx.lineWidth = 1; rrect(ctx, chart.x + 0.5, chart.y + 0.5, chart.w - 1, chart.h - 1, 4); ctx.stroke();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(doc.getElementById('map'), map.x, map.y, map.w, map.h);
  ctx.imageSmoothingEnabled = true;

  // The finger: a soft dot that grows while pressing.
  if (fingerState) {
    const cell = map.w / 56, fx = map.x + (fingerState.p[0] + 0.5) * cell, fy = map.y + (fingerState.p[1] + 0.5) * cell;
    ctx.fillStyle = fingerState.down ? 'rgba(255, 255, 255, 0.45)' : 'rgba(255, 255, 255, 0.22)';
    ctx.beginPath(); ctx.arc(fx, fy, fingerState.down ? 14 : 11, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(10, 20, 36, 0.5)'; ctx.lineWidth = 1.2; ctx.stroke();
  }

  // Brush buttons.
  for (const btn of doc.querySelectorAll('.brush')) {
    const r = rel(btn), on = btn.getAttribute('aria-checked') === 'true';
    rrect(ctx, r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1, 8);
    if (on) { ctx.fillStyle = NAVY2; ctx.fill(); ctx.strokeStyle = BUOY; ctx.lineWidth = 2.5; } else { ctx.strokeStyle = LINE; ctx.lineWidth = 1; }
    ctx.stroke();
    const dot = rel(btn.querySelector('i'));
    ctx.fillStyle = btn.querySelector('i').style.background;
    ctx.beginPath(); ctx.arc(dot.x + dot.w / 2, dot.y + dot.h / 2, dot.w / 2 - 1, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 2; ctx.stroke();
    const label = btn.querySelector('span'), lr = rel(label);
    ctx.font = `600 ${parseFloat(w.getComputedStyle(label).fontSize)}px ${MONO}`;
    ctx.fillStyle = on ? CHALK : DIM; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label.textContent.toUpperCase(), lr.x + lr.w / 2, lr.y + lr.h / 2 + 1);
  }

  // Size slider.
  const size = doc.getElementById('size'), sr = rel(size), lab = rel(doc.querySelector('#size-row span'));
  ctx.font = `600 ${parseFloat(w.getComputedStyle(doc.getElementById('size-row')).fontSize)}px ${MONO}`;
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = DIM;
  ctx.fillText('SIZE ', lab.x, lab.y + lab.h / 2);
  ctx.fillStyle = CHALK; ctx.fillText(String(wb.painter.size), lab.x + ctx.measureText('SIZE ').width, lab.y + lab.h / 2);
  const u = (wb.painter.size - 1) / 6, ty = sr.y + sr.h / 2, kx = sr.x + 7 + u * (sr.w - 14);
  ctx.fillStyle = '#3a4a5e'; rrect(ctx, sr.x, ty - 3, sr.w, 6, 3); ctx.fill();
  ctx.fillStyle = BUOY; rrect(ctx, sr.x, ty - 3, kx - sr.x, 6, 3); ctx.fill();
  ctx.beginPath(); ctx.arc(kx, ty, 7, 0, Math.PI * 2); ctx.fill();

  // Action buttons.
  for (const id of ['new', 'undo', 'clear']) {
    const btn = doc.getElementById(id), r = rel(btn), main = id === 'new';
    rrect(ctx, r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1, 8);
    if (main) { ctx.fillStyle = btn.dataset.flash ? '#ffb08a' : BUOY; ctx.fill(); } else { ctx.strokeStyle = LINE; ctx.lineWidth = 1; ctx.stroke(); }
    ctx.globalAlpha = btn.disabled ? 0.4 : 1;
    ctx.font = `600 ${parseFloat(w.getComputedStyle(btn).fontSize)}px ${MONO}`;
    ctx.fillStyle = main ? '#1c0d05' : CHALK; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(btn.textContent.toUpperCase(), r.x + r.w / 2, r.y + r.h / 2 + 1);
    ctx.globalAlpha = 1;
  }
}

// ---- recording ----------------------------------------------------------------
export async function run(w, shot, { start = 0, end = DURATION, post = true, zoom = 0.78 } = {}) {
  const wb = w.wb;
  w.__manual = true;
  // Draw everything at 2x so the 540-wide layout fills a 1080-wide frame sharply.
  Object.defineProperty(w, 'devicePixelRatio', { configurable: true, get: () => 2 });
  wb.world.resize();
  const cam = wb.world.camera, target = wb.world.controls.target;
  cam.position.sub(target).multiplyScalar(zoom).add(target);
  w.document.getElementById('hint').classList.add('gone');
  const out = document.createElement('canvas');
  out.width = 1080; out.height = 1920;
  const ctx = out.getContext('2d');

  // Start from open sea, settled, by day.
  wb.map.clear(); wb.changed(false); wb.setTime(0);
  wb.world.controls.autoRotate = true; wb.world.controls.autoRotateSpeed = 1.1;
  for (let k = 0; k < 240; k++) wb.world.step(1 / 30);
  const sky = [1, 0, 0];
  const done = new Set();
  let stroke = -1, pending = [];
  const t0 = performance.now();

  for (let i = 0; i < Math.round(end * FPS); i++) {
    const t = i / FPS;
    // Brush changes show up just before each stroke.
    for (const [k, s] of STROKES.entries()) {
      if (!done.has(`pick${k}`) && t >= s.t - 0.35) { done.add(`pick${k}`); wb.pickBrush(B[s.brush]); wb.setSize(s.size); }
    }
    for (const [k, e] of EVENTS.entries()) {
      if (!done.has(`ev${k}`) && t >= e.t) {
        done.add(`ev${k}`);
        if (e.t >= 22) { w.document.getElementById('new').dataset.flash = '1'; e._flashUntil = t + 0.2; } // "pressed" New
        e.run(wb);
      }
      if (e._flashUntil && t > e._flashUntil) { delete w.document.getElementById('new').dataset.flash; e._flashUntil = 0; }
    }
    const f = finger(t);
    if (f && f.down) {
      if (stroke !== f.k) { wb.painter.endStroke(); wb.remember(); stroke = f.k; }
      wb.painter.strokeTo(f.p[0], f.p[1]);
    } else {
      if (stroke !== -1) { wb.painter.endStroke(); stroke = -1; }
      wb.painter.hover = f ? { x: f.p[0], z: f.p[1] } : null;
      wb.painter.draw();
    }

    wb.world.step(1 / 60); wb.world.step(1 / 60);
    const goal = wb.world.timeIndex, k = 1 - Math.exp(-(1 / 30) * 3);
    for (let s = 0; s < 3; s++) sky[s] += ((s === goal ? 1 : 0) - sky[s]) * k;
    if (i < start * FPS) continue;
    wb.world.render();
    compose(ctx, w, sky, f);
    if (post) {
      // toDataURL, not toBlob: toBlob takes seconds per frame in Chrome here.
      const b64 = atob(out.toDataURL('image/jpeg', 0.9).slice(23));
      const bytes = new Uint8Array(b64.length);
      for (let k = 0; k < b64.length; k++) bytes[k] = b64.charCodeAt(k);
      pending.push(fetch(`http://127.0.0.1:8138/f/${shot}/${i}.jpg`, { method: 'POST', body: bytes }));
      if (pending.length >= 6) { await Promise.all(pending); pending = []; }
    }
  }
  await Promise.all(pending);
  return { frames: Math.round(end * FPS), seconds: ((performance.now() - t0) / 1000).toFixed(1), stats: wb.world.stats, preview: post ? null : out.toDataURL('image/jpeg', 0.6) };
}
