// Skyhaul — Island Courier: shared tuning constants and the house palette.
// Every module reads its numbers from here so the game can be balanced in one place.

export const VIEW = {
  width: 1280,
  height: 800,
  fovDeg: 63,          // vertical field of view of the chase camera
  camBack: 27,         // metres behind the aircraft
  camUp: 10.5,         // metres above the aircraft
  viewDistance: 2100,  // metres; ground and features fade out before this
};

export const WORLD = {
  size: 5200,          // the sea is a square this many metres across
  tile: 130,           // ground tile edge, metres
  islandCx: 0,
  islandCz: -80,
  islandRx: 1560,      // island ellipse radii, metres
  islandRz: 1380,
};

export const PHYS = {
  minThrottle: 0,
  maxThrottle: 1,
  idleDrain: 0.16,     // fuel units per second at idle
  fullDrain: 1.05,     // fuel units per second at full throttle
  fuelCapacity: 100,
  hullMax: 100,
  accelFull: 13.5,     // m/s gained per second at full throttle, before drag
  dragQuad: 0.00135,   // quadratic drag coefficient
  dragBase: 0.55,      // m/s lost per second of plain drag
  stallSpeed: 26,      // m/s; below this the wing stops holding the nose up
  rotateSpeed: 33,     // m/s; at this speed a pitched-up plane leaves the ground
  neverExceed: 97,     // m/s; past this the airframe takes stress damage
  maxBankDeg: 58,
  maxPitchDeg: 34,
  turnGain: 1.85,      // arcade multiplier on the coordinated-turn rate
  climbSink: 0.92,     // share of pitch that becomes vertical speed
  gravitySink: 3.1,    // m/s of sink the plane always fights
  stallSink: 15,       // extra m/s of sink at a full stall
  hardLandingSink: 3.4,  // m/s of sink a landing gear shrug off
  crashSink: 6.5,      // m/s of sink that wrecks the aircraft
  groundRoll: 0.35,    // throttle response smoothing on the ground
};

export const SCORE = {
  ring: 250,
  checkpoint: 400,
  deliveryBase: 600,
  softLandingBonus: 300,
  perSecondLeft: 6,
  perFuelLeft: 9,
  perHullLeft: 4,
};

// Golden-hour tropical palette; sky, sea and land all live in this family.
export const PALETTE = {
  skyTop: '#2f6cb3',
  skyMid: '#7fb0dd',
  skyHorizon: '#ffd9a3',
  sunCore: '#fff3c4',
  sunGlow: 'rgba(255, 190, 92, 0.35)',
  fog: '#cfdde8',
  sea: '#1e6d8c',
  seaDeep: '#175a76',
  sand: '#ecd9a0',
  grassA: '#63ad4b',
  grassB: '#54963f',
  fieldA: '#c9b96a',
  fieldB: '#b3a355',
  forest: '#2e7a3c',
  rock: '#8d8175',
  snow: '#f2f6f6',
  road: '#6e6257',
  runway: '#3a3f45',
  runwayLine: '#f5f2e6',
  dirtStrip: '#b99a67',
  cloudLit: '#ffffff',
  cloudShade: '#b9c9d9',
  stormLit: '#5d6b7a',
  stormShade: '#39434f',
  planeBody: '#f4f1e8',
  planeStripe: '#ff7a1a',
  planeTeal: '#0f7d8c',
  hudInk: 'rgba(8, 18, 28, 0.72)',
  hudEdge: 'rgba(160, 220, 255, 0.55)',
  hudText: '#eaf6ff',
  hudAmber: '#ffb648',
  hudGreen: '#7dff9a',
  hudRed: '#ff5f4d',
};

export const DEG = Math.PI / 180;
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
// Shortest signed angular difference, radians.
export const angDiff = (a, b) => {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};
