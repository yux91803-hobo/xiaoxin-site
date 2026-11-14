// Place list (side panel / phone bottom bar) and the info card. Built before WebGL starts,
// so the list still works if the 3D scene fails. Talks to the rest of the app via the bus.
import { $, fmtCoord } from './dom.js';
import { sunDirection, latLonToXYZ } from '../scene/astro.js';

function dayPhase(pl, date) {
  const s = sunDirection(date), p = latLonToXYZ(pl.lat, pl.lon, 1);
  const d = s[0] * p[0] + s[1] * p[1] + s[2] * p[2];   // sine of the sun's elevation
  return d > 0.1 ? '白天' : d > -0.1 ? (d > 0 ? '黄昏或清晨' : '晨昏线附近') : '夜晚';
}

export function createPlacesUI(places, { store, bus }) {
  const list = $('list'), card = $('card');
  places.forEach((pl, i) => {
    const li = document.createElement('li');
    li.innerHTML = `<button type="button" data-i="${i}"><span class="dot" style="--c:${pl.color}"></span><span><div class="pl-name">${pl.name}</div><div class="pl-sub">${pl.region} · ${fmtCoord(pl.lat, 'N', 'S')} ${fmtCoord(pl.lon, 'E', 'W')}</div></span></button>`;
    li.querySelector('button').addEventListener('click', () => bus.emit('place:select', { index: i, source: 'list' }));
    list.appendChild(li);
  });
  const buttons = [...list.querySelectorAll('button')];

  let clockTimer = 0;
  function renderLocal(pl) {
    let time = '';
    try { time = new Intl.DateTimeFormat('zh-CN', { timeZone: pl.tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()); } catch {}
    $('cardLocal').innerHTML = time ? `当地时间 <b>${time}</b> · ${dayPhase(pl, new Date())}` : '';
  }

  store.watch((s) => s.selected, (i) => {
    buttons.forEach((b, j) => b.classList.toggle('active', j === i));
    clearInterval(clockTimer);
    if (i < 0) { card.classList.remove('show'); return; }
    const pl = places[i];
    buttons[i].scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    card.style.setProperty('--c', pl.color);
    $('cardRegion').textContent = pl.region;
    $('cardName').textContent = pl.name;
    $('cardCoord').textContent = `${fmtCoord(pl.lat, 'N', 'S')}  ·  ${fmtCoord(pl.lon, 'E', 'W')}`;
    $('cardDesc').textContent = pl.desc;
    renderLocal(pl); clockTimer = setInterval(() => renderLocal(pl), 30000);
    card.classList.add('show');
  });
  $('cardClose').addEventListener('click', () => bus.emit('place:clear'));
  $('cardReal').addEventListener('click', () => bus.emit('photoreal:request', { index: store.get().selected }));
}
