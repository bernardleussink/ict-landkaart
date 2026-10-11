// Berekent waar elke zeshoek komt:
// 1. Eilanden groeien tegelijk vanuit hun middelpunt naar elkaar toe tot ze tegen elkaar aan liggen.
// 2. Gedeelde onderwerpen krijgen een plek op de grens tussen de eilanden van hun rollen.
// 3. Binnen een eiland liggen producten die alleen deze rol maakt bij het midden, en producten die via hun
//    trefwoorden overlappen met andere rollen richting de grens met die rollen. De activiteit is alleen kleur.
import { R, key, toPixel, neighbors, hexDist } from './hex.js';

const px = (h) => toPixel(h[0], h[1]);
const pxDist = (a, b) => { const p = px(a), s = px(b); return Math.hypot(p.x - s.x, p.y - s.y); };

export const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '');

// Pixel → dichtstbijzijnde axiale hex-coördinaat
function naarHex(x, y) {
  const fq = ((Math.sqrt(3) / 3) * x - y / 3) / R;
  const fr = ((2 / 3) * y) / R;
  const fs = -fq - fr;
  let q = Math.round(fq), r = Math.round(fr), s = Math.round(fs);
  const dq = Math.abs(q - fq), dr = Math.abs(r - fr), ds = Math.abs(s - fs);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  return [q, r];
}

// Cosinus-gelijkenis tussen twee trefwoord-tellingen (Map trefwoord -> aantal)
export function gelijkenis(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (const [t, v] of a) { na += v * v; dot += v * (b.get(t) || 0); }
  for (const v of b.values()) nb += v * v;
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

// Hoe ver verwante eilanden in elkaar drukken en zich naar elkaar uitrekken (0 = niet).
// Hogere waarden geven langere grenzen, maar ook grillige vormen (lange tongen tussen andere eilanden).
const INDRUKKEN = 0.1;
const UITREKKEN = 0.1;

// Verwantschap tussen rollen (0..1): gedeelde onderwerpen plus inhoudelijke gelijkenis via trefwoorden
const bk = (a, b) => [a.code, b.code].sort().join('|');
function berekenVerwantschap(rollen, topics, tagTelling) {
  const band = new Map();
  for (const t of topics) {
    for (const a of t.rollen) for (const b of t.rollen) {
      if (a.code < b.code) band.set(bk(a, b), (band.get(bk(a, b)) || 0) + 1 / (t.rollen.length - 1));
    }
  }
  for (const a of rollen) for (const b of rollen) {
    if (a.code >= b.code) continue;
    const sim = gelijkenis(tagTelling.get(a), tagTelling.get(b));
    if (sim > 0.2) band.set(bk(a, b), (band.get(bk(a, b)) || 0) + 3 * sim);
  }
  for (const [k, w] of band) band.set(k, Math.min(w, 3) / 3);
  return band;
}

// Middelpunten van de eilanden: verwante rollen trekken elkaar aan en mogen dichter op elkaar liggen
// (dan drukken ze tegen elkaar en wordt hun grens langer); andere eilanden houden net genoeg afstand
// om elkaar te raken. `positie` uit de data is het startpunt.
function plaatsMiddelpunten(rollen, cap, seed, band) {
  const straal = new Map(rollen.map((r) => [r, 0.909 * Math.sqrt(cap.get(r)) * R]));
  const pos = new Map(rollen.map((r) => [r, { ...px(seed.get(r)) }]));
  for (let stap = 0; stap < 600; stap++) {
    const kracht = new Map(rollen.map((r) => [r, { x: 0, y: 0 }]));
    const zw = { x: 0, y: 0 };
    for (const r of rollen) { zw.x += pos.get(r).x / rollen.length; zw.y += pos.get(r).y / rollen.length; }
    for (const a of rollen) {
      const pa = pos.get(a), fa = kracht.get(a);
      // Lichte zwaartekracht naar het midden: houdt de kaart compact
      fa.x += (zw.x - pa.x) * 0.01;
      fa.y += (zw.y - pa.y) * 0.01;
      for (const b of rollen) {
        if (a === b) continue;
        const pb = pos.get(b);
        const dx = pb.x - pa.x, dy = pb.y - pa.y;
        const d = Math.hypot(dx, dy) || 1;
        const raak = straal.get(a) + straal.get(b);
        const w = band.get(bk(a, b)) || 0;
        const doel = raak * (1 - INDRUKKEN * w); // hoe verwanter, hoe dieper ze in elkaar drukken
        let f = 0;
        if (w > 0 && d > doel) f += w * 0.06 * (d - doel);
        if (d < doel) f -= 0.3 * (doel - d);
        fa.x += (f * dx) / d;
        fa.y += (f * dy) / d;
      }
    }
    for (const r of rollen) { pos.get(r).x += kracht.get(r).x; pos.get(r).y += kracht.get(r).y; }
  }
  const bezet = new Set();
  for (const r of rollen) {
    let h = naarHex(pos.get(r).x, pos.get(r).y);
    while (bezet.has(key(...h))) h = [h[0] + 1, h[1]];
    bezet.add(key(...h));
    seed.set(r, h);
  }
}

export function computeLayout(data) {
  const rollen = data.rollen;
  const byCode = new Map(rollen.map((r) => [r.code, r]));
  const seed = new Map(rollen.map((r) => [r, r.positie]));
  const actOrder = Object.fromEntries(data.activiteiten.map((a, i) => [a, i]));

  // Unieke id's per product binnen een rol
  for (const rol of rollen) {
    rol.id = slug(rol.code);
    const ids = new Set();
    for (const p of rol.producten) {
      p.id = slug(p.naam);
      if (ids.has(p.id)) p.id += '-' + slug(p.laag);
      ids.add(p.id);
    }
  }

  // ---------- Gedeelde onderwerpen ----------
  const gedeeldeProducten = new Set();
  const topics = [];
  for (const g of data.gedeeld || []) {
    const leden = [];
    for (const [code, naam] of g.producten) {
      const rol = byCode.get(code);
      const ps = rol?.producten.filter((p) => p.naam === naam) || [];
      if (!ps.length) console.warn(`Gedeeld onderwerp "${g.naam}": ${code}: ${naam} niet gevonden`);
      for (const p of ps) leden.push({ rol, product: p });
    }
    const tRollen = [...new Set(leden.map((l) => l.rol))];
    if (tRollen.length < 2) continue;
    leden.forEach((l) => gedeeldeProducten.add(l.product));
    topics.push({ naam: g.naam, id: slug(g.naam), leden, rollen: tRollen });
  }
  const eigen = new Map(rollen.map((r) => [r, r.producten.filter((p) => !gedeeldeProducten.has(p))]));

  // Per rol: hoe vaak komt elk trefwoord voor
  const tagTelling = new Map(rollen.map((r) => {
    const m = new Map();
    for (const p of r.producten) for (const t of p.trefwoorden || []) m.set(t, (m.get(t) || 0) + 1);
    return [r, m];
  }));

  // ---------- 1. Eilanden laten groeien ----------
  const owner = new Map(); // hexkey -> rol
  const region = new Map(rollen.map((r) => [r, []]));
  const claim = (r, h) => { owner.set(key(...h), r); region.get(r).push(h); };
  const release = (r, h) => {
    owner.delete(key(...h));
    const reg = region.get(r);
    reg.splice(reg.findIndex((x) => x[0] === h[0] && x[1] === h[1]), 1);
  };
  // Groeirichtingen: een eiland groeit liever richting verwante buren (rekt zich naar ze uit)
  let trek = new Map();
  function bestFrontier(r) {
    let best = null, bd = Infinity;
    const s = px(seed.get(r));
    for (const h of region.get(r)) {
      for (const n of neighbors(...h)) {
        if (owner.has(key(...n))) continue;
        const p = px(n);
        const vx = p.x - s.x, vy = p.y - s.y;
        let d = Math.hypot(vx, vy);
        for (const { ux, uy, w } of trek.get(r) || []) d -= UITREKKEN * w * Math.max(0, vx * ux + vy * uy);
        if (d < bd) { bd = d; best = n; }
      }
    }
    return best;
  }

  // Losgeraakte stukjes (door het duwen) worden weer zee; het eiland groeit daarna vanuit zijn hoofddeel aan
  function maakAaneengesloten() {
    let gewijzigd = false;
    for (const r of rollen) {
      const gezien = new Set([key(...seed.get(r))]);
      const rij = [seed.get(r)];
      while (rij.length) {
        for (const n of neighbors(...rij.pop())) {
          const k = key(...n);
          if (gezien.has(k) || owner.get(k) !== r) continue;
          gezien.add(k);
          rij.push(n);
        }
      }
      for (const h of region.get(r).filter((x) => !gezien.has(key(...x)) && !vast.has(key(...x)))) {
        release(r, h);
        gewijzigd = true;
      }
    }
    return gewijzigd;
  }
  function groeiAaneengesloten(cap) {
    for (let poging = 0; poging < 20; poging++) {
      grow(cap);
      if (!maakAaneengesloten()) return;
    }
    console.warn('Eilanden konden niet volledig aaneengesloten gemaakt worden.');
  }

  // Ingesloten eiland: zoek de kortste weg door de buren naar open zee en schuif elk eiland op die weg
  // één hex op. Het ingesloten eiland wordt één hex groter, het laatste eiland op de weg groeit de zee in.
  const vast = new Set(); // middelpunten en gedeelde onderwerpen wisselen nooit van eiland
  function duw(r) {
    const vorige = new Map();
    const rij = [];
    for (const h of region.get(r)) {
      for (const n of neighbors(...h)) {
        const k = key(...n);
        if (owner.get(k) === r || vorige.has(k) || vast.has(k)) continue;
        vorige.set(k, null);
        rij.push(n);
      }
    }
    let doel = null;
    for (let i = 0; i < rij.length && !doel; i++) {
      const h = rij[i];
      if (!owner.has(key(...h))) { doel = h; break; }
      for (const n of neighbors(...h)) {
        const k = key(...n);
        if (owner.get(k) === r || vorige.has(k) || vast.has(k)) continue;
        vorige.set(k, h);
        rij.push(n);
      }
    }
    if (!doel) return false;
    // Pad terug opbouwen: van de rand van r naar de zee
    const pad = [];
    for (let h = doel; h; h = vorige.get(key(...h))) pad.unshift(h);
    // Van achter naar voren: elke hex gaat naar de eigenaar van de hex ervoor
    for (let i = pad.length - 1; i >= 0; i--) {
      const nieuw = i === 0 ? r : owner.get(key(...pad[i - 1]));
      const oud = owner.get(key(...pad[i]));
      if (oud === nieuw) continue;
      if (oud) release(oud, pad[i]);
      claim(nieuw, pad[i]);
    }
    return true;
  }

  function grow(cap) {
    for (let stappen = 0; ; stappen++) {
      let pick = null, ratio = Infinity;
      for (const r of rollen) {
        const size = region.get(r).length;
        if (size < cap.get(r) && size / cap.get(r) < ratio) { ratio = size / cap.get(r); pick = r; }
      }
      if (!pick) return;
      const h = bestFrontier(pick);
      if (h) claim(pick, h);
      else if (stappen > 20000 || !duw(pick)) {
        console.warn(`Eiland ${pick.code} is ingesloten en kan niet verder groeien.`);
        return;
      }
    }
  }

  const cap = new Map(rollen.map((r) => [r, 1 + eigen.get(r).length]));
  for (const t of topics) for (const r of t.rollen) cap.set(r, cap.get(r) + 1 / t.rollen.length);
  for (const [r, c] of cap) cap.set(r, Math.round(c));
  const band = berekenVerwantschap(rollen, topics, tagTelling);
  plaatsMiddelpunten(rollen, cap, seed, band);
  trek = new Map(rollen.map((r) => {
    const s = px(seed.get(r));
    return [r, rollen.filter((o) => o !== r && band.get(bk(r, o))).map((o) => {
      const p = px(seed.get(o));
      const d = Math.hypot(p.x - s.x, p.y - s.y) || 1;
      return { ux: (p.x - s.x) / d, uy: (p.y - s.y) / d, w: band.get(bk(r, o)) };
    })];
  }));
  for (const r of rollen) { claim(r, seed.get(r)); vast.add(key(...seed.get(r))); }
  groeiAaneengesloten(cap);

  // ---------- 2. Gedeelde onderwerpen op de grens ----------
  const gebruikt = vast;
  const distToRegion = (h, r) => {
    if (owner.get(key(...h)) === r) return 0;
    let m = Infinity;
    for (const x of region.get(r)) m = Math.min(m, hexDist(h, x));
    return m;
  };
  const gedeeldHex = []; // { h, topic }
  // Onderwerpen met meer rollen eerst: die hebben het minst keus
  for (const t of [...topics].sort((a, b) => b.rollen.length - a.rollen.length)) {
    const midden = t.rollen.map((r) => px(seed.get(r))).reduce((a, p) => ({ x: a.x + p.x / t.rollen.length, y: a.y + p.y / t.rollen.length }), { x: 0, y: 0 });
    let best = null, bestCost = Infinity;
    for (const r of t.rollen) {
      for (const h of region.get(r)) {
        if (gebruikt.has(key(...h))) continue;
        // Eerst zoveel mogelijk rollen direct aangrenzend, daarna zo dicht mogelijk bij de rest
        const cost = t.rollen.reduce((s, o) => { const d = distToRegion(h, o); return s + (d <= 1 ? 0 : 10 + d); }, 0);
        const p = px(h);
        const tie = Math.hypot(p.x - midden.x, p.y - midden.y) / 10000;
        if (cost + tie < bestCost) { bestCost = cost + tie; best = h; }
      }
    }
    gebruikt.add(key(...best));
    t.hex = best;
    t.eigenaar = owner.get(key(...best));
    gedeeldHex.push(t);
  }

  // ---------- Grootte van eilanden kloppend maken ----------
  const nodig = new Map(rollen.map((r) => [r, 1 + eigen.get(r).length]));
  for (const t of topics) nodig.set(t.eigenaar, nodig.get(t.eigenaar) + 1);
  const grenstAanAnder = (h, r) => neighbors(...h).some((n) => { const o = owner.get(key(...n)); return o && o !== r; });
  for (const r of rollen) {
    while (region.get(r).length > nodig.get(r)) {
      // Haal eerst kust-hexen weg die het verst van het centrum liggen, niet de grens met buren
      const kandidaten = region.get(r).filter((h) => !gebruikt.has(key(...h)));
      kandidaten.sort((a, b) => (grenstAanAnder(a, r) - grenstAanAnder(b, r)) || (pxDist(b, seed.get(r)) - pxDist(a, seed.get(r))));
      release(r, kandidaten[0]);
    }
  }
  groeiAaneengesloten(nodig);

  // ---------- 3. Producten plaatsen op basis van overlap ----------
  const telLaag = (r, laag) => r.producten.filter((p) => p.laag === laag).length;
  const telCel = (r, laag, act) => r.producten.filter((p) => p.laag === laag && p.activiteit === act).length;

  // Welke eilanden raken elkaar?
  const raakt = new Set();
  for (const [k, r] of owner) {
    const [q, s] = k.split(',').map(Number);
    for (const n of neighbors(q, s)) {
      const o = owner.get(key(...n));
      if (o && o !== r) raakt.add(`${r.code}|${o.code}`);
    }
  }

  // Overlap van een product met elke andere rol. Met trefwoorden: welk deel van de producten van die rol
  // hetzelfde trefwoord heeft. Zonder trefwoorden: producten in dezelfde laag × activiteit (grover).
  // Rollen die niet aangrenzen tellen minder mee.
  function overlap(r, p) {
    const per = [];
    for (const o of rollen) {
      if (o === r) continue;
      const w = raakt.has(`${r.code}|${o.code}`) ? 1 : 0.3;
      const v = p.trefwoorden?.length
        ? w * p.trefwoorden.reduce((s, t) => s + (tagTelling.get(o).get(t) || 0) / o.producten.length, 0)
        : w * (telCel(o, p.laag, p.activiteit) + 0.25 * telLaag(o, p.laag)) / o.producten.length;
      if (v > 0) per.push({ rol: o, v });
    }
    return { score: per.reduce((s, x) => s + x.v, 0), per };
  }

  const hexes = [];
  for (const r of rollen) {
    const c = px(seed.get(r));
    r.centrum = seed.get(r);
    hexes.push({ q: seed.get(r)[0], r: seed.get(r)[1], type: 'rol', rol: r });

    const vrij = region.get(r)
      .filter((h) => !gebruikt.has(key(...h)))
      .map((h) => { const p = px(h); return { h, d: Math.hypot(p.x - c.x, p.y - c.y) }; });

    // Meest gedeelde producten kiezen eerst: zo dicht mogelijk bij de rollen waarmee ze overlappen.
    // Producten zonder overlap houden de plekken bij het midden over.
    const producten = eigen.get(r)
      .map((p) => ({ p, ...overlap(r, p) }))
      .sort((a, b) => b.score - a.score || actOrder[a.p.activiteit] - actOrder[b.p.activiteit]);
    const afstand = new Map(); // gecachte afstand van hex tot eiland van rol
    const tot = (x, o) => {
      const k = `${key(...x.h)}|${o.code}`;
      if (!afstand.has(k)) afstand.set(k, distToRegion(x.h, o));
      return afstand.get(k);
    };
    for (const { p, score, per } of producten) {
      let beste = 0, besteKost = Infinity;
      vrij.forEach((x, i) => {
        const kost = score > 0
          ? per.reduce((s, { rol, v }) => s + (v / score) * tot(x, rol), 0) + x.d / 1e5
          : x.d;
        if (kost < besteKost) { besteKost = kost; beste = i; }
      });
      const [x] = vrij.splice(beste, 1);
      hexes.push({ q: x.h[0], r: x.h[1], type: 'product', rol: r, product: p, laag: p.laag, overlap: score });
    }
  }
  for (const t of gedeeldHex) hexes.push({ q: t.hex[0], r: t.hex[1], type: 'gedeeld', rol: t.eigenaar, topic: t });

  return { hexes, owner, topics, verwantschap: (a, b) => band.get(bk(a, b)) || 0 };
}
