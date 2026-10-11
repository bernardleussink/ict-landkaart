// Kleurhulpjes: tinten per activiteit en leesbare tekstkleur op elke achtergrond
const naarRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const naarHex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

export const meng = (a, b, t) => {
  const ca = naarRgb(a), cb = naarRgb(b);
  return naarHex(ca.map((v, i) => v + (cb[i] - v) * t));
};

const luminantie = (h) => {
  const [r, g, b] = naarRgb(h).map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const DONKER = '#1d1d1b';
// Kies wit of donker, afhankelijk van wat het meeste contrast geeft
export const tekstOp = (bg) => {
  const l = luminantie(bg);
  return 1.05 / (l + 0.05) >= (l + 0.05) / (luminantie(DONKER) + 0.05) ? '#ffffff' : DONKER;
};

// Activiteit 0 (Analyseren) t/m 4 (Manage & control): van licht naar donker
const STAPPEN = [['#ffffff', 0.82], ['#ffffff', 0.6], ['#ffffff', 0.35], ['#ffffff', 0.08], ['#000000', 0.3]];
export const activiteitTint = (kleur, i) => meng(kleur, STAPPEN[i][0], STAPPEN[i][1]);

// Rand bij hover/selectie: iets donkerder dan de rolkleur
export const randKleur = (kleur) => meng(kleur, '#000000', 0.35);
