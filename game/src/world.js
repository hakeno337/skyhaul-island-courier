// Skyhaul 3D — the island of Teluk Emas as data: a height field the terrain
// mesh and the flight model share, the two strips, the village, the
// lighthouse, forests and clouds. Everything is generated from one seed so
// every pilot flies the same island. The layout is the 2D game's own; what
// is new is that the ground now has real height everywhere, not just under
// the mountains.

import { WORLD, PALETTE, clamp, lerp } from './config.js';

// Small deterministic RNG (mulberry32) so the island never changes shape.
export function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Cheap value noise from sines; smooth enough for coastlines and woods.
export function noise2(x, z) {
  return (
    Math.sin(x * 1.7 + z * 0.6) * 0.45 +
    Math.sin(x * 0.53 - z * 1.31) * 0.35 +
    Math.sin((x + z) * 0.21) * 0.2
  );
}

// Deterministic 0..1 hash of a point, for per-vertex colour jitter.
function hash2(x, z) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export const MOUNTAINS = [
  { x: -980, z: -1020, h: 305, r: 450 },
  { x: -540, z: -1240, h: 235, r: 340 },
  { x: -1300, z: -640, h: 205, r: 310 },
];

// Normalised island distance: <1 is land, with a noisy rim.
export function islandField(x, z) {
  const dx = (x - WORLD.islandCx) / WORLD.islandRx;
  const dz = (z - WORLD.islandCz) / WORLD.islandRz;
  return Math.hypot(dx, dz) + noise2(x * 0.0011, z * 0.0011) * 0.13;
}

// The coastline as a closed loop of points where the island field crosses 1,
// found by walking a ray out from the island centre in every direction. One
// computation, cached: the radar draws from it.
let coastCache = null;
export function coastlinePoints(steps = 128) {
  if (coastCache) return coastCache;
  const pts = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    let lo = 0;
    let hi = 2600;
    for (let it = 0; it < 20; it++) {
      const mid = (lo + hi) / 2;
      if (islandField(WORLD.islandCx + dx * mid, WORLD.islandCz + dz * mid) < 1) lo = mid;
      else hi = mid;
    }
    pts.push({ x: WORLD.islandCx + dx * lo, z: WORLD.islandCz + dz * lo });
  }
  coastCache = pts;
  return pts;
}

export const RUNWAYS = [
  { name: 'Teluk Emas Field', cx: -260, cz: 780, heading: 0, length: 640, width: 36, kind: 'paved' },
  { name: 'Kampung Strip', cx: 830, cz: -430, heading: -0.42, length: 350, width: 21, kind: 'dirt' },
];

// Local runway coordinates of a world point: along the centreline and across it.
export function runwayLocal(rwy, x, z) {
  const dx = x - rwy.cx;
  const dz = z - rwy.cz;
  const s = Math.sin(rwy.heading);
  const c = Math.cos(rwy.heading);
  return { along: dx * s - dz * c, across: dx * c + dz * s };
}

export function onRunway(rwy, x, z) {
  const l = runwayLocal(rwy, x, z);
  return Math.abs(l.across) <= rwy.width / 2 && Math.abs(l.along) <= rwy.length / 2;
}

export const PLACES = {
  village: { x: 830, z: -520 },
  lighthouse: { x: 1505, z: -190 },
  tower: { x: -330, z: 210 },
  harbour: { x: 420, z: 1180 },
};

// --- The height field -------------------------------------------------------
// Raw landform: a low dome over the island ellipse, two octaves of rolling
// noise for hills, the three mountain cones of the 2D island on top, and a
// seabed that shelves away under the water.
function rawHeight(x, z) {
  const f = islandField(x, z);
  let h;
  if (f >= 1) {
    h = -5 - Math.min(24, (f - 1) * 55);
  } else {
    const t = 1 - f;
    h = 30 * Math.pow(t, 1.3);
    h += noise2(x * 0.0016 + 3.1, z * 0.0016 - 1.4) * 10 * Math.min(1, t * 1.7);
    h += noise2(x * 0.006 - 7.7, z * 0.006 + 2.2) * 2.4 * Math.min(1, t * 2.5);
  }
  for (const m of MOUNTAINS) {
    const d = Math.hypot(x - m.x, z - m.z);
    if (d < m.r) h = Math.max(h, m.h * Math.pow(1 - d / m.r, 1.35));
  }
  return h;
}

function smoothstep(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

// Runways and the village sit on pads graded flat into the landform; the
// pads' elevations are the raw height at their centres.
const RWY_ELEV = RUNWAYS.map((r) => rawHeight(r.cx, r.cz));
const VILLAGE_ELEV = rawHeight(PLACES.village.x, PLACES.village.z);
export const runwayElev = (i) => RWY_ELEV[i];

// The one true ground height: physics, terrain mesh and feature placement
// all read this, so they can never disagree about where the ground is.
export function groundHeightAt(x, z) {
  let h = rawHeight(x, z);
  RUNWAYS.forEach((r, i) => {
    const l = runwayLocal(r, x, z);
    const wA = 1 - smoothstep(r.width / 2 + 6, r.width / 2 + 95, Math.abs(l.across));
    const wL = 1 - smoothstep(r.length / 2 + 10, r.length / 2 + 130, Math.abs(l.along));
    const w = wA * wL;
    if (w > 0) h = lerp(h, RWY_ELEV[i], w);
  });
  const dv = Math.hypot(x - PLACES.village.x, z - PLACES.village.z);
  const wv = (1 - smoothstep(130, 250, dv)) * 0.9;
  if (wv > 0) h = lerp(h, VILLAGE_ELEV, wv);
  return h;
}

// The terrain's colour at a point, following the 2D island's tile rules:
// deep water, sand rim, grass and field patchwork, dark forest where the
// woods noise runs, rock and snow up high. h is groundHeightAt(x, z).
export function surfaceColor(x, z, h) {
  const f = islandField(x, z);
  const j = 0.93 + hash2(Math.round(x / 7), Math.round(z / 7)) * 0.12;
  if (f >= 1) return vary(h < -13 ? PALETTE.seaDeep : PALETTE.sea, j * 0.9);
  if (h > 200) return vary(PALETTE.snow, j);
  if (h > 55) return vary(PALETTE.rock, j);
  if (f > 0.945) return vary(PALETTE.sand, j);
  const roadD = Math.abs((z - 700) - (x + 260) * (-1220 / 1090));
  if (roadD < 26 && x > -300 && x < 860) return vary(PALETTE.road, j);
  const n = noise2(x * 0.004 + 9, z * 0.004 - 3);
  if (n > 0.34) return vary(hash2(x, z) > 0.5 ? PALETTE.forest : PALETTE.forestB, j);
  // Field patchwork: the 2D island's southern fields, plus scattered
  // clearings wherever the slow patch noise dips.
  const patch = noise2(x * 0.0013 + 21, z * 0.0013 - 13);
  if ((z > 260 && n < -0.05) || patch < -0.52) return vary(hash2(x + 40, z) > 0.5 ? PALETTE.fieldA : PALETTE.fieldB, j);
  return vary(patch > 0.12 ? PALETTE.grassA : PALETTE.grassB, j);
}

// Multiply a #rrggbb colour by a scalar shade, returned as #rrggbb.
export function vary(hex, mul) {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp(Math.round(((n >> 16) & 255) * mul), 0, 255);
  const g = clamp(Math.round(((n >> 8) & 255) * mul), 0, 255);
  const b = clamp(Math.round((n & 255) * mul), 0, 255);
  return `rgb(${r},${g},${b})`;
}

// --- The built world: features and clouds, placed by the 2D game's rules ---
export function buildWorld() {
  const rng = makeRng(20261126);
  const features = [];
  const clearOf = (x, z, pad) => RUNWAYS.every((r) => {
    const l = runwayLocal(r, x, z);
    return Math.abs(l.across) > r.width / 2 + pad || Math.abs(l.along) > r.length / 2 + pad;
  });

  // Forest trees wherever the woods noise runs or the grass is open.
  let planted = 0;
  let guard = 0;
  while (planted < 300 && guard++ < 20000) {
    const x = (rng() - 0.5) * 2 * WORLD.islandRx * 0.98;
    const z = WORLD.islandCz + (rng() - 0.5) * 2 * WORLD.islandRz * 0.98;
    if (islandField(x, z) > 0.97 || groundHeightAt(x, z) > 34) continue;
    if (!clearOf(x, z, 26)) continue;
    const n = noise2(x * 0.004 + 9, z * 0.004 - 3);
    if (n < 0.1 && rng() > 0.24) continue;
    features.push({ kind: 'tree', x, z, h: 13 + rng() * 10, r: 4.6, seed: rng() });
    planted++;
  }

  // The village of Kampung Aer: houses around a point east of its strip.
  for (let i = 0; i < 15; i++) {
    const a = rng() * Math.PI * 2;
    const d = 40 + rng() * 130;
    const x = PLACES.village.x + Math.cos(a) * d;
    const z = PLACES.village.z + Math.sin(a) * d * 0.7;
    if (!clearOf(x, z, 8)) continue;
    features.push({ kind: 'house', x, z, h: 8.5 + rng() * 4.5, r: 10, seed: rng() });
  }
  // Hangars and a field office at the main airfield.
  features.push({ kind: 'hangar', x: -390, z: 560, h: 13, r: 17, seed: 0.3 });
  features.push({ kind: 'hangar', x: -395, z: 640, h: 13, r: 17, seed: 0.7 });
  features.push({ kind: 'house', x: -120, z: 1010, h: 9, r: 10, seed: 0.5 });
  // Harbour huts on the south shore.
  for (let i = 0; i < 5; i++) {
    features.push({ kind: 'house', x: PLACES.harbour.x + i * 46 - 90, z: PLACES.harbour.z + (i % 2) * 30, h: 8, r: 10, seed: rng() });
  }
  features.push({ kind: 'lighthouse', x: PLACES.lighthouse.x, z: PLACES.lighthouse.z, h: 48, r: 9, seed: 0 });
  features.push({ kind: 'tower', x: PLACES.tower.x, z: PLACES.tower.z, h: 74, r: 6, seed: 0 });
  // Sea marks on the patrol route.
  features.push({ kind: 'buoy', x: 1750, z: 620, h: 7, r: 5, seed: 0.2 });
  features.push({ kind: 'buoy', x: -1750, z: -300, h: 7, r: 5, seed: 0.6 });
  features.push({ kind: 'buoy', x: 300, z: -1850, h: 7, r: 5, seed: 0.9 });

  const clouds = [];
  for (let i = 0; i < 44; i++) {
    clouds.push(makeCloud(rng, (rng() - 0.5) * 4800, 300 + rng() * 240, (rng() - 0.5) * 4800, 44 + rng() * 70, false));
  }
  // Two standing storm banks the patrol route threads between.
  for (let i = 0; i < 7; i++) {
    clouds.push(makeCloud(rng, 330 + (rng() - 0.5) * 420, 240 + rng() * 120, -330 + (rng() - 0.5) * 380, 90 + rng() * 60, true));
    clouds.push(makeCloud(rng, -560 + (rng() - 0.5) * 420, 250 + rng() * 120, -760 + (rng() - 0.5) * 380, 90 + rng() * 60, true));
  }

  // Vegetation pass — its own seeded stream, so the island laid out above
  // never moves: palms fringe the coast, broadleaf groves thicken inland and
  // ring the village, and bushes and boulders give the ground its texture.
  // Everything stays off the runways, the dirt road and the houses, and the
  // palms and broadleaf carry honest collision radii for low passes.
  const veg = makeRng(774411);
  const roadClear = (x, z) => Math.abs((z - 700) - (x + 260) * (-1220 / 1090)) > 58 || x < -310 || x > 870;
  const houseClear = (x, z) => features.every((f) => f.kind !== 'house' || Math.hypot(x - f.x, z - f.z) > 22);
  const vegClear = (x, z, pad) => clearOf(x, z, pad) && roadClear(x, z) && houseClear(x, z);
  const scatter = (want, tries, place) => {
    let n = 0;
    for (let i = 0; i < tries && n < want; i++) if (place()) n++;
  };

  // Palms lean over the sand all round the coast, in noise-clumped stands.
  scatter(175, 2600, () => {
    const x = (veg() - 0.5) * 2 * WORLD.islandRx * 1.02;
    const z = WORLD.islandCz + (veg() - 0.5) * 2 * WORLD.islandRz * 1.02;
    const f = islandField(x, z);
    if (f < 0.82 || f > 0.985 || groundHeightAt(x, z) > 9) return false;
    if (!vegClear(x, z, 24)) return false;
    if (noise2(x * 0.006 - 4, z * 0.006 + 7) < -0.25 && veg() > 0.3) return false;
    features.push({ kind: 'palm', x, z, h: 11 + veg() * 5.5, r: 2.6, seed: veg() });
    return true;
  });

  // Broadleaf: groves where the forest noise runs, plus a ring at the village.
  scatter(210, 3200, () => {
    const nearVillage = veg() < 0.34;
    const a = veg() * Math.PI * 2;
    const d = nearVillage ? 80 + veg() * 360 : 0;
    const x = nearVillage ? PLACES.village.x + Math.cos(a) * d : (veg() - 0.5) * 2 * WORLD.islandRx * 0.97;
    const z = nearVillage ? PLACES.village.z + Math.sin(a) * d * 0.8 : WORLD.islandCz + (veg() - 0.5) * 2 * WORLD.islandRz * 0.97;
    if (islandField(x, z) > 0.96 || groundHeightAt(x, z) > 34) return false;
    if (!vegClear(x, z, 30)) return false;
    const n = noise2(x * 0.004 + 9, z * 0.004 - 3);
    if (!nearVillage && n < 0.05 && veg() > 0.3) return false;
    features.push({ kind: 'tree', x, z, h: 12 + veg() * 7.5, r: 4.4, seed: veg() });
    return true;
  });

  // Bushes on the lowland and boulders on the slopes: low ground texture.
  scatter(150, 1500, () => {
    const x = (veg() - 0.5) * 2 * WORLD.islandRx * 0.99;
    const z = WORLD.islandCz + (veg() - 0.5) * 2 * WORLD.islandRz * 0.99;
    if (islandField(x, z) > 0.99 || groundHeightAt(x, z) > 30) return false;
    if (!vegClear(x, z, 14)) return false;
    features.push({ kind: 'bush', x, z, h: 1.7 + veg() * 1.3, r: 1.1, seed: veg() });
    return true;
  });
  scatter(46, 900, () => {
    const x = (veg() - 0.5) * 2 * WORLD.islandRx * 0.99;
    const z = WORLD.islandCz + (veg() - 0.5) * 2 * WORLD.islandRz * 0.99;
    const gh = groundHeightAt(x, z);
    if (islandField(x, z) > 0.99 || gh < 6 || gh > 140) return false;
    if (!vegClear(x, z, 14)) return false;
    const h = 2 + veg() * 3.4;
    features.push({ kind: 'rocklet', x, z, h, r: h * 0.55, seed: veg() });
    return true;
  });

  // Final sweep: nothing grows in the road, whoever planted it there.
  const onRoad = (x, z) => Math.abs((z - 700) - (x + 260) * (-1220 / 1090)) < 58 && x > -310 && x < 870;
  for (let i = features.length - 1; i >= 0; i--) {
    const f = features[i];
    if ((f.kind === 'tree' || f.kind === 'palm' || f.kind === 'bush' || f.kind === 'rocklet') && onRoad(f.x, f.z)) features.splice(i, 1);
  }

  return { features, clouds, runways: RUNWAYS };
}

function makeCloud(rng, x, y, z, s, storm) {
  const puffs = [];
  const n = 5 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i++) {
    puffs.push({ dx: (rng() - 0.5) * s * 1.5, dy: (rng() - 0.5) * s * 0.32, dz: (rng() - 0.5) * s * 0.9, r: s * (0.34 + rng() * 0.3) });
  }
  return { x, y, z, s, storm, puffs };
}

// First solid thing at this column, if the aircraft is inside it. Feature
// heights are relative to their own ground, so the top is ground + h.
export function featureHit(world, x, z, y) {
  if (y > 140) return null;
  for (const f of world.features) {
    const dx = x - f.x;
    const dz = z - f.z;
    if (dx * dx + dz * dz < f.r * f.r) {
      const top = f.h + groundHeightAt(f.x, f.z);
      if (y < top) return { ...f, h: top };
    }
  }
  return null;
}
