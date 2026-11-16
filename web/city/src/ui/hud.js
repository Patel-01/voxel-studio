// All on-screen interface: stats bar, speed controls, building palette, the
// selected-building card, advice, toasts and the reset dialog. No game rules here.

import { ECON, SPEEDS } from '../config.js';
import { DEFS, PALETTE } from '../buildings.js';

const $ = (id) => document.getElementById(id);
const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
const money = (n) => `$${Math.floor(n).toLocaleString('en-US')}`;

function el(tag, props = {}, children = []) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

export class Hud {
  constructor(game, tools, actions) {
    Object.assign(this, { game, tools, actions });
    this._shown = {};
    this.el = {
      funds: $('stat-funds'), net: $('stat-net'), people: $('stat-people'), happy: $('stat-happy'), happyBar: $('happy-bar'),
      power: $('stat-power'), jobs: $('stat-jobs'), advisor: $('advisor'), saved: $('saved'),
      palette: $('palette'), info: $('info'), toast: $('toast'), preview: $('preview'),
      pause: $('pause'), speeds: [...document.querySelectorAll('[data-speed]')],
      select: $('tool-select'), bulldoze: $('tool-bulldoze'), rotate: $('tool-rotate'),
      dialog: $('reset-dialog'),
    };
    const e = this.el;

    this.cards = {};
    for (const type of PALETTE) {
      const def = DEFS[type];
      const swatch = el('span', { className: 'swatch' });
      swatch.style.setProperty('--top', hex(def.swatch[0]));
      swatch.style.setProperty('--side', hex(def.swatch[1]));
      const card = el('button', { className: 'card', title: def.blurb }, [
        swatch, el('span', { className: 'name', textContent: def.name }), el('span', { className: 'cost', textContent: `$${def.cost}` })]);
      card.addEventListener('click', () => (tools.mode === 'build' && tools.type === type ? tools.select(0) : tools.build(type)));
      e.palette.append(card);
      this.cards[type] = card;
    }

    e.select.addEventListener('click', () => tools.select(0));
    e.bulldoze.addEventListener('click', () => tools.bulldoze());
    e.rotate.addEventListener('click', () => actions.rotate());
    e.pause.addEventListener('click', () => game.togglePause());
    for (const b of e.speeds) b.addEventListener('click', () => game.setSpeed(Number(b.dataset.speed)));
    $('reset').addEventListener('click', () => { e.dialog.hidden = false; $('reset-empty').focus(); });
    $('reset-cancel').addEventListener('click', () => { e.dialog.hidden = true; });
    $('reset-empty').addEventListener('click', () => { e.dialog.hidden = true; actions.reset('empty'); });
    $('reset-starter').addEventListener('click', () => { e.dialog.hidden = true; actions.reset('starter'); });
    e.dialog.addEventListener('click', (ev) => { if (ev.target === e.dialog) e.dialog.hidden = true; });

    tools.on(() => this.sync());
    game.on(() => this.sync());
    this.sync();
  }

  _set(key, value, apply) {
    if (this._shown[key] === value) return;
    this._shown[key] = value;
    apply(value);
  }

  toast(text, kind = 'bad') {
    const t = this.el.toast;
    t.textContent = text;
    t.dataset.kind = kind;
    t.classList.remove('show');
    void t.offsetWidth; // restart the animation
    t.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
  }

  flashSaved() {
    this.el.saved.classList.add('show');
    clearTimeout(this._savedTimer);
    this._savedTimer = setTimeout(() => this.el.saved.classList.remove('show'), 1200);
  }

  // The line under the cursor's preview: what will happen and what it costs.
  setPreview(result, tools, swaps, armed) {
    let text = '', kind = 'ok';
    if (result && tools) {
      const name = DEFS[tools.type].name;
      if (!result.ok) { text = result.reason; kind = 'bad'; }
      else if (tools.mode === 'move') text = `Move ${name.toLowerCase()} here`;
      else if (swaps) { text = `Replace with ${name.toLowerCase()} · ${money(result.cost)}`; kind = 'swap'; }
      else text = `${name} · ${money(result.cost)}`;
      if (armed && result.ok) text += ' · tap again to confirm';
    }
    this._set('preview', `${kind}|${text}`, () => {
      this.el.preview.textContent = text;
      this.el.preview.dataset.kind = kind;
      this.el.preview.classList.toggle('show', !!text);
    });
  }

  _advice(s) {
    if (!s.homes) return 'Lay a road, then place houses beside it.';
    if (s.unroaded) return `${s.unroaded} building${s.unroaded > 1 ? 's have' : ' has'} no road access (red marker).`;
    if (s.powerShort) return 'Not enough power (yellow marker). Build a wind turbine.';
    if (s.population >= s.jobs * ECON.jobSlack + 4 - 1 && s.population < s.capacity) return 'Homes are waiting on jobs. Add shops or a workshop.';
    if (s.jobs > s.population * 1.5 + 6) return 'Businesses are short of workers. Add homes.';
    if (s.happiness < 50) return 'People are unhappy. Add parks, trees or a fountain near homes.';
    if (this.game.money < 0) return 'Funds are negative. Remove costly buildings or grow the tax base.';
    return 'The town is doing well.';
  }

  _info() {
    const { game, tools } = this;
    const b = tools.mode === 'select' ? game.grid.buildings.get(tools.selectedId) : null;
    const key = b ? `${b.id}|${b.type}|${b.pop}|${b.joy}|${b.road}|${b.powered}|${b.rot}` : '';
    this._set('info', key, () => {
      const box = this.el.info;
      box.hidden = !b;
      if (!b) return;
      const def = DEFS[b.type];
      const rows = [];
      if (def.capacity) rows.push(['Residents', `${b.pop} / ${def.capacity}`], ['Happiness', `${b.joy}%`]);
      if (def.jobs) rows.push(['Jobs', String(def.jobs)]);
      if (def.supply) rows.push(['Power', `+${def.supply}`]);
      if (def.power) rows.push(['Uses power', String(def.power)]);
      if (def.joy) rows.push(['Nearby mood', `${def.joy.amount > 0 ? '+' : ''}${def.joy.amount}`]);
      rows.push(['Upkeep', `$${def.upkeep}/day`]);
      let status = '', bad = false;
      if (def.needsRoad && !b.road) { status = 'No road access'; bad = true; }
      else if (def.power && !b.powered) { status = 'No power'; bad = true; }
      else if (def.needsRoad) status = 'Connected';
      const button = (label, fn, cls = '') => { const n = el('button', { textContent: label, className: cls }); n.addEventListener('click', fn); return n; };
      box.replaceChildren(
        el('h2', { textContent: def.name }),
        el('p', { className: 'blurb', textContent: def.blurb }),
        ...(status ? [el('p', { className: `status ${bad ? 'bad' : 'good'}`, textContent: status })] : []),
        el('dl', {}, rows.flatMap(([k, v]) => [el('dt', { textContent: k }), el('dd', { textContent: v })])),
        el('div', { className: 'actions' }, [
          button('Move', () => tools.startMove(b)), button('Rotate', () => this.actions.rotate()),
          button(`Remove +$${Math.floor(def.cost * ECON.refund)}`, () => { game.remove(b.id); tools.select(0); }, 'danger')]),
      );
    });
  }

  sync() {
    const { game, tools, el: e } = this;
    const s = game.stats;
    this._set('funds', Math.floor(game.money), (v) => { e.funds.textContent = money(v); e.funds.classList.toggle('neg', v < 0); });
    const net = Math.round((s.net || 0) * 10) / 10;
    this._set('net', net, (v) => { e.net.textContent = `${v >= 0 ? '+' : '−'}$${Math.abs(v).toFixed(1)}/day`; e.net.classList.toggle('neg', v < 0); });
    this._set('people', `${s.population}/${s.capacity}`, (v) => { e.people.textContent = v; });
    this._set('happy', s.happiness, (v) => { e.happy.textContent = `${v}%`; e.happyBar.style.width = `${v}%`; e.happyBar.dataset.level = v < 45 ? 'low' : v < 65 ? 'mid' : 'high'; });
    this._set('power', `${s.demand}/${s.supply}`, (v) => { e.power.textContent = v; e.power.classList.toggle('neg', s.powerShort); });
    this._set('jobs', `${Math.min(s.population, s.jobs)}/${s.jobs}`, (v) => { e.jobs.textContent = v; });
    this._set('advice', this._advice(s), (v) => { e.advisor.textContent = v; });

    this._set('speed', `${game.paused}|${game.speedIndex}`, () => {
      e.pause.setAttribute('aria-pressed', String(game.paused));
      e.pause.textContent = game.paused ? 'Resume' : 'Pause';
      for (const b of e.speeds) b.setAttribute('aria-pressed', String(!game.paused && Number(b.dataset.speed) === game.speedIndex));
    });
    this._set('tool', `${tools.mode}|${tools.type}`, () => {
      e.select.setAttribute('aria-pressed', String(tools.mode === 'select' || tools.mode === 'move'));
      e.bulldoze.setAttribute('aria-pressed', String(tools.mode === 'bulldoze'));
      for (const type of PALETTE) this.cards[type].setAttribute('aria-pressed', String(tools.mode === 'build' && tools.type === type));
    });
    this._set('afford', PALETTE.map((t) => (DEFS[t].cost <= game.money ? 1 : 0)).join(''), (v) => {
      PALETTE.forEach((t, k) => this.cards[t].classList.toggle('poor', v[k] === '0'));
    });
    if (tools.mode !== 'build' && tools.mode !== 'move') this.setPreview(null);
    this._info();
  }
}

export { SPEEDS };
