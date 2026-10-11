import { R, key, toPixel, corners, neighbors, edge, EDGE_DIR, DIRS } from './hex.js';
import { computeLayout, gelijkenis } from './layout.js';
import { renderRol, renderProduct, renderGedeeld, zetMethoden } from './factsheet.js';
import { meng, tekstOp, activiteitTint, randKleur } from './kleur.js';

const NS = 'http://www.w3.org/2000/svg';
const DETAIL_ZOOM = 1.4; // vanaf deze zoomfactor worden productnamen zichtbaar

const svg = document.getElementById('kaart');
const viewport = document.getElementById('viewport');
const panel = document.getElementById('factsheet');
const panelBody = document.getElementById('factsheet-body');

const data = await fetch('data/kaart.json').then((r) => r.json());
document.getElementById('versie').textContent = data.versie;
zetMethoden(data.onderzoeksmethoden, data.strategieen);

const { hexes, owner, topics } = computeLayout(data);
const actIndex = Object.fromEntries(data.activiteiten.map((a, i) => [a, i]));

// Hash-adressen: #rol, #rol/product en #gedeeld/onderwerp
const hashOf = (h) =>
  h.type === 'rol' ? `#${h.rol.id}` : h.type === 'product' ? `#${h.rol.id}/${h.product.id}` : `#gedeeld/${h.topic.id}`;
const perHash = new Map();
for (const h of hexes) perHash.set(hashOf(h), h);
for (const h of hexes) if (h.type === 'gedeeld') for (const l of h.topic.leden) perHash.set(`#${l.rol.id}/${l.product.id}`, h);
const hrefVoor = (rol, product) => {
  const h = perHash.get(product ? `#${rol.id}/${product.id}` : `#${rol.id}`);
  return h ? hashOf(h) : '#';
};

// Gelijkenis tussen rollen: cosinus van hun trefwoord-tellingen
const tellingen = new Map(data.rollen.map((rol) => {
  const m = new Map();
  for (const p of rol.producten) for (const t of p.trefwoorden || []) m.set(t, (m.get(t) || 0) + 1);
  return [rol, m];
}));
function lijktOp(rol) {
  return data.rollen
    .filter((o) => o !== rol)
    .map((o) => ({ rol: o, score: gelijkenis(tellingen.get(rol), tellingen.get(o)) }))
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score)
    .slice(0, 3);
}

// ---------- Tekenen ----------
const el = (tag, attrs = {}, parent) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (parent) parent.appendChild(n);
  return n;
};

// Zachte koppeltekens (alleen zichtbaar als de browser er afbreekt) op lettergreepgrenzen in lange woorden.
// Eenvoudige Nederlandse vuistregel: tussen klinkers met één medeklinker ervóór breken (ma-ken), bij meer
// medeklinkers vóór de laatste (hand-lei); 'ch'/'sch' blijven heel. Na '/' en vóór '(' mag ook gebroken worden.
const KLINKER = /[aeiouyáéíóúàèëïöü]/i;
function lettergrepen(woord) {
  if (woord.length < 12) return woord;
  const isKl = (i) => KLINKER.test(woord[i]) || (woord[i] === 'j' && woord[i - 1] === 'i');
  const breuken = [];
  let i = 0;
  while (i < woord.length && !isKl(i)) i++;
  while (i < woord.length) {
    while (i < woord.length && isKl(i)) i++; // klinkergroep
    let j = i;
    while (j < woord.length && !isKl(j)) j++; // medeklinkers tot de volgende klinker
    if (j >= woord.length) break;
    if (!/^[a-zà-ü]+$/i.test(woord.slice(i, j))) { i = j; continue; }
    let b = j - i <= 1 ? i : j - 1;
    if (woord.slice(b - 2, j).toLowerCase() === 'sch') b -= 2;
    else if (woord.slice(b - 1, j).toLowerCase() === 'ch') b -= 1;
    if (b >= 3 && woord.length - b >= 3) breuken.push(b);
    i = j;
  }
  let uit = woord;
  for (const b of breuken.reverse()) uit = uit.slice(0, b) + '­' + uit.slice(b);
  return uit;
}
const afbreekbaar = (tekst) =>
  tekst.split(' ').map(lettergrepen).join(' ').replace(/\//g, '/​').replace(/\(/g, '​(');

// Naam in een HTML-vak binnen de hex (rechthoek die volledig binnen de zeshoek valt), met Nederlandse
// woordafbreking. passTekstIn() verkleint daarna de letter tot de naam er helemaal in past.
const tekstVakken = [];
function addLabel(g, x, y, w, h, text) {
  const fo = el('foreignObject', { x: x - w / 2, y: y - h / 2, width: w, height: h, class: 'naam' }, g);
  const div = document.createElement('div');
  div.className = 'hexlabel';
  div.lang = 'nl';
  div.textContent = afbreekbaar(text);
  fo.appendChild(div);
  tekstVakken.push(div);
  return div;
}

function passTekstIn() {
  const MIN = 5.5;
  let teGroot = tekstVakken;
  for (let ronde = 0; ronde < 12 && teGroot.length; ronde++) {
    // Eerst alles lezen, dan alles schrijven: voorkomt honderden losse herberekeningen van de layout
    teGroot = teGroot.filter((d) => d.scrollWidth > d.clientWidth + 0.5 || d.scrollHeight > d.clientHeight + 0.5);
    for (const d of teGroot) {
      const nu = parseFloat(getComputedStyle(d).fontSize);
      if (nu <= MIN) { d.classList.add('breek'); continue; }
      d.style.fontSize = `${Math.max(MIN, nu - 0.75)}px`;
    }
  }
}

function addText(g, x, y, lines, cls) {
  const t = el('text', { x, y: y - ((lines.length - 1) * 11) / 2 + 4, class: cls, 'text-anchor': 'middle' }, g);
  lines.forEach((line, i) => {
    const s = el('tspan', { x, dy: i === 0 ? 0 : 11 }, t);
    s.textContent = line;
  });
}

// Bounding box
let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
let minC = Infinity, maxC = -Infinity, minR = Infinity, maxR = -Infinity;
for (const h of hexes) {
  const { x, y } = toPixel(h.q, h.r);
  minX = Math.min(minX, x); maxX = Math.max(maxX, x);
  minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  minR = Math.min(minR, h.r); maxR = Math.max(maxR, h.r);
  minC = Math.min(minC, h.q + h.r / 2); maxC = Math.max(maxC, h.q + h.r / 2);
}

// Zee van lege hexen
const zee = el('g', { class: 'zee', 'aria-hidden': 'true' }, viewport);
for (let r = minR - 3; r <= maxR + 3; r++) {
  for (let col = Math.floor(minC) - 4; col <= Math.ceil(maxC) + 4; col++) {
    const q = col - Math.floor(r / 2);
    if (owner.has(key(q, r))) continue;
    const { x, y } = toPixel(q, r);
    el('polygon', { points: corners(x, y, R - 3) }, zee);
  }
}

const defs = el('defs', {}, svg);

const laagHex = el('g', {}, viewport);
const nodes = [];
const soortVan = new Map(); // hexkey -> h
for (const h of hexes) soortVan.set(key(h.q, h.r), h);

for (const h of hexes) {
  const { x, y } = toPixel(h.q, h.r);
  const label =
    h.type === 'rol' ? `Beroepsrol ${h.rol.naam}`
    : h.type === 'product' ? `${h.product.naam}, ${h.rol.code}, ${h.laag}`
    : `Gedeeld onderwerp ${h.topic.naam}: ${h.topic.rollen.map((r) => r.code).join(', ')}`;
  // Rol: rolkleur (wordt de dikke rand van de badge). Product: tint per activiteit, licht (Analyseren) → donker (M&C)
  const vulling =
    h.type === 'rol' ? h.rol.kleur
    : h.type === 'product' ? activiteitTint(h.rol.kleur, actIndex[h.product.activiteit])
    : '#d9d8d2'; // gedeeld onderwerp: grijze hex
  // Rol-badge: grijs midden met een dikke rand in de rolkleur; tekst in de rolkleur (lichte kleuren iets donkerder)
  const rolTekst = tekstOp(h.rol.kleur) === '#ffffff' ? h.rol.kleur : meng(h.rol.kleur, '#000000', 0.3);
  const tekstKleur = h.type === 'rol' ? rolTekst : vulling && tekstOp(vulling);
  const g = el('g', {
    class: `hex ${h.type}`,
    style: `--s: ${randKleur(h.rol.kleur)}; --rolkleur: ${h.rol.kleur}${vulling ? `; --vul: ${vulling}; --tekst-hex: ${tekstKleur}` : ''}`,
    tabindex: 0, role: 'button', 'aria-label': label,
  }, laagHex);
  // Rol-hexen zijn groter dan de rest, met een dubbele witte rand en schaduw (een "badge" midden op het eiland)
  const poly = el('polygon', { points: corners(x, y, h.type === 'rol' ? R * 1.22 : R - 1), class: h.type === 'rol' ? 'ring' : '' }, g);
  h.vulling = vulling;
  h.poly = poly;
  if (h.type === 'rol') {
    el('polygon', { points: corners(x, y, R * 0.98), class: 'binnenrand' }, g);
    // Uitgezoomd de afkorting, ingezoomd de volledige naam (wisselt mee met de productnamen)
    addText(g, x, y + 2, [h.rol.code], 'code');
    addLabel(g, x, y, 54, 42, h.rol.naam).classList.add('rolnaam');
  } else if (h.type === 'product') {
    addLabel(g, x, y, 56, 44, h.product.naam);
  } else {
    addLabel(g, x, y, 56, 44, h.topic.naam);
  }
  el('title', {}, g).textContent =
    h.type === 'rol' ? h.rol.naam : h.type === 'product' ? h.product.naam : `${h.topic.naam} (gedeeld)`;
  g.addEventListener('click', () => { if (!dragged) open(h); });
  g.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(h); }
  });
  h.node = g;
  nodes.push(h);
}

// Gedeelde onderwerpen: grijs midden; vanuit elk van de zes randen de kleur van de hex die daar aangrenst.
// Een kegelverloop laat de zes randkleuren rondom in elkaar overlopen, een rond verloop legt het grijs in het
// midden eroverheen; het geheel wordt in de vorm van de zeshoek uitgeknipt.
const MIDDEN_GRIJS = '#d9d8d2'; // zelfde grijs als de eerdere grijze gedeelde hex
const gedeeldAchtergrond = (kleuren) =>
  `radial-gradient(circle closest-side, ${MIDDEN_GRIJS} 50%, transparent 100%), ` +
  // rand i kijkt in SVG-richting 60°·i (vanaf rechts, met de klok mee); CSS-kegels beginnen boven: +90°
  `conic-gradient(from 90deg, ${kleuren.map((k, i) => `${k} ${i * 60}deg`).join(', ')}, ${kleuren[0]} 360deg)`;
for (const h of nodes) {
  if (h.type !== 'gedeeld') continue;
  const { x, y } = toPixel(h.q, h.r);
  const kleuren = [0, 1, 2, 3, 4, 5].map((i) => {
    const [dq, dr] = DIRS[EDGE_DIR[i]];
    const buur = soortVan.get(key(h.q + dq, h.r + dr));
    if (buur?.type === 'product') return buur.vulling;
    if (buur?.type !== 'gedeeld') return MIDDEN_GRIJS;
    // Twee gedeelde onderwerpen naast elkaar: kies een rolkleur, bij voorkeur van een rol die ze allebei delen,
    // anders de rol van dit onderwerp die het dichtst in de richting van deze rand ligt
    const samen = h.topic.rollen.filter((r) => buur.topic.rollen.includes(r));
    const randHoek = (Math.PI / 3) * i;
    const verschil = (r) => {
      const p = toPixel(...r.centrum);
      const a = Math.atan2(p.y - y, p.x - x);
      return Math.abs(Math.atan2(Math.sin(a - randHoek), Math.cos(a - randHoek)));
    };
    const rol = (samen.length ? samen : h.topic.rollen).reduce((a, b) => (verschil(b) < verschil(a) ? b : a));
    return activiteitTint(rol.kleur, 2);
  });
  const w = Math.sqrt(3) * (R - 1), hg = 2 * (R - 1);
  const fo = el('foreignObject', { x: x - w / 2, y: y - hg / 2, width: w, height: hg, class: 'kleurvlak' });
  const div = document.createElement('div');
  div.className = 'gedeeld-vlak';
  div.style.background = gedeeldAchtergrond(kleuren);
  fo.appendChild(div);
  h.node.insertBefore(fo, h.poly);
}

// Grenslijnen tussen eilanden en langs de kust
let kust = '';
for (const h of hexes) {
  const { x, y } = toPixel(h.q, h.r);
  for (let i = 0; i < 6; i++) {
    const [dq, dr] = DIRS[EDGE_DIR[i]];
    const n = soortVan.get(key(h.q + dq, h.r + dr));
    // Elke gedeelde rand maar één keer tekenen; een gedeeld onderwerp overbrugt de grens, dus daar geen lijn
    const grens = n && owner.get(key(n.q, n.r)) !== owner.get(key(h.q, h.r)) && key(h.q, h.r) < key(n.q, n.r)
      && h.type !== 'gedeeld' && n.type !== 'gedeeld';
    if (!n || grens) kust += edge(x, y, i);
  }
}
el('path', { d: kust, class: 'kustlijn', 'aria-hidden': 'true' }, viewport);

// Rol-hexen bovenop de grenslijnen leggen, zodat ze over hun buren heen vallen
const rolLaag = el('g', { class: 'rollaag' }, viewport);
for (const h of nodes) if (h.type === 'rol') rolLaag.appendChild(h.node);
el('filter', { id: 'rolschaduw', x: '-30%', y: '-30%', width: '160%', height: '160%' }, defs)
  .appendChild(el('feDropShadow', { dx: 0, dy: 3, stdDeviation: 3, 'flood-color': '#000', 'flood-opacity': 0.35 }));

// Rolnamen midden op het eiland (zichtbaar bij uitzoomen)
const labels = el('g', { class: 'eilandlabels', 'aria-hidden': 'true' }, viewport);
for (const rol of data.rollen) {
  const { x, y } = toPixel(...rol.centrum);
  const t = el('text', { x, y: y - R * 1.22 - 14, 'text-anchor': 'middle' }, labels);
  t.textContent = rol.naam;
}

// ---------- Zoomen en pannen (muis, wiel, touch-pinch) ----------
const view = { x: 0, y: 0, k: 1 };
let dragged = false;
const pad = R * 3;
const world = { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };

let fitK = 1;
function apply() {
  viewport.setAttribute('transform', `translate(${view.x},${view.y}) scale(${view.k})`);
  svg.classList.toggle('detail', view.k / fitK >= DETAIL_ZOOM);
}
function fit() {
  const { width, height } = svg.getBoundingClientRect();
  fitK = Math.min(width / world.w, height / world.h);
  view.k = fitK;
  view.x = (width - world.w * fitK) / 2 - world.x * fitK;
  view.y = (height - world.h * fitK) / 2 - world.y * fitK;
  apply();
}
function zoomAt(factor, cx, cy) {
  const k = Math.min(Math.max(view.k * factor, fitK * 0.6), fitK * 8);
  const f = k / view.k;
  view.x = cx - (cx - view.x) * f;
  view.y = cy - (cy - view.y) * f;
  view.k = k;
  apply();
}
function zoomTo(h, factor = 2.6) {
  const { width, height } = svg.getBoundingClientRect();
  const { x, y } = toPixel(h.q, h.r);
  view.k = Math.max(view.k, fitK * factor);
  const offsetX = panel.classList.contains('open') && width > 760 ? -panel.offsetWidth / 2 : 0;
  const offsetY = panel.classList.contains('open') && width <= 760 ? -height * 0.3 : 0;
  view.x = width / 2 + offsetX - x * view.k;
  view.y = height / 2 + offsetY - y * view.k;
  viewport.classList.add('anim');
  apply();
  setTimeout(() => viewport.classList.remove('anim'), 400);
}

svg.addEventListener('wheel', (e) => {
  e.preventDefault();
  const b = svg.getBoundingClientRect();
  zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - b.left, e.clientY - b.top);
}, { passive: false });

const pointers = new Map();
let last = null;
svg.addEventListener('pointerdown', (e) => {
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  dragged = false;
  last = null;
});
window.addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId)) return;
  const prev = pointers.get(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 1) {
    const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
    if (!dragged && Math.hypot(dx, dy) < 3) return;
    dragged = true;
    view.x += dx; view.y += dy;
    apply();
  } else if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    const box = svg.getBoundingClientRect();
    if (last) zoomAt(dist / last, (a.x + b.x) / 2 - box.left, (a.y + b.y) / 2 - box.top);
    last = dist;
    dragged = true;
  }
});
const up = (e) => { pointers.delete(e.pointerId); if (pointers.size < 2) last = null; };
window.addEventListener('pointerup', up);
window.addEventListener('pointercancel', up);

window.addEventListener('resize', fit);

// ---------- Factsheet ----------
let selected = null;
function open(h, { pushHash = true, zoom = true } = {}) {
  selected?.node.classList.remove('selected');
  selected = h;
  h.node.classList.add('selected');
  if (h.type === 'product') panelBody.innerHTML = renderProduct(h.product, h.rol);
  else if (h.type === 'gedeeld') panelBody.innerHTML = renderGedeeld(h.topic);
  else panelBody.innerHTML = renderRol(h.rol, lijktOp(h.rol), data.activiteiten, topics.filter((t) => t.rollen.includes(h.rol)), hrefVoor);
  panel.classList.add('open');
  panel.setAttribute('aria-hidden', 'false');
  if (pushHash) history.replaceState(null, '', hashOf(h));
  if (zoom) zoomTo(h);
  panelBody.querySelector('h2')?.focus();
}
function close() {
  selected?.node.classList.remove('selected');
  selected?.node.focus();
  selected = null;
  panel.classList.remove('open');
  panel.setAttribute('aria-hidden', 'true');
  history.replaceState(null, '', location.pathname);
}
document.getElementById('factsheet-close').onclick = close;
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && selected) close(); });

panelBody.addEventListener('click', (e) => {
  const a = e.target.closest('[data-goto]');
  if (!a) return;
  e.preventDefault();
  const h = perHash.get(a.dataset.goto);
  if (h) open(h);
});

// ---------- Filters ----------
const fLaag = document.getElementById('f-laag');
const fAct = document.getElementById('f-activiteit');
const fZoek = document.getElementById('f-zoek');
data.lagen.forEach((l) => fLaag.add(new Option(l, l)));
data.activiteiten.forEach((a) => fAct.add(new Option(a, a)));

const productMatch = (p, laag, act, zoek) =>
  (!laag || p.laag === laag) &&
  (!act || p.activiteit === act) &&
  (!zoek || `${p.naam} ${(p.tools || []).join(' ')} ${(p.trefwoorden || []).join(' ')}`.toLowerCase().includes(zoek));

function filter() {
  const laag = fLaag.value, act = fAct.value, zoek = fZoek.value.trim().toLowerCase();
  const actief = laag || act || zoek;
  let treffers = 0;
  for (const h of nodes) {
    let match;
    if (h.type === 'product') match = productMatch(h.product, laag, act, zoek);
    else if (h.type === 'gedeeld') {
      match = h.topic.leden.some((l) => productMatch(l.product, laag, act, zoek)) ||
        (!laag && !act && h.topic.naam.toLowerCase().includes(zoek));
    } else {
      // Beroepsrollen blijven altijd zichtbaar als oriëntatiepunt; ze lichten alleen op als de zoekterm ze raakt
      match = !!zoek && !laag && !act && `${h.rol.naam} ${h.rol.code}`.toLowerCase().includes(zoek);
      h.node.classList.toggle('hit', match);
      if (match) treffers++;
      continue;
    }
    h.node.classList.toggle('dim', !!actief && !match);
    h.node.classList.toggle('hit', !!actief && match);
    if (actief && match) treffers++;
  }
  document.getElementById('treffers').textContent = actief ? `${treffers} treffer${treffers === 1 ? '' : 's'}` : '';
}
[fLaag, fAct].forEach((s) => s.addEventListener('change', filter));
fZoek.addEventListener('input', filter);
document.getElementById('f-reset').onclick = () => { fLaag.value = ''; fAct.value = ''; fZoek.value = ''; filter(); };

// Legenda
const legenda = document.getElementById('legenda');
const hexSvg = (fill, cls = '') => `<svg viewBox="-10 -11 20 22" class="swatch ${cls}" aria-hidden="true"><polygon points="${corners(0, 0, 10)}" ${fill ? `style="fill:${fill}"` : ''}/></svg>`;
// Gedeeld onderwerp: zeshoekje in twee halve rolkleuren, zoals op de kaart
// Gedeeld onderwerp in de legenda: neutrale hex
const gedeeldSwatch = `<span class="swatch gedeeld-vlak" aria-hidden="true" style="background:${gedeeldAchtergrond(
  [0, 0, 3, 3, 6, 6].map((j) => activiteitTint(data.rollen[j].kleur, 2)))}"></span>`;
legenda.insertAdjacentHTML('beforeend', `<li class="kop">Beroepsrollen</li><li class="rollen">${
  data.rollen.map((r) => `<span>${hexSvg(r.kleur)}${r.code}</span>`).join('')}</li>`);
legenda.insertAdjacentHTML('beforeend', `<li>${gedeeldSwatch}Gedeeld onderwerp</li>`);
legenda.insertAdjacentHTML('beforeend', '<li class="kop">Activiteit</li>');
data.activiteiten.forEach((a, i) => legenda.insertAdjacentHTML('beforeend', `<li>${hexSvg(activiteitTint('#5f5e5a', i))}${a}</li>`));

// ---------- Start ----------
fit();
passTekstIn();
if (location.hash) {
  const h = perHash.get(decodeURIComponent(location.hash));
  if (h) open(h, { pushHash: false });
}
