// Hex-grid wiskunde (pointy-top, axiale coördinaten). Zie redblobgames.com/grids/hexagons
export const R = 40;
const SQRT3 = Math.sqrt(3);

export const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

export const key = (q, r) => `${q},${r}`;

export const neighbors = (q, r) => DIRS.map(([dq, dr]) => [q + dq, r + dr]);

export const hexDist = (a, b) =>
  (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[0] + a[1] - b[0] - b[1])) / 2;

// Rand i van corners() (hoek i → hoek i+1) grenst aan de buur in deze richting
export const EDGE_DIR = [0, 5, 4, 3, 2, 1];

export function edge(x, y, i, size = R) {
  const p = (j) => {
    const a = (Math.PI / 180) * (60 * (j % 6) - 30);
    return [x + size * Math.cos(a), y + size * Math.sin(a)];
  };
  const [x1, y1] = p(i);
  const [x2, y2] = p(i + 1);
  return `M${x1.toFixed(1)},${y1.toFixed(1)}L${x2.toFixed(1)},${y2.toFixed(1)}`;
}

export function toPixel(q, r) {
  return { x: R * SQRT3 * (q + r / 2), y: R * 1.5 * r };
}

export function corners(x, y, size = R) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 30);
    pts.push(`${(x + size * Math.cos(a)).toFixed(1)},${(y + size * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(' ');
}

// Ring van hexen op afstand `radius` rond (q, r)
export function ring(q, r, radius) {
  const out = [];
  let cq = q + DIRS[4][0] * radius;
  let cr = r + DIRS[4][1] * radius;
  for (let side = 0; side < 6; side++) {
    for (let step = 0; step < radius; step++) {
      out.push([cq, cr]);
      cq += DIRS[side][0];
      cr += DIRS[side][1];
    }
  }
  return out;
}

// Geeft `n` vrije plekken rond het middelpunt, ring voor ring
export function spiral(q, r, n, occupied) {
  const out = [];
  for (let radius = 1; out.length < n && radius < 12; radius++) {
    for (const [hq, hr] of ring(q, r, radius)) {
      if (out.length >= n) break;
      if (!occupied.has(key(hq, hr))) out.push([hq, hr]);
    }
  }
  return out;
}
