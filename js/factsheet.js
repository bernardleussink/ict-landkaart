const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

import { tekstOp } from './kleur.js';

const badge = (rol) => `<span class="badge" style="background:${rol.kleur};color:${tekstOp(rol.kleur)}">${esc(rol.code)}</span>`;

const sectie = (titel, inhoud) => `<section class="fs-sectie"><h3>${titel}</h3>${inhoud}</section>`;

const leeg = (tekst) => `<p class="leeg">${tekst}</p>`;

const uniek = (xs, k = (x) => x) => xs.filter((x, i) => xs.findIndex((y) => k(y) === k(x)) === i);

function leerpaden(links) {
  if (!links.length) return leeg('Nog geen extern leerpad gekoppeld.');
  return `<ul class="links">${links.map((l) => `<li><a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)} ↗</a></li>`).join('')}</ul>`;
}

const productLeerpad = (p) => (p.leerpad ? [{ label: p.leerpad.replace(/^https?:\/\//, ''), url: p.leerpad }] : []);

const tools = (lijst) =>
  lijst.length ? `<div class="chips">${lijst.map((t) => `<span class="chip tool">${esc(t)}</span>`).join('')}</div>` : leeg('Nog geen tools toegevoegd.');

// Onderzoeksmethoden uit het DOT framework (ictresearchmethods.nl), gegroepeerd per strategie met logo
let bron = { methoden: {}, strategieen: {} };
export function zetMethoden(methoden = {}, strategieen = {}) { bron = { methoden, strategieen }; }

function onderzoeksmethoden(namen) {
  if (!namen.length) return '';
  const perStrategie = Object.keys(bron.strategieen)
    .map((s) => [s, namen.filter((n) => bron.methoden[n]?.strategie === s)])
    .filter(([, ms]) => ms.length);
  const rijen = perStrategie.map(([s, ms]) => `
    <div class="dot-rij">
      <img class="dot-logo" src="${esc(bron.strategieen[s].logo)}" alt="DOT-strategie ${esc(s)}" width="36" height="36" loading="lazy">
      <div>
        <div class="dot-strategie">${esc(s)} <span class="sub">${esc(bron.strategieen[s].motto)}</span></div>
        <div class="dot-methoden">${ms.map((m) => `<a href="${esc(bron.methoden[m].url)}" target="_blank" rel="noopener">${esc(m)} ↗</a>`).join('')}</div>
      </div>
    </div>`).join('');
  return sectie('Onderzoeksmethoden <a class="dot-bron" href="https://ictresearchmethods.nl/dot-framework/" target="_blank" rel="noopener">DOT framework ↗</a>', rijen);
}

const trefwoorden = (lijst) =>
  lijst.length ? `<div class="chips trefwoorden">${lijst.map((t) => `<span class="chip trefwoord">#${esc(t)}</span>`).join('')}</div>` : '';


export function renderProduct(p, rol) {
  return `
    <header class="fs-kop">
      ${badge(rol)}<span class="soort">Beroepsproduct</span>
    </header>
    <h2 tabindex="-1">${esc(p.naam)}</h2>
    <div class="chips"><span class="chip">${esc(p.laag)}</span><span class="chip">${esc(p.activiteit)}</span></div>
    ${trefwoorden(p.trefwoorden || [])}
    ${sectie('Wat is het', p.beschrijving ? `<p>${esc(p.beschrijving)}</p>` : leeg('Nog geen beschrijving. Hier komt een korte uitleg van 2 à 3 zinnen.'))}
    ${sectie('Tools en voorbeelden', tools(p.tools || []))}
    ${sectie('Beroepsrol', `<a href="#" data-goto="#${rol.id}">${esc(rol.naam)}</a>`)}
    ${sectie('Leerpad extern', leerpaden([...productLeerpad(p), ...rol.leerpaden]))}
    ${onderzoeksmethoden(p.methoden || [])}`;
}

export function renderGedeeld(t) {
  const beschrijving = t.leden.find((l) => l.product.beschrijving)?.product.beschrijving;
  const alleTools = uniek(t.leden.flatMap((l) => l.product.tools || []));
  const paden = uniek([...t.leden.flatMap((l) => productLeerpad(l.product)), ...t.rollen.flatMap((r) => r.leerpaden)], (l) => l.url);
  const lagen = uniek(t.leden.map((l) => l.product.laag));
  const perRol = t.rollen
    .map((r) => {
      const items = t.leden
        .filter((l) => l.rol === r)
        .map((l) => `<li>${esc(l.product.naam)} <span class="sub">${esc(l.product.laag)} · ${esc(l.product.activiteit)}</span></li>`)
        .join('');
      return `<div class="perrol"><a href="#" class="ook" data-goto="#${r.id}">${badge(r)} ${esc(r.naam)}</a><ul>${items}</ul></div>`;
    })
    .join('');
  return `
    <header class="fs-kop">
      ${t.rollen.map(badge).join('')}<span class="soort">Gedeeld onderwerp</span>
    </header>
    <h2 tabindex="-1">${esc(t.naam)}</h2>
    <div class="chips">${lagen.map((l) => `<span class="chip">${esc(l)}</span>`).join('')}</div>
    ${trefwoorden(uniek(t.leden.flatMap((l) => l.product.trefwoorden || [])))}
    ${sectie('Wat is het', beschrijving ? `<p>${esc(beschrijving)}</p>` : leeg('Nog geen beschrijving. Hier komt een korte uitleg van 2 à 3 zinnen.'))}
    ${sectie(`Per beroepsrol (${t.rollen.length})`, perRol)}
    ${sectie('Tools en voorbeelden', tools(alleTools))}
    ${sectie('Leerpad extern', leerpaden(paden))}
    ${onderzoeksmethoden(uniek(t.leden.flatMap((l) => l.product.methoden || [])))}`;
}

export function renderRol(rol, lijktOp, activiteiten, topics, hrefVoor) {
  const groepen = activiteiten
    .map((a) => [a, rol.producten.filter((p) => p.activiteit === a)])
    .filter(([, ps]) => ps.length)
    .map(([a, ps]) => `<li><span class="act">${esc(a)}</span>${ps.map((p) => `<a href="#" data-goto="${hrefVoor(rol, p)}">${esc(p.naam)}</a>`).join('')}</li>`)
    .join('');
  const gedeeld = topics
    .map((t) => `<a href="#" class="ook" data-goto="#gedeeld/${t.id}">${esc(t.naam)} <span class="score">${t.rollen.filter((r) => r !== rol).map((r) => r.code).join(', ')}</span></a>`)
    .join('');
  return `
    <header class="fs-kop">
      ${badge(rol)}<span class="soort">Beroepsrol</span>
    </header>
    <h2 tabindex="-1">${esc(rol.naam)}</h2>
    <p>${esc(rol.beschrijving)}</p>
    ${sectie(`Beroepsproducten (${rol.producten.length})`, `<ul class="groepen">${groepen}</ul>`)}
    ${sectie('Gedeeld met andere rollen', gedeeld || leeg('Geen gedeelde onderwerpen.'))}
    ${sectie('Lijkt op', lijktOp.length
      ? lijktOp.map(({ rol: r, score }) => `<a href="#" class="ook" data-goto="#${r.id}">${badge(r)} ${esc(r.naam)} <span class="score">${Math.round(score * 100)}% gelijkenis</span></a>`).join('')
      : leeg('Geen overlap met andere rollen in de huidige data.'))}
    ${sectie('Leerpad extern', leerpaden(rol.leerpaden))}`;
}
