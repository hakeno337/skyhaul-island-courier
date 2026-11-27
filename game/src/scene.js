// Skyhaul 3D — the Three.js scene: terrain, sea, sky, the Kestrel, the
// island's dressing, and the chase camera. Everything visual lives here;
// the flight model, missions and HUD stay exactly as the 2D game had them,
// this module only reads their state and draws it in three dimensions.

import { VIEW, WORLD, PALETTE, CAMPAIGN, clamp, lerp } from './config.js';
import { groundHeightAt, surfaceColor, islandField, RUNWAYS, PLACES, runwayElev, makeRng } from './world.js';
import { MISSIONS } from './missions.js';

const THREE = window.THREE;

// The sun: low in the east-north-east, warm — a dusk sun, near enough the
// horizon that the sea throws a long glint path back at it. Light, sky
// shader and the sun disc all read this one direction so they can never
// disagree.
const SUN_DIR = new THREE.Vector3(0.62, 0.19, -0.52).normalize();

function hexColor(hex) { return new THREE.Color(hex); }

export function createScene3D(canvas, world) {
  // The pinned r149 build defaults to legacy colour mode, which treats
  // authored sRGB colours as linear and washes the whole scene out to
  // pastel on output. Turn the real colour management on before any
  // colour is constructed below.
  if (THREE.ColorManagement) {
    THREE.ColorManagement.enabled = true;
    if ('legacyMode' in THREE.ColorManagement) THREE.ColorManagement.legacyMode = false;
  }
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(VIEW.width, VIEW.height, false);
  renderer.setPixelRatio(1);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.07;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(hexColor(PALETTE.fog), 1000, 5000);

  const camera = new THREE.PerspectiveCamera(VIEW.fovDeg, VIEW.width / VIEW.height, 0.5, 16000);
  camera.position.set(0, 300, 1600);

  buildLights(scene);
  buildSky(scene);
  buildTerrain(scene);
  buildWater(scene);
  for (const rwy of RUNWAYS) buildRunway(scene, rwy);
  buildVegetation(scene, world);
  buildVillage(scene, world);
  buildLandmarks(scene, world);
  const clouds = buildClouds(scene, world);
  buildExtraClouds(scene);
  buildHarbourCraft(scene);
  const birds = buildBirds(scene);
  const front = buildFrontWall(scene);
  const plane = buildPlane(scene);
  const rings = buildRings(scene);
  const beacon = buildBeacon(scene);
  const rescue = buildRescue(scene);
  const buoyMesh = buildBuoyMesh(scene);
  const shadowBlob = buildBlobShadow(scene);

  const cam = { init: false };

  function render(state, dt, snap) {
    syncFront(front, scene, state);
    syncBirds(birds, state.time);
    syncPlane(plane, state.plane);
    syncRings(rings, state);
    syncBeacon(beacon, state);
    syncRescue(rescue, state);
    syncBuoy(buoyMesh, state);
    syncShadow(shadowBlob, state.plane);
    updateCamera(camera, cam, state, dt, snap);
    renderer.render(scene, camera);
  }

  return { render, renderer, scene, camera };
}

// --- Lights and sky ----------------------------------------------------------

function buildLights(scene) {
  // Dusk balance: a strong warm key sun against a cooler, dimmer sky fill,
  // so slopes facing the sun glow amber and the shadow sides fall off to
  // blue — contrast the daytime build never had. Total stays near 1.0: the
  // palette was authored as final display colours, so anything much
  // stronger blows them out to pastel.
  const sun = new THREE.DirectionalLight(0xffa050, 1.18);
  sun.position.copy(SUN_DIR).multiplyScalar(4200);
  scene.add(sun);
  const hemi = new THREE.HemisphereLight(0x8fa8cc, 0x5f4c33, 0.30);
  scene.add(hemi);
  const fill = new THREE.DirectionalLight(0x87a6cc, 0.09);
  fill.position.set(-1800, 1200, 2200);
  scene.add(fill);
}

function buildSky(scene) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      sunDir: { value: SUN_DIR },
      top: { value: hexColor(PALETTE.skyTop) },
      mid: { value: hexColor(PALETTE.skyMid) },
      hor: { value: hexColor(PALETTE.skyHorizon) },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying vec3 vDir;
      uniform vec3 sunDir, top, mid, hor;
      void main() {
        vec3 d = normalize(vDir);
        float h = clamp(d.y, -0.08, 1.0);
        vec3 col = mix(hor, mid, smoothstep(0.0, 0.15, h));
        col = mix(col, top, smoothstep(0.13, 0.6, h));
        float s = max(dot(d, normalize(sunDir)), 0.0);
        col += vec3(1.0, 0.60, 0.28) * pow(s, 9.0) * 0.52;
        col += vec3(1.0, 0.48, 0.20) * pow(s, 3.0) * (1.0 - smoothstep(0.0, 0.38, h)) * 0.20;
        col += vec3(1.0, 0.9, 0.66) * smoothstep(0.99925, 0.99965, s) * 1.25;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <encodings_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(8800, 28, 14), mat);
  scene.add(sky);

  // A soft glow sprite around the sun disc.
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const g = cv.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 2, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255, 240, 200, 0.95)');
  grad.addColorStop(0.25, 'rgba(255, 196, 110, 0.50)');
  grad.addColorStop(1, 'rgba(255, 160, 70, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(cv);
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
  spr.position.copy(SUN_DIR).multiplyScalar(8200);
  spr.scale.set(3400, 3400, 1);
  scene.add(spr);
}

// --- Ground and sea ----------------------------------------------------------

function buildTerrain(scene) {
  const SEG = 160;
  const geo = new THREE.PlaneGeometry(WORLD.size, WORLD.size, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = groundHeightAt(x, z);
    pos.setY(i, h);
    c.set(surfaceColor(x, z, h));
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const mesh = new THREE.Mesh(geo, mat);
  scene.add(mesh);
}

function buildWater(scene) {
  const geo = new THREE.PlaneGeometry(15000, 15000);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshPhongMaterial({
    color: hexColor(PALETTE.sea),
    specular: 0xffc37a,
    shininess: 300,
    transparent: true,
    opacity: 0.95,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 0;
  scene.add(mesh);
}

function runwayTexture(rwy) {
  const cv = document.createElement('canvas');
  cv.width = 128;
  cv.height = 512;
  const g = cv.getContext('2d');
  if (rwy.kind === 'paved') {
    g.fillStyle = PALETTE.runway;
    g.fillRect(0, 0, 128, 512);
    // Speckle.
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`;
      g.fillRect(Math.random() * 128, Math.random() * 512, 2, 2);
    }
    g.fillStyle = PALETTE.runwayLine;
    g.fillRect(4, 0, 3, 512);
    g.fillRect(121, 0, 3, 512);
    // Threshold piano keys, both ends.
    for (const y0 of [10, 462]) {
      for (let k = 0; k < 6; k++) g.fillRect(14 + k * 17, y0, 9, 40);
    }
    // Centreline dashes.
    for (let y = 70; y < 450; y += 56) g.fillRect(61, y, 6, 32);
  } else {
    g.fillStyle = PALETTE.dirtStrip;
    g.fillRect(0, 0, 128, 512);
    for (let i = 0; i < 1200; i++) {
      g.fillStyle = `rgba(90,64,32,${Math.random() * 0.16})`;
      g.fillRect(Math.random() * 128, Math.random() * 512, 3, 3);
    }
    g.fillStyle = 'rgba(80, 58, 30, 0.5)';
    g.fillRect(34, 0, 13, 512);
    g.fillRect(81, 0, 13, 512);
    g.fillStyle = 'rgba(245, 242, 230, 0.85)';
    for (const y0 of [8, 488]) for (let k = 0; k < 4; k++) g.fillRect(16 + k * 26, y0, 14, 16);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.encoding = THREE.sRGBEncoding;
  tex.anisotropy = 4;
  return tex;
}

function buildRunway(scene, rwy) {
  const idx = RUNWAYS.indexOf(rwy);
  const geo = new THREE.PlaneGeometry(rwy.width, rwy.length);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshLambertMaterial({ map: runwayTexture(rwy) });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(rwy.cx, runwayElev(idx) + 0.3, rwy.cz);
  mesh.rotation.y = -rwy.heading;
  scene.add(mesh);
}

// --- Vegetation (instanced) --------------------------------------------------

const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _sv = new THREE.Vector3();

function setInstance(mesh, i, x, y, z, sx, sy, sz, rotY, tiltX, tiltZ, color) {
  _e.set(tiltX || 0, rotY || 0, tiltZ || 0);
  _q.setFromEuler(_e);
  _v.set(x, y, z);
  _sv.set(sx, sy, sz);
  _m4.compose(_v, _q, _sv);
  mesh.setMatrixAt(i, _m4);
  if (color) mesh.setColorAt(i, color);
}

function buildVegetation(scene, world) {
  const trees = world.features.filter((f) => f.kind === 'tree');
  const palms = world.features.filter((f) => f.kind === 'palm');
  const bushes = world.features.filter((f) => f.kind === 'bush');
  const rocks = world.features.filter((f) => f.kind === 'rocklet');

  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5a3c, flatShading: true });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });

  // Broadleaf trunks + canopies.
  const trunkGeo = new THREE.CylinderGeometry(0.17, 0.32, 1, 5);
  trunkGeo.translate(0, 0.5, 0);
  const canopyGeo = new THREE.IcosahedronGeometry(1, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, trees.length);
  const canopies = new THREE.InstancedMesh(canopyGeo, leafMat, trees.length);
  const cA = hexColor(PALETTE.forest);
  const cB = hexColor(PALETTE.forestB);
  const cC = new THREE.Color(0x57a047);
  trees.forEach((t, i) => {
    const g = groundHeightAt(t.x, t.z);
    const trunkH = t.h * 0.4;
    const cr = t.h * 0.36;
    setInstance(trunks, i, t.x, g - 0.3, t.z, 0.9 + t.seed, trunkH + 0.3, 0.9 + t.seed, t.seed * 6.28, 0, 0, null);
    const col = t.seed < 0.4 ? cA : t.seed < 0.75 ? cB : cC;
    setInstance(canopies, i, t.x, g + trunkH + cr * 0.52, t.z, cr, cr * 0.84, cr, t.seed * 6.28, 0, 0, col);
  });
  scene.add(trunks, canopies);

  // Conifers: dark pines — a short trunk and two stacked cones, so the
  // high woods silhouette differently from the broadleaf canopy balls.
  const conifers = world.features.filter((f) => f.kind === 'conifer');
  const coneGeo = new THREE.ConeGeometry(1, 1, 7);
  coneGeo.translate(0, 0.5, 0);
  const conTrunks = new THREE.InstancedMesh(trunkGeo, trunkMat, conifers.length);
  const conLow = new THREE.InstancedMesh(coneGeo, leafMat, conifers.length);
  const conHigh = new THREE.InstancedMesh(coneGeo, leafMat, conifers.length);
  const pineA = new THREE.Color(0x1d4a26);
  const pineB = new THREE.Color(0x265730);
  conifers.forEach((t, i) => {
    const g = groundHeightAt(t.x, t.z);
    const trunkH = t.h * 0.3;
    const cr = t.h * 0.3;
    const col = t.seed < 0.5 ? pineA : pineB;
    setInstance(conTrunks, i, t.x, g - 0.3, t.z, 0.8, trunkH + 0.3, 0.8, t.seed * 6.28, 0, 0, null);
    setInstance(conLow, i, t.x, g + trunkH - 0.4, t.z, cr, t.h * 0.62, cr, t.seed * 6.28, 0, 0, col);
    setInstance(conHigh, i, t.x, g + trunkH + t.h * 0.3, t.z, cr * 0.6, t.h * 0.48, cr * 0.6, t.seed * 6.28, 0, 0, col);
  });
  scene.add(conTrunks, conLow, conHigh);

  // Palms: leaning trunks and skirt crowns along the coast.
  const palmTrunks = new THREE.InstancedMesh(trunkGeo, trunkMat, palms.length);
  const palmCrowns = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 0.55, 8), leafMat, palms.length);
  const palmCol = new THREE.Color(0x74a83e);
  const palmCol2 = new THREE.Color(0x8fae3c);
  palms.forEach((t, i) => {
    const g = groundHeightAt(t.x, t.z);
    const trunkH = t.h * 0.8;
    const tilt = 0.1 + t.seed * 0.12;
    const dirA = t.seed * 6.283;
    const tx = Math.sin(dirA) * tilt;
    const tz = Math.cos(dirA) * tilt;
    setInstance(palmTrunks, i, t.x, g - 0.3, t.z, 0.75, trunkH + 0.3, 0.75, dirA, tx, tz, null);
    // Crown sits at the top of the leaning trunk.
    const topX = t.x + Math.sin(tz) * trunkH * 0.9;
    const topZ = t.z + Math.sin(tx) * trunkH * 0.9;
    const cr = t.h * 0.3;
    setInstance(palmCrowns, i, topX, g + trunkH + cr * 0.2, topZ, cr, cr * 0.9, cr, dirA, 0, 0, t.seed < 0.5 ? palmCol : palmCol2);
  });
  scene.add(palmTrunks, palmCrowns);

  // Bushes and boulders for ground texture.
  const bushMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), leafMat, bushes.length);
  bushes.forEach((b, i) => {
    const g = groundHeightAt(b.x, b.z);
    setInstance(bushMesh, i, b.x, g + b.h * 0.36, b.z, 1.5 + b.seed * 1.7, b.h * 0.62, 1.5 + b.seed * 1.7, b.seed * 6.28, 0, 0, b.seed < 0.5 ? cA : cB);
  });
  scene.add(bushMesh);

  const rockMesh = new THREE.InstancedMesh(
    new THREE.DodecahedronGeometry(1, 0),
    new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }),
    rocks.length
  );
  const rockCol = hexColor(PALETTE.rock);
  rocks.forEach((r, i) => {
    const g = groundHeightAt(r.x, r.z);
    setInstance(rockMesh, i, r.x, g + r.h * 0.3, r.z, r.r, r.h * 0.75, r.r, r.seed * 6.28, 0.3, 0.2, rockCol);
  });
  scene.add(rockMesh);
}

// --- Buildings and landmarks -------------------------------------------------

function buildVillage(scene, world) {
  const bodyGeo = new THREE.BoxGeometry(1, 1, 1);
  bodyGeo.translate(0, 0.5, 0);
  const roofGeo = new THREE.ConeGeometry(0.74, 1, 4);
  roofGeo.translate(0, 0.5, 0);
  const bodyMats = [0xf2ead8, 0xe8d9b8, 0xdfe8ea, 0xf0dcc8].map((c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true }));
  const roofMats = [0xb5502f, 0x8a4a38, 0x74584a].map((c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true }));
  const houses = world.features.filter((f) => f.kind === 'house');
  for (const hse of houses) {
    const g = groundHeightAt(hse.x, hse.z);
    const grp = new THREE.Group();
    const w = 8 + hse.seed * 4;
    const d = 7 + hse.seed * 3;
    const bodyH = hse.h * 0.58;
    const body = new THREE.Mesh(bodyGeo, bodyMats[Math.floor(hse.seed * 4) % 4]);
    body.scale.set(w, bodyH, d);
    grp.add(body);
    const roof = new THREE.Mesh(roofGeo, roofMats[Math.floor(hse.seed * 3) % 3]);
    roof.scale.set(w * 1.25, hse.h * 0.5, d * 1.25);
    roof.position.y = bodyH - 0.2;
    roof.rotation.y = Math.PI / 4;
    grp.add(roof);
    grp.position.set(hse.x, g - 0.2, hse.z);
    grp.rotation.y = hse.seed * 6.28;
    scene.add(grp);
  }
  // Hangars at the main field: long boxes with a paler lid.
  const hangMat = new THREE.MeshLambertMaterial({ color: 0x9aa7ad, flatShading: true });
  const hangRoofMat = new THREE.MeshLambertMaterial({ color: 0x707d84, flatShading: true });
  for (const hg of world.features.filter((f) => f.kind === 'hangar')) {
    const g = groundHeightAt(hg.x, hg.z);
    const grp = new THREE.Group();
    const body = new THREE.Mesh(bodyGeo, hangMat);
    body.scale.set(30, 9, 20);
    grp.add(body);
    const lid = new THREE.Mesh(bodyGeo, hangRoofMat);
    lid.scale.set(32, 1.6, 22);
    lid.position.y = 9;
    grp.add(lid);
    grp.position.set(hg.x, g - 0.2, hg.z);
    scene.add(grp);
  }
}

function buildLandmarks(scene, world) {
  // Lighthouse: white shaft, two red bands, a lit lamp.
  {
    const f = world.features.find((x) => x.kind === 'lighthouse');
    const g = groundHeightAt(f.x, f.z);
    const grp = new THREE.Group();
    const white = new THREE.MeshLambertMaterial({ color: 0xf5f2ea, flatShading: true });
    const red = new THREE.MeshLambertMaterial({ color: 0xc23b2a, flatShading: true });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.6, 32, 10), white);
    shaft.position.y = 16;
    grp.add(shaft);
    for (const y of [9, 20]) {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(3.05, 3.2, 4.4, 10), red);
      band.position.y = y;
      grp.add(band);
    }
    const gallery = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 2.4, 8), new THREE.MeshLambertMaterial({ color: 0x2c343c }));
    gallery.position.y = 33;
    grp.add(gallery);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(1.5, 10, 8), new THREE.MeshLambertMaterial({ color: 0xffe9a8, emissive: 0xffc95e, emissiveIntensity: 1.6 }));
    lamp.position.y = 35.6;
    grp.add(lamp);
    grp.position.set(f.x, g - 0.2, f.z);
    scene.add(grp);
  }
  // The tower: a mast with a lit cab, inland from the field.
  {
    const f = world.features.find((x) => x.kind === 'tower');
    const g = groundHeightAt(f.x, f.z);
    const grp = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(4.6, 62, 4.6), new THREE.MeshLambertMaterial({ color: 0xb9c0c4, flatShading: true }));
    shaft.position.y = 31;
    grp.add(shaft);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(10, 6, 10), new THREE.MeshLambertMaterial({ color: 0x33424e, emissive: 0xffca7a, emissiveIntensity: 0.35 }));
    cab.position.y = 65;
    grp.add(cab);
    grp.position.set(f.x, g - 0.2, f.z);
    scene.add(grp);
  }
  // Sea-mark buoys.
  const buoyMat = new THREE.MeshLambertMaterial({ color: 0xe8641e, flatShading: true });
  for (const b of world.features.filter((x) => x.kind === 'buoy')) {
    const grp = new THREE.Group();
    const cone = new THREE.Mesh(new THREE.ConeGeometry(1.9, 4.6, 7), buoyMat);
    cone.position.y = 2;
    grp.add(cone);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6), new THREE.MeshLambertMaterial({ color: 0xffd9a0, emissive: 0xff9d3c, emissiveIntensity: 1.2 }));
    tip.position.y = 4.8;
    grp.add(tip);
    grp.position.set(b.x, 0, b.z);
    scene.add(grp);
  }
}

// --- Clouds (one instanced mesh for every puff) ------------------------------

function buildClouds(scene, world) {
  let total = 0;
  for (const c of world.clouds) total += c.puffs.length;
  const geo = new THREE.IcosahedronGeometry(1, 0);
  // Flat-shaded by instance colour alone: lit cloud tops and storm banks
  // read as stylised low-poly either way, and nothing can go muddy-dark
  // the way a lit material does when a puff turns its back to the sun.
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const mesh = new THREE.InstancedMesh(geo, mat, total);
  const lit = new THREE.Color(0xffe3c0);
  const shade = new THREE.Color(0xdcbd9c);
  const stormA = new THREE.Color(0x6b7482);
  const stormB = new THREE.Color(0x4c5563);
  let i = 0;
  for (const c of world.clouds) {
    for (const p of c.puffs) {
      const col = c.storm ? (p.r % 1 > 0.5 ? stormA : stormB) : (p.r % 1 > 0.5 ? lit : shade);
      setInstance(mesh, i++, c.x + p.dx, c.y + p.dy, c.z + p.dz, p.r * 1.75, p.r * 0.58, p.r * 1.15, p.dx, 0, 0, col);
    }
  }
  scene.add(mesh);
  return mesh;
}

// --- Dusk dressing: high clouds, harbour craft, birds -------------------------
// Purely presentational scatter, built here rather than in world.js so the
// shared island data — and everything the flight model reads from it —
// stays exactly as it was. None of this collides, scores or steers.

function buildExtraClouds(scene) {
  // A second, higher deck of fair-weather cloud the standing world never
  // had, catching the last of the sun in warm tones.
  const rng = makeRng(90210);
  const clusters = [];
  let total = 0;
  for (let i = 0; i < 6; i++) {
    const c = {
      x: (rng() - 0.5) * 5200,
      y: 400 + rng() * 200,
      z: (rng() - 0.5) * 5200,
      puffs: [],
    };
    const n = 4 + Math.floor(rng() * 3);
    for (let k = 0; k < n; k++) {
      c.puffs.push({ dx: (rng() - 0.5) * 260, dy: (rng() - 0.5) * 40, dz: (rng() - 0.5) * 150, r: 55 + rng() * 60 });
    }
    total += n;
    clusters.push(c);
  }
  const geo = new THREE.IcosahedronGeometry(1, 0);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const mesh = new THREE.InstancedMesh(geo, mat, total);
  const lit = new THREE.Color(0xffdfba);
  const shade = new THREE.Color(0xd9b894);
  let i = 0;
  for (const c of clusters) {
    for (const p of c.puffs) {
      setInstance(mesh, i++, c.x + p.dx, c.y + p.dy, c.z + p.dz, p.r * 1.8, p.r * 0.55, p.r * 1.15, p.dx, 0, 0, rng() > 0.5 ? lit : shade);
    }
  }
  scene.add(mesh);
}

function buildHarbourCraft(scene) {
  // Fishing boats riding at anchor off the harbour, and the lateral marks
  // of the channel running south out to sea.
  const hullCols = [0x9a4436, 0x2e5f6e, 0xc7b299, 0x74584a];
  const spots = [
    { x: 330, z: 1400, rot: 0.4 },
    { x: 545, z: 1425, rot: -0.7 },
    { x: 620, z: 1345, rot: 1.9 },
    { x: 240, z: 1470, rot: 2.6 },
  ];
  spots.forEach((s, i) => {
    const grp = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(11, 2.2, 4.4), new THREE.MeshLambertMaterial({ color: hullCols[i % hullCols.length], flatShading: true }));
    hull.position.y = 0.7;
    grp.add(hull);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.1, 2.9), new THREE.MeshLambertMaterial({ color: 0xf2ead8, flatShading: true }));
    cabin.position.set(-2.2, 2.8, 0);
    grp.add(cabin);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 6.2, 6), new THREE.MeshLambertMaterial({ color: 0x6e5136 }));
    mast.position.set(2.4, 4.6, 0);
    grp.add(mast);
    grp.position.set(s.x, 0, s.z);
    grp.rotation.y = s.rot;
    scene.add(grp);
  });
  const marks = [
    { x: 400, z: 1520, col: 0xd8402a },
    { x: 455, z: 1660, col: 0x2a9d4f },
    { x: 405, z: 1800, col: 0xd8402a },
    { x: 460, z: 1940, col: 0x2a9d4f },
  ];
  for (const b of marks) {
    const grp = new THREE.Group();
    const cone = new THREE.Mesh(new THREE.ConeGeometry(1.3, 3.4, 7), new THREE.MeshLambertMaterial({ color: b.col, flatShading: true }));
    cone.position.y = 1.4;
    grp.add(cone);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 6), new THREE.MeshLambertMaterial({ color: 0xffd9a0, emissive: 0xff9d3c, emissiveIntensity: 1.2 }));
    tip.position.y = 3.6;
    grp.add(tip);
    grp.position.set(b.x, 0, b.z);
    scene.add(grp);
  }
}

function buildBirds(scene) {
  // A loose flock of shorebirds wheeling over the bay — two-plane wings on
  // a shared circle, posed from the clock alone so a frozen frame still
  // catches them mid-wheel.
  const mat = new THREE.MeshBasicMaterial({ color: 0x232a30 });
  const flock = { center: { x: -150, y: 185, z: -420 }, birds: [] };
  const grp = new THREE.Group();
  for (let i = 0; i < 8; i++) {
    const bird = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 1.15), mat);
    bird.add(body);
    const mkWing = (s) => {
      const geo = new THREE.BoxGeometry(1.25, 0.05, 0.34);
      geo.translate(s * 0.62, 0, 0);
      const wing = new THREE.Mesh(geo, mat);
      bird.add(wing);
      return wing;
    };
    flock.birds.push({ grp: bird, wl: mkWing(-1), wr: mkWing(1), r: 95 + (i % 4) * 22, ph: i * 0.55, bob: i * 1.7 });
    grp.add(bird);
  }
  scene.add(grp);
  return flock;
}

function syncBirds(flock, t) {
  for (const b of flock.birds) {
    const a = t * 0.045 + b.ph;
    b.grp.position.set(
      flock.center.x + Math.cos(a) * b.r,
      flock.center.y + Math.sin(t * 0.3 + b.bob) * 7,
      flock.center.z + Math.sin(a) * b.r
    );
    b.grp.rotation.y = Math.PI + a;
    const flap = Math.sin(t * 7 + b.bob * 2.1) * 0.55;
    b.wl.rotation.z = flap;
    b.wr.rotation.z = -flap;
  }
}

// --- The storm front (medevac) -------------------------------------------------
// A wall of dark cloud rolling in from the west-south-west. It is scenery
// with a deadline: its distance from the island is the front's ETA made
// visible, and as it closes the fog comes with it.

const FRONT_DIR = { x: -0.872, z: 0.49 }; // unit vector, island → front (WSW)
const FOG_BASE = hexColor(PALETTE.fog);
const FOG_GREY = new THREE.Color(0x87909c);
const _fogCol = new THREE.Color();

function buildFrontWall(scene) {
  const grp = new THREE.Group();
  // Detail-1 icosahedrons: enough faces that a puff's silhouette rounds off
  // like a cloud mass. The old detail-0 puffs were up to 1,300 m across, so
  // each one read as a single angled plate of sheet metal.
  const geo = new THREE.IcosahedronGeometry(1, 1);
  // Fog exempt: the front is the deadline made visible — it must stay dark
  // and readable at two kilometres, where the golden fog would wash it out.
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
  const rng = makeRng(4451);
  // Dark blue-greys, the near layer darkest; nothing as pale as the old
  // slab grey, so the bank reads as weather, not scenery cardboard.
  const nearCols = [0x29313f, 0x313947, 0x38424e].map((c) => new THREE.Color(c));
  const farCols = [0x414856, 0x474f5e, 0x3b434f].map((c) => new THREE.Color(c));
  // A bank, not a wall: loose rows of modest puffs in two depth layers,
  // the mass kept low so the front sits on the horizon instead of filling
  // the sky. Local +X runs along the front, local +Z is its depth.
  const rows = [
    { n: 40, y0: 55, y1: 150, r0: 80, r1: 165, z0: 140, z1: 330, cols: farCols },
    { n: 18, y0: 150, y1: 235, r0: 60, r1: 120, z0: 150, z1: 300, cols: farCols },
    { n: 42, y0: 45, y1: 135, r0: 65, r1: 140, z0: -190, z1: 30, cols: nearCols },
    { n: 14, y0: 130, y1: 205, r0: 50, r1: 100, z0: -170, z1: 0, cols: nearCols },
    { n: 22, y0: 8, y1: 38, r0: 45, r1: 95, z0: -160, z1: 160, cols: nearCols },
  ];
  const total = rows.reduce((s, r) => s + r.n, 0);
  const mesh = new THREE.InstancedMesh(geo, mat, total);
  let i = 0;
  for (const row of rows) {
    for (let k = 0; k < row.n; k++) {
      const along = (rng() * 2 - 1) * 1900;
      const up = row.y0 + rng() * (row.y1 - row.y0);
      const depth = row.z0 + rng() * (row.z1 - row.z0);
      const r = row.r0 + rng() * (row.r1 - row.r0);
      setInstance(mesh, i++, along, up, depth,
        r * (1.35 + rng() * 0.5), r * (0.55 + rng() * 0.25), r * (0.9 + rng() * 0.3),
        rng() * 6.28, (rng() - 0.5) * 0.7, (rng() - 0.5) * 0.7,
        row.cols[(rng() * row.cols.length) | 0]);
    }
  }
  grp.add(mesh);
  // Local +X runs along the wall; the wall faces the island.
  grp.rotation.y = 2.08;
  grp.visible = false;
  scene.add(grp);
  return grp;
}

function syncFront(grp, scene, state) {
  const m = state.mission;
  const active = m && m.def.id === 'medevac' && state.screen !== 'title';
  grp.visible = !!active;
  if (!active) {
    scene.fog.near = 1000;
    scene.fog.far = 5000;
    scene.fog.color.copy(FOG_BASE);
    return;
  }
  const frac = m.frontArrived ? 0 : clamp(m.frontT / m.def.frontEta, 0, 1);
  const dist = 700 + 2500 * frac;
  grp.position.set(WORLD.islandCx + FRONT_DIR.x * dist, 0, WORLD.islandCz + FRONT_DIR.z * dist);
  // In the last 50 seconds the murk arrives ahead of the wall itself.
  const close = m.frontArrived ? 1 : clamp(1 - Math.max(0, m.frontT) / 50, 0, 1);
  scene.fog.near = lerp(1000, 60, close);
  scene.fog.far = lerp(5000, 780, close);
  _fogCol.copy(FOG_BASE).lerp(FOG_GREY, close * 0.7);
  scene.fog.color.copy(_fogCol);
}

// --- The Kestrel -------------------------------------------------------------

function buildPlane(scene) {
  const grp = new THREE.Group();
  const white = new THREE.MeshLambertMaterial({ color: hexColor(PALETTE.planeBody) });
  const orange = new THREE.MeshLambertMaterial({ color: hexColor(PALETTE.planeStripe) });
  const teal = new THREE.MeshLambertMaterial({ color: 0x14424e });
  const dark = new THREE.MeshLambertMaterial({ color: 0x22282c });

  // Fuselage: a tapered tube, nose toward -Z, plus a rounded nose cap.
  const fusGeo = new THREE.CylinderGeometry(0.52, 0.92, 7.6, 12);
  fusGeo.rotateX(-Math.PI / 2);
  const fus = new THREE.Mesh(fusGeo, white);
  grp.add(fus);
  const noseGeo = new THREE.SphereGeometry(0.52, 12, 10);
  noseGeo.scale(1, 1, 1.7);
  const nose = new THREE.Mesh(noseGeo, white);
  nose.position.z = -3.8;
  grp.add(nose);
  // Livery bands around the tube.
  const bandGeo = new THREE.CylinderGeometry(0.94, 0.9, 0.55, 12);
  bandGeo.rotateX(-Math.PI / 2);
  const band = new THREE.Mesh(bandGeo, orange);
  band.position.z = 1.9;
  grp.add(band);
  const band2Geo = new THREE.CylinderGeometry(0.66, 0.6, 0.4, 12);
  band2Geo.rotateX(-Math.PI / 2);
  const band2 = new THREE.Mesh(band2Geo, teal);
  band2.position.z = -2.6;
  grp.add(band2);
  // Canopy: tinted glass now, not bodywork — a dark smoked pane with a
  // hard specular edge so the low sun draws a glint line across it.
  const canGeo = new THREE.SphereGeometry(0.62, 12, 10);
  canGeo.scale(1, 0.78, 2.1);
  const canopy = new THREE.Mesh(canGeo, new THREE.MeshPhongMaterial({ color: 0x14242e, specular: 0xbfe0ff, shininess: 110 }));
  canopy.position.set(0, 0.52, -1.1);
  grp.add(canopy);
  // Panel lines: two dark seams ringed around the tube, and a pair of
  // exhaust stubs under the cowling — the small print that makes a model
  // read as a machine instead of a toy.
  const seamMat = new THREE.MeshLambertMaterial({ color: 0x454c52 });
  const fusR = (z) => 0.52 + ((z + 3.8) / 7.6) * 0.40;
  for (const z of [-1.5, 0.8]) {
    const seamGeo = new THREE.CylinderGeometry(fusR(z - 0.05) + 0.012, fusR(z + 0.05) + 0.012, 0.09, 12);
    seamGeo.rotateX(-Math.PI / 2);
    const seam = new THREE.Mesh(seamGeo, seamMat);
    seam.position.z = z;
    grp.add(seam);
  }
  for (const s of [-1, 1]) {
    const stubGeo = new THREE.CylinderGeometry(0.07, 0.09, 0.55, 6);
    stubGeo.rotateX(Math.PI / 2.4);
    const stub = new THREE.Mesh(stubGeo, seamMat);
    stub.position.set(s * 0.52, -0.34, -2.9);
    grp.add(stub);
  }
  // Antenna mast on the spine.
  const mast = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 0.2), seamMat);
  mast.position.set(0, 0.92, -0.1);
  mast.rotation.x = -0.18;
  grp.add(mast);
  // Main wing with a hint of dihedral, orange tips.
  for (const s of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.16, 1.7), white);
    wing.position.set(s * 2.95, -0.18, -0.5);
    wing.rotation.z = s * 0.055;
    grp.add(wing);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.2, 1.72), orange);
    tip.position.set(s * 5.85, -0.18 + Math.sin(0.055) * 2.9 * s * s, -0.5);
    tip.position.y = -0.18 + 0.32;
    tip.rotation.z = s * 0.055;
    grp.add(tip);
  }
  // Tail feathers.
  const stab = new THREE.Mesh(new THREE.BoxGeometry(4.3, 0.13, 1.05), white);
  stab.position.set(0, 0.28, 3.55);
  grp.add(stab);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.8, 1.35), white);
  fin.position.set(0, 0.95, 3.55);
  grp.add(fin);
  const finTip = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 1.37), orange);
  finTip.position.set(0, 1.75, 3.55);
  grp.add(finTip);
  // Her registration, painted on both faces of the fin.
  {
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 96;
    const g = cv.getContext('2d');
    g.clearRect(0, 0, 256, 96);
    g.fillStyle = '#22303a';
    g.font = '700 56px "Avenir Next", "Segoe UI", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(CAMPAIGN.reg, 128, 52);
    const tex = new THREE.CanvasTexture(cv);
    tex.encoding = THREE.sRGBEncoding;
    for (const s of [-1, 1]) {
      const plate = new THREE.Mesh(
        new THREE.PlaneGeometry(1.3, 0.49),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true })
      );
      plate.position.set(s * 0.078, 0.95, 3.55);
      plate.rotation.y = s * Math.PI / 2;
      grp.add(plate);
    }
  }
  // Navigation lights: port red, starboard green, tail white, and the red
  // anti-collision beacon on the spine. Unlit materials — a lamp should
  // read as a lamp at dusk, not as paint.
  const lampGeo = new THREE.SphereGeometry(0.13, 8, 6);
  const portLamp = new THREE.Mesh(lampGeo, new THREE.MeshBasicMaterial({ color: 0xff2d1e }));
  portLamp.position.set(-6.38, 0.14, -0.5);
  grp.add(portLamp);
  const stbdLamp = new THREE.Mesh(lampGeo, new THREE.MeshBasicMaterial({ color: 0x2bff62 }));
  stbdLamp.position.set(6.38, 0.14, -0.5);
  grp.add(stbdLamp);
  const tailLamp = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  tailLamp.position.set(0, 0.32, 4.12);
  grp.add(tailLamp);
  const beaconLamp = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3524 }));
  beaconLamp.position.set(0, 0.98, 0.7);
  grp.add(beaconLamp);
  // Gear: two mains and a tail wheel.
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.85, 6), dark);
    leg.position.set(s * 1.05, -0.85, -0.7);
    grp.add(leg);
    const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 10);
    wheelGeo.rotateZ(Math.PI / 2);
    const wheel = new THREE.Mesh(wheelGeo, dark);
    wheel.position.set(s * 1.05, -1.32, -0.7);
    grp.add(wheel);
  }
  const tailWheelGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.16, 8);
  tailWheelGeo.rotateZ(Math.PI / 2);
  const tailWheel = new THREE.Mesh(tailWheelGeo, dark);
  tailWheel.position.set(0, -0.62, 3.5);
  grp.add(tailWheel);
  // Propeller: hub, two blades and a faint blur disc, spun by the model.
  const prop = new THREE.Group();
  const hubGeo = new THREE.ConeGeometry(0.24, 0.7, 10);
  hubGeo.rotateX(-Math.PI / 2);
  const hub = new THREE.Mesh(hubGeo, orange);
  prop.add(hub);
  const bladeGeo = new THREE.BoxGeometry(0.2, 2.9, 0.06);
  const blade = new THREE.Mesh(bladeGeo, dark);
  prop.add(blade);
  const blade2 = new THREE.Mesh(bladeGeo, dark);
  blade2.rotation.z = Math.PI / 2;
  prop.add(blade2);
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(1.5, 24),
    new THREE.MeshBasicMaterial({ color: 0x14181c, transparent: true, opacity: 0.15, side: THREE.DoubleSide, depthWrite: false })
  );
  prop.add(disc);
  prop.position.z = -4.55;
  grp.add(prop);

  grp.traverse((o) => { o.frustumCulled = false; });
  scene.add(grp);
  return { grp, prop };
}

function syncPlane(plane, p) {
  plane.grp.position.set(p.x, p.y + 1.55, p.z);
  plane.grp.rotation.order = 'YXZ';
  plane.grp.rotation.y = -p.heading;
  plane.grp.rotation.x = p.pitch;
  plane.grp.rotation.z = -p.roll;
  plane.prop.rotation.z = p.propSpin * 5;
}

// A soft blob shadow that ties the plane to the ground.
function buildBlobShadow(scene) {
  const geo = new THREE.CircleGeometry(6.4, 20);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ color: 0x06131c, transparent: true, opacity: 0.35, depthWrite: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 2;
  scene.add(mesh);
  return mesh;
}

function syncShadow(mesh, p) {
  const g = groundHeightAt(p.x, p.z);
  const agl = Math.max(0, p.y - g);
  mesh.position.set(p.x, Math.max(g, 0) + 0.35, p.z);
  mesh.material.opacity = clamp(0.38 - agl * 0.0035, 0, 0.38);
  const s = 1 + agl * 0.004;
  mesh.scale.set(s, 1, s);
  mesh.visible = agl < 130;
}

// --- Mission dressing ----------------------------------------------------------

function buildRings(scene) {
  const grp = new THREE.Group();
  const geo = new THREE.TorusGeometry(26, 2.0, 10, 42);
  const meshes = MISSIONS[0].rings.map((r, i, arr) => {
    // Unlit gold: a ring is a game marker, not scenery — it should glow
    // against any sky the way the 2D game's rings did.
    const mat = new THREE.MeshBasicMaterial({ color: 0xffa726 });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(r.x, r.y, r.z);
    const nxt = arr[(i + 1) % arr.length];
    m.lookAt(nxt.x, nxt.y, nxt.z);
    grp.add(m);
    return m;
  });
  scene.add(grp);
  return { grp, meshes };
}

function syncRings(rings, state) {
  const m = state.mission;
  const active = state.screen === 'fly' && m && m.def.id === 'rings' && !m.finished;
  rings.grp.visible = !!active;
  if (!active) return;
  rings.meshes.forEach((mesh, i) => {
    if (i < m.ringIndex) mesh.visible = false;
    else {
      mesh.visible = true;
      const isTarget = i === m.ringIndex;
      mesh.material.color.setHex(isTarget ? 0xffb52e : 0xd88f1d);
      const s = isTarget ? 1 + Math.sin(state.time * 5) * 0.04 : 1;
      mesh.scale.set(s, s, s);
    }
  });
}

// A light pillar + ground ring marking the live objective (patrol marks,
// the delivery strip).
function buildBeacon(scene) {
  const grp = new THREE.Group();
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(6, 9, 260, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x7ae7ff, transparent: true, opacity: 0.11, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  beam.position.y = 130;
  grp.add(beam);
  const ringGeo = new THREE.TorusGeometry(24, 1.1, 8, 36);
  ringGeo.rotateX(Math.PI / 2);
  const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0x7ae7ff, transparent: true, opacity: 0.8 }));
  ring.position.y = 1;
  grp.add(ring);
  scene.add(grp);
  return grp;
}

function syncBeacon(grp, state) {
  const m = state.mission;
  let show = false;
  let x = 0, z = 0, y = 0;
  if (state.screen === 'fly' && m && !m.finished) {
    if (m.def.id === 'patrol') {
      const c = m.def.checkpoints[m.checkpointIndex];
      if (c) { show = true; x = c.x; z = c.z; y = Math.max(0, groundHeightAt(c.x, c.z)); }
    } else if (m.def.id === 'delivery') {
      const s = RUNWAYS[1];
      show = true; x = s.cx; z = s.cz; y = groundHeightAt(s.cx, s.cz);
    } else if (m.def.id === 'medevac') {
      const s = RUNWAYS[0];
      show = true; x = s.cx; z = s.cz; y = groundHeightAt(s.cx, s.cz);
    }
  }
  grp.visible = show;
  if (show) grp.position.set(x, y, z);
}

// The rescue set: a fishing boat, a lit drop circle and a beam over it.
function buildRescue(scene) {
  const drop = MISSIONS[3].drop;
  const grp = new THREE.Group();
  // Boat.
  const boat = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(11, 2.3, 4.6), new THREE.MeshLambertMaterial({ color: 0x9a4436, flatShading: true }));
  hull.position.y = 0.8;
  boat.add(hull);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(9.4, 0.5, 3.6), new THREE.MeshLambertMaterial({ color: 0xd8cdb4 }));
  deck.position.y = 2.1;
  boat.add(deck);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.3, 3), new THREE.MeshLambertMaterial({ color: 0xf2ead8, flatShading: true }));
  cabin.position.set(-2.4, 3.4, 0);
  boat.add(cabin);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 6.4, 6), new THREE.MeshLambertMaterial({ color: 0x6e5136 }));
  mast.position.set(2.6, 5, 0);
  boat.add(mast);
  boat.position.set(drop.x, 0, drop.z);
  boat.rotation.y = 0.7;
  grp.add(boat);
  // Lit drop circle on the water.
  const ringGeo = new THREE.TorusGeometry(30, 1.2, 8, 44);
  ringGeo.rotateX(Math.PI / 2);
  const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0x54f2ff, transparent: true, opacity: 0.9 }));
  ring.position.set(drop.x, 0.7, drop.z);
  grp.add(ring);
  const discGeo = new THREE.CircleGeometry(30, 32);
  discGeo.rotateX(-Math.PI / 2);
  const disc = new THREE.Mesh(discGeo, new THREE.MeshBasicMaterial({ color: 0x54f2ff, transparent: true, opacity: 0.12, depthWrite: false }));
  disc.position.set(drop.x, 0.55, drop.z);
  grp.add(disc);
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(3.4, 5, 300, 10, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x54f2ff, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  beam.position.set(drop.x, 150, drop.z);
  grp.add(beam);
  scene.add(grp);
  return { grp, ring };
}

function syncRescue(rescue, state) {
  const m = state.mission;
  const active = state.screen === 'fly' && m && m.def.id === 'rescue';
  rescue.grp.visible = !!active || state.screen === 'title';
  if (active && !m.finished) {
    const s = 1 + Math.sin(state.time * 3.2) * 0.05;
    rescue.ring.scale.set(s, 1, s);
  }
}

// The falling pump buoy, visible between the drop and the splash.
function buildBuoyMesh(scene) {
  const grp = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 1.7, 9), new THREE.MeshLambertMaterial({ color: 0xff7a1a, flatShading: true }));
  grp.add(body);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.85, 9, 7), new THREE.MeshLambertMaterial({ color: 0xffd9a0, emissive: 0xff9d3c, emissiveIntensity: 0.7 }));
  cap.position.y = 0.95;
  grp.add(cap);
  grp.visible = false;
  scene.add(grp);
  return grp;
}

function syncBuoy(mesh, state) {
  const m = state.mission;
  if (m && m.buoy) {
    mesh.visible = true;
    mesh.position.set(m.buoy.x, m.buoy.y, m.buoy.z);
    mesh.rotation.z = state.time * 2.4;
  } else {
    mesh.visible = false;
  }
}

// --- Camera --------------------------------------------------------------------

function updateCamera(camera, cam, state, dt, snap) {
  const p = state.plane;
  if (state.screen === 'title') {
    const t = state.time;
    const a = 2.62 + t * 0.014;
    const R = 1480;
    camera.position.set(WORLD.islandCx + Math.sin(a) * R, 395, WORLD.islandCz + Math.cos(a) * R);
    camera.up.set(0, 1, 0);
    camera.lookAt(60, 0, -60);
    if (camera.fov !== 55) { camera.fov = 55; camera.updateProjectionMatrix(); }
    cam.init = false;
    return;
  }
  const fx = Math.sin(p.heading);
  const fz = -Math.cos(p.heading);
  // Screenshot staging may pin the chase offsets (camShot) for one composed
  // frame; live flight never sets it and follows the standard chase below.
  const shot = state.snapCam && state.camShot ? state.camShot : null;
  const back = shot ? shot.back : VIEW.camBack + p.speed * 0.1;
  const sideOff = shot ? shot.side : 0;
  const desX = p.x - fx * back - fz * sideOff;
  const desZ = p.z - fz * back + fx * sideOff;
  const desY = p.y + (shot ? shot.up : 1.55 + VIEW.camUp) - Math.sin(p.pitch) * back * 0.4;
  if (snap || !cam.init) {
    camera.position.set(desX, Math.max(desY, groundHeightAt(desX, desZ) + 3), desZ);
    cam.init = true;
  } else {
    const k = 1 - Math.exp(-dt * 5.0);
    camera.position.x += (desX - camera.position.x) * k;
    camera.position.z += (desZ - camera.position.z) * k;
    const ky = 1 - Math.exp(-dt * 4.0);
    camera.position.y += (desY - camera.position.y) * ky;
    const minY = groundHeightAt(camera.position.x, camera.position.z) + 2.5;
    if (camera.position.y < minY) camera.position.y = minY;
  }
  camera.up.set(0, 1, 0);
  const look = shot ? shot.look : 55;
  camera.lookAt(p.x + fx * look, p.y + 1.4 + Math.sin(p.pitch) * 22, p.z + fz * look);
  let rollAmt = -p.roll * 0.5;
  if (p.turbulence) rollAmt += Math.sin(state.time * 31) * 0.008;
  if (p.stalled) rollAmt += Math.sin(state.time * 17) * 0.006;
  camera.rotateZ(rollAmt);
  const targetFov = VIEW.fovDeg + clamp((p.speed - 30) / 70, 0, 1) * 7;
  if (Math.abs(camera.fov - targetFov) > 0.05) {
    camera.fov += (targetFov - camera.fov) * (snap ? 1 : 0.08);
    camera.updateProjectionMatrix();
  }
}
