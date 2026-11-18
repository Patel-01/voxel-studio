// Records the Glass Tower short. Runs in the browser, imported from the capture server:
//
//   const m = await import('http://127.0.0.1:8138/glass_capture.js');
//   await m.run(iframe.contentWindow, 'glass_main');
//
// The page must be web/glass/ in an iframe of 540 x 960 CSS pixels; it is drawn at 2x (1080 x 1920).
// The engine's own loop is switched off (window.__manual) and every frame is stepped here: 2 fixed physics
// steps of 1/60 s per 30 fps video frame, so slow-mo, shake and the reset tween all behave as live.
// Sound calls are logged (not played) and posted as events.json so glass_voice.py can mix the same sounds.

const FPS = 30;
export const DURATION = 38;
const MONO = 'ui-monospace, "Cascadia Mono", Consolas, monospace';

// ---- the script of the short (seconds) -----------------------------------------
// tap: fire a meteor at the floor-f panel that faces the camera most (o = which of the best ones)
const EVENTS = [
  { t: 0.35, tap: [9, 0] }, { t: 1.15, tap: [5, 1] }, { t: 1.9, tap: [11, 2] },
  { t: 3.3, tap: [3, 0] }, { t: 3.9, tap: [7, 2] }, { t: 4.5, tap: [12, 1] }, { t: 5.1, tap: [6, 3] },
  { t: 6.4, key: 'Space', heavy: 8 },
  { t: 6.95, key: 'KeyS' },
  { t: 11.6, key: 'KeyS' },
  { t: 12.2, key: 'KeyB' },
  { t: 21.6, key: 'KeyR' },
  { t: 25.2, key: 'Space', heavy: 6 }, { t: 26.3, tap: [10, 0] }, { t: 26.9, tap: [12, 2] },
  { t: 28.7, key: 'KeyB' },
  { t: 31.4, key: 'Space', heavy: 4 },
];
// camera keys: [t, yaw speed (rad/s), dist, target y]
const CAM = [[0, .11, 74, 31], [6.2, .11, 74, 31], [7.6, .05, 58, 29], [11.4, .05, 58, 29], [13.2, .1, 86, 32], [21, .1, 86, 32], [23.5, .11, 74, 31], [38, .11, 78, 31]];

const ease = (u) => u * u * (3 - 2 * u);
function camAt(t) {
  for (let k = 1; k < CAM.length; k++) {
    if (t <= CAM[k][0]) {
      const a = CAM[k - 1], b = CAM[k], u = ease((t - a[0]) / (b[0] - a[0]));
      return a.map((v, i) => v + (b[i] - v) * u);
    }
  }
  return CAM[CAM.length - 1];
}

function mulberry(seed) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// Exposes the engine's script-scope bindings to the recorder, and logs sound calls instead of playing them.
const HELPER = `
window.__ev=[];
for(const n of ['sShatter','sTink','sBoom','sWhoosh','sCreak','sShimmer'])window[n]=k=>{__ev.push([+now.toFixed(3),n,+(k||0).toFixed(2)])};
lastI=1e12;RS=1;
window.__g={
 tick(dt,t){now=t;ts+=(tsT-ts)*Math.min(1,dt*5);const n=Math.round(dt/STEP);for(let i=0;i<n;i++)step(STEP*ts);if(resetT>=0)doReset(dt);camera(dt);build();render();},
 cam,fire,swarm,toggleSlow,reset,launch,panels,C,bytes:+FB,
 get eye(){return eye},get sCount(){return sCount},get slow(){return slow},
 facing(f){const e=eye;return panels.filter(p=>p.f===f&&p.st===0).map(p=>{const n=qrot(p.q,[0,0,1]),d=nrm(sub(e,p.p));return[dot(n,d),p]}).sort((a,b)=>b[0]-a[0]).map(x=>x[1])},
 screen(p){const v=VP,x=v[0]*p[0]+v[4]*p[1]+v[8]*p[2]+v[12],y=v[1]*p[0]+v[5]*p[1]+v[9]*p[2]+v[13],w=v[3]*p[0]+v[7]*p[1]+v[11]*p[2]+v[15];return[(x/w*.5+.5)*innerWidth,(.5-y/w*.5)*innerHeight]},
 heavyAt(f){const P=this.facing(f)[1]||this.facing(f)[0];if(!P)return;const n=qrot(P.q,[0,0,1]),s=add(P.p,[n[0]*36+n[2]*9,24,n[2]*36-n[0]*9]);launch(s,P.p,50,2.2,1)}
};`;

function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }

const KEYS = [['Space', 'SPACE', 'Meteor'], ['KeyB', 'B', 'Swarm ×50'], ['KeyS', 'S', 'Slow-Mo'], ['KeyR', 'R', 'Reset']];

function compose(ctx, g, t, pressed, taps) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(g.C, 0, 0, 1080, 1920);
  ctx.setTransform(2, 0, 0, 2, 0, 0);
  const vg = ctx.createRadialGradient(270, 400, 220, 270, 400, 640);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.42)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, 540, 960);

  // tap ripples
  for (const p of taps) {
    const u = (t - p.t) / 0.55;
    if (u < 0 || u > 1) continue;
    ctx.strokeStyle = `rgba(255,255,255,${0.85 * (1 - u)})`; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(p.x, p.y, 10 + 26 * u, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = `rgba(255,255,255,${0.5 * (1 - u)})`; ctx.beginPath(); ctx.arc(p.x, p.y, 9, 0, Math.PI * 2); ctx.fill();
  }

  // control bar (as in the app, always shown in the short)
  ctx.font = `600 11px ${MONO}`; ctx.textBaseline = 'middle';
  const items = KEYS.map(([code, key, label]) => {
    ctx.font = `700 9.5px ${MONO}`; const kw = ctx.measureText(key).width + 9;
    ctx.font = `600 11px ${MONO}`; const lw = ctx.measureText(label).width;
    return { code, key, label, kw, lw, w: 8 + kw + 6 + lw + 8 };
  });
  const bw = items.reduce((s, i) => s + i.w, 0) + 10 + 2 * 3, bh = 38, bx = 270 - bw / 2, by = 960 - 22 - bh;
  rr(ctx, bx, by, bw, bh, bh / 2); ctx.fillStyle = 'rgba(8,10,14,0.62)'; ctx.fill();
  ctx.strokeStyle = 'rgba(150,225,240,0.22)'; ctx.lineWidth = 1; ctx.stroke();
  let x = bx + 5;
  for (const it of items) {
    const on = (it.code === 'KeyS' && g.slow) || (pressed[it.code] && t - pressed[it.code] < 0.4);
    if (on) { rr(ctx, x, by + 5, it.w, bh - 10, (bh - 10) / 2); ctx.fillStyle = 'rgba(120,220,235,0.26)'; ctx.fill(); }
    rr(ctx, x + 8, by + bh / 2 - 8, it.kw, 16, 4); ctx.fillStyle = '#bdeef4'; ctx.fill();
    ctx.font = `700 9.5px ${MONO}`; ctx.fillStyle = '#0b1114'; ctx.textAlign = 'center'; ctx.fillText(it.key, x + 8 + it.kw / 2, by + bh / 2 + 0.5);
    ctx.font = `600 11px ${MONO}`; ctx.fillStyle = '#e6f6f8'; ctx.textAlign = 'left'; ctx.fillText(it.label, x + 8 + it.kw + 6, by + bh / 2 + 0.5);
    x += it.w + 2;
  }

  // HUD readout, above the bar (the top is kept free for captions). FPS is left out: frames are stepped by hand here.
  const hud = `FILE: ${(g.bytes / 1024).toFixed(2)} KB  |  SHARDS: ${g.sCount}`;
  ctx.font = `600 11px ${MONO}`; const hw = ctx.measureText(hud).width + 28, hy = by - 12 - 28;
  rr(ctx, 270 - hw / 2, hy, hw, 28, 14); ctx.fillStyle = 'rgba(8,10,14,0.55)'; ctx.fill();
  ctx.strokeStyle = 'rgba(150,225,240,0.18)'; ctx.stroke();
  ctx.fillStyle = '#e6f6f8'; ctx.textAlign = 'center'; ctx.fillText(hud, 270, hy + 14.5);
  if (g.slow) {
    const s = '◉ SLOW-MO 0.2×', sw = ctx.measureText(s).width + 24;
    rr(ctx, 270 - sw / 2, hy - 34, sw, 26, 13); ctx.fillStyle = 'rgba(8,10,14,0.55)'; ctx.fill();
    ctx.fillStyle = '#ffc68c'; ctx.fillText(s, 270, hy - 34 + 13.5);
  }
}

export async function run(w, shot, { start = 0, end = DURATION, post = true, samples = null, seed = 7 } = {}) {
  w.__manual = true;
  w.Math.random = mulberry(seed);
  Object.defineProperty(w, 'devicePixelRatio', { configurable: true, get: () => 2 });
  for (const id of ['hud', 'sm', 'bar']) w.document.getElementById(id).style.display = 'none';
  w.eval(HELPER);
  const g = w.__g;
  w.eval('resize()');
  const out = document.createElement('canvas'); out.width = 1080; out.height = 1920;
  const ctx = out.getContext('2d');
  const pressed = {}, taps = [], done = new Set(), previews = [];
  let pending = [], yaw = 0.85, maxShards = 0;
  const t0 = performance.now(), N = Math.round(end * FPS);

  for (let i = 0; i < N; i++) {
    const t = i / FPS, c = camAt(t);
    yaw += c[1] / FPS;
    g.cam.yaw = yaw; g.cam.dist = c[2]; g.cam.tg[1] = c[3]; g.cam.pitch = 0.12;
    for (const [k, e] of EVENTS.entries()) {
      if (done.has(k) || t < e.t) continue;
      done.add(k);
      if (e.tap) {
        const P = g.facing(e.tap[0])[e.tap[1]];
        if (P) { const [x, y] = g.screen(P.p); g.fire(x, y); taps.push({ t, x, y }); }
      } else {
        pressed[e.key] = t;
        if (e.key === 'Space') g.heavyAt(e.heavy);
        else if (e.key === 'KeyB') g.swarm();
        else if (e.key === 'KeyS') g.toggleSlow();
        else if (e.key === 'KeyR') g.reset();
      }
    }
    const want = samples ? samples.some((s) => Math.abs(s - t) < 0.5 / FPS) : i >= start * FPS;
    if (!want) { w.eval(`now=${t};ts+=(tsT-ts)*Math.min(1,${1 / FPS}*5);for(let i=0;i<2;i++)step(STEP*ts);if(resetT>=0)doReset(${1 / FPS});camera(${1 / FPS})`); continue; }
    g.tick(1 / FPS, t);
    maxShards = Math.max(maxShards, g.sCount);
    compose(ctx, g, t, pressed, taps);
    if (samples) { previews.push(out.toDataURL('image/jpeg', 0.7)); continue; }
    if (post) {
      // toDataURL, not toBlob: toBlob takes seconds per frame in Chrome here.
      const b64 = atob(out.toDataURL('image/jpeg', 0.9).slice(23));
      const bytes = new Uint8Array(b64.length);
      for (let k = 0; k < b64.length; k++) bytes[k] = b64.charCodeAt(k);
      pending.push(fetch(`http://127.0.0.1:8138/f/${shot}/${i}.jpg`, { method: 'POST', body: bytes }));
      if (pending.length >= 6) { await Promise.all(pending); pending = []; }
    }
    if (i % 10 === 0) { w.__progress = i; await new Promise((r) => setTimeout(r, 0)); }
  }
  await Promise.all(pending);
  if (post && !samples) await fetch(`http://127.0.0.1:8138/f/${shot}/0.json`, { method: 'POST', body: JSON.stringify(w.__ev) });
  return { frames: N, seconds: ((performance.now() - t0) / 1000).toFixed(1), events: w.__ev.length, maxShards, previews };
}
