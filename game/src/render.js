// Skyhaul — the renderer. A hand-rolled pseudo-3D chase view: the island is a
// grid of flat-shaded tiles projected point by point, features and clouds are
// billboards sorted far to near, and the Kestrel is drawn as a shaded vector
// sprite that banks, pitches and bobs with the flight model.

import { VIEW, PALETTE, DEG, clamp, lerp, angDiff } from './config.js';
import { groundHeightAt, shadeColor, MOUNTAINS } from './world.js';

export function createCamera() {
  return { x: 0, y: 120, z: 1500, heading: 0, pitch: -0.06, roll: 0, shake: 0 };
}

export function updateCamera(state, dt) {
  const cam = state.camera;
  const p = state.plane;
  if (state.screen === 'title') {
    const a = state.time * 0.045;
    cam.x = Math.sin(a) * 1480;
    cam.z = -80 + Math.cos(a) * 1480;
    cam.y = 400;
    // Look at the island centre: heading solves forward = (sin H, -cos H).
    cam.heading = Math.atan2(-cam.x, cam.z + 80);
    cam.pitch = -0.3;
    cam.roll = 0;
    return;
  }
  // Chase: sit behind and above, ease toward the aircraft's own attitude.
  const back = VIEW.camBack + p.speed * 0.05;
  const tx = p.x - Math.sin(p.heading) * back;
  const tz = p.z + Math.cos(p.heading) * back;
  const ty = Math.max(p.y + VIEW.camUp, groundHeightAt(tx, tz) + 4);
  const k = 1 - Math.exp(-dt * 4.2);
  cam.x = lerp(cam.x, tx, k);
  cam.z = lerp(cam.z, tz, k);
  cam.y = lerp(cam.y, ty, 1 - Math.exp(-dt * 5.5));
  cam.heading += angDiff(p.heading, cam.heading) * (1 - Math.exp(-dt * 3.4));
  cam.pitch = lerp(cam.pitch, p.pitch * 0.52 - 0.02, 1 - Math.exp(-dt * 4));
  cam.roll = lerp(cam.roll, p.roll * 0.55, 1 - Math.exp(-dt * 4));
  cam.shake = Math.max(0, cam.shake - dt * 1.6);
  const shakeAmp = (p.stalled ? 2.6 : 0) + (p.stress ? 2.2 : 0) + (p.turbulence ? 3.4 : 0) + cam.shake * 8;
  cam.shakeX = (Math.random() - 0.5) * shakeAmp;
  cam.shakeY = (Math.random() - 0.5) * shakeAmp;
}

// Build the per-frame projector: world point -> screen point (or null if behind).
function makeProjector(cam, w, h) {
  const focal = (h / 2) / Math.tan((VIEW.fovDeg * DEG) / 2);
  const sh = Math.sin(cam.heading);
  const ch = Math.cos(cam.heading);
  const sp = Math.sin(cam.pitch);
  const cp = Math.cos(cam.pitch);
  const cx = w / 2 + (cam.shakeX || 0);
  const cy = h / 2 + (cam.shakeY || 0);
  const roll = cam.roll;
  const cosR = Math.cos(roll);
  const sinR = Math.sin(roll);
  return (x, y, z) => {
    const dx = x - cam.x;
    const dy = y - cam.y;
    const dz = z - cam.z;
    const rx = dx * ch + dz * sh;
    const fz = dx * sh - dz * ch;
    if (fz < 1.2) return null;
    const uy = dy * cp - fz * sp;
    const fy = dy * sp + fz * cp;
    if (fy < 1.2) return null;
    let sx = cx + (rx / fy) * focal;
    let sy = cy - (uy / fy) * focal;
    if (roll !== 0) {
      const ox = sx - cx;
      const oy = sy - cy;
      sx = cx + ox * cosR - oy * sinR;
      sy = cy + ox * sinR + oy * cosR;
    }
    return { x: sx, y: sy, depth: fy, scale: focal / fy };
  };
}

function drawSky(ctx, cam, w, h, time) {
  const g = ctx.createLinearGradient(0, 0, 0, h * 0.72);
  g.addColorStop(0, PALETTE.skyTop);
  g.addColorStop(0.62, PALETTE.skyMid);
  g.addColorStop(1, PALETTE.skyHorizon);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // Sun, low in the south-west, with a warm halo.
  const sunX = w * 0.78;
  const sunY = h * 0.3 - cam.pitch * 300;
  const halo = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 190);
  halo.addColorStop(0, PALETTE.sunGlow);
  halo.addColorStop(1, 'rgba(255,190,92,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(sunX - 200, sunY - 200, 400, 400);
  ctx.fillStyle = PALETTE.sunCore;
  ctx.beginPath();
  ctx.arc(sunX, sunY, 26, 0, Math.PI * 2);
  ctx.fill();
  // A far headland silhouette for depth.
  ctx.fillStyle = 'rgba(70, 105, 140, 0.20)';
  ctx.beginPath();
  ctx.moveTo(0, h * 0.52 - cam.pitch * 260);
  for (let x = 0; x <= w; x += 80) {
    ctx.lineTo(x, h * 0.52 - cam.pitch * 260 - Math.sin(x * 0.004 + 2) * 22 - 12);
  }
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fill();
}

function drawGround(ctx, proj, state, world) {
  const cam = state.camera;
  const size = 130;
  const half = size / 2;
  const visible = [];
  for (const t of world.tiles) {
    const dx = t.x - cam.x;
    const dz = t.z - cam.z;
    const d2 = dx * dx + dz * dz;
    if (d2 > VIEW.viewDistance * VIEW.viewDistance) continue;
    visible.push({ t, d2 });
  }
  visible.sort((a, b) => b.d2 - a.d2);
  for (const { t, d2 } of visible) {
    const dist = Math.sqrt(d2);
    const fogMix = clamp((dist - 800) / (VIEW.viewDistance - 800), 0, 0.82);
    let shade = t.shade;
    if (t.type === 'sea') shade *= 1 + Math.sin(state.time * 1.2 + (t.x + t.z) * 0.008) * 0.045;
    const c = [
      [t.x - half, t.z - half], [t.x + half, t.z - half],
      [t.x + half, t.z + half], [t.x - half, t.z + half],
    ].map(([x, z]) => proj(x, groundHeightAt(x, z), z));
    if (c.some((p) => !p)) continue;
    ctx.fillStyle = shadeColor(t.color, shade, fogMix, PALETTE.fog);
    ctx.beginPath();
    ctx.moveTo(c[0].x, c[0].y);
    ctx.lineTo(c[1].x, c[1].y);
    ctx.lineTo(c[2].x, c[2].y);
    ctx.lineTo(c[3].x, c[3].y);
    ctx.closePath();
    ctx.fill();
  }
}

function drawRunways(ctx, proj, state, world) {
  for (const rwy of world.runways) {
    const s = Math.sin(rwy.heading);
    const c = Math.cos(rwy.heading);
    const corner = (along, across) => proj(
      rwy.cx + s * along + c * across, 0.7,
      rwy.cz - c * along + s * across,
    );
    const a = corner(-rwy.length / 2, -rwy.width / 2);
    const b = corner(-rwy.length / 2, rwy.width / 2);
    const d = corner(rwy.length / 2, rwy.width / 2);
    const e = corner(rwy.length / 2, -rwy.width / 2);
    if (!a || !b || !d || !e) continue;
    ctx.fillStyle = rwy.kind === 'paved' ? PALETTE.runway : PALETTE.dirtStrip;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(d.x, d.y); ctx.lineTo(e.x, e.y);
    ctx.closePath();
    ctx.fill();
    // Centreline dashes and threshold bars on the paved field.
    if (rwy.kind === 'paved') {
      ctx.fillStyle = PALETTE.runwayLine;
      for (let along = -rwy.length / 2 + 46; along < rwy.length / 2 - 30; along += 56) {
        const p1 = corner(along, -1.1);
        const p2 = corner(along + 26, 1.1);
        if (p1 && p2) ctx.fillRect(Math.min(p1.x, p2.x), Math.min(p1.y, p2.y), Math.abs(p2.x - p1.x) || 2, Math.max(1.5, Math.abs(p2.y - p1.y)));
      }
    }
    // Edge lights: warm dots a pilot can line up on at dusk.
    for (let along = -rwy.length / 2; along <= rwy.length / 2; along += 78) {
      for (const side of [-1, 1]) {
        const p = corner(along, side * (rwy.width / 2 + 3));
        if (!p) continue;
        ctx.fillStyle = 'rgba(255, 178, 84, 0.9)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, clamp(p.scale * 1.6, 0.8, 3.4), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

function drawMountain(ctx, proj, m, cam) {
  const apex = proj(m.x, m.h, m.z);
  if (!apex) return;
  // Base points either side of the cone, perpendicular to the view.
  const rx = Math.cos(cam.heading);
  const rz = Math.sin(cam.heading);
  const l = proj(m.x - rx * m.r, 0, m.z - rz * m.r);
  const r = proj(m.x + rx * m.r, 0, m.z + rz * m.r);
  if (!l || !r) return;
  ctx.fillStyle = shadeColor(PALETTE.rock, 0.92, clamp((apex.depth - 800) / 1400, 0, 0.7), PALETTE.fog);
  ctx.beginPath();
  ctx.moveTo(l.x, l.y); ctx.lineTo(apex.x, apex.y); ctx.lineTo(r.x, r.y);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = shadeColor(PALETTE.rock, 0.72, clamp((apex.depth - 800) / 1400, 0, 0.7), PALETTE.fog);
  ctx.beginPath();
  ctx.moveTo(apex.x, apex.y); ctx.lineTo(r.x, r.y);
  ctx.lineTo(apex.x + (r.x - apex.x) * 0.24, apex.y + (r.y - apex.y) * 0.55);
  ctx.closePath(); ctx.fill();
  if (m.h > 200) {
    ctx.fillStyle = PALETTE.snow;
    ctx.beginPath();
    ctx.moveTo(apex.x, apex.y);
    ctx.lineTo(apex.x - (apex.x - l.x) * 0.2, apex.y + (l.y - apex.y) * 0.2);
    ctx.lineTo(apex.x + (r.x - apex.x) * 0.2, apex.y + (r.y - apex.y) * 0.2);
    ctx.closePath(); ctx.fill();
  }
}

function drawTree(ctx, proj, f) {
  const base = proj(f.x, groundHeightAt(f.x, f.z), f.z);
  if (!base) return;
  const hPx = f.h * base.scale;
  const wPx = hPx * 0.62;
  ctx.fillStyle = 'rgba(60, 42, 26, 1)';
  ctx.fillRect(base.x - Math.max(1, wPx * 0.05), base.y - hPx * 0.3, Math.max(1.6, wPx * 0.1), hPx * 0.3);
  const greens = ['#2e7a3c', '#359047', '#27703a'];
  for (let i = 0; i < 3; i++) {
    const y0 = base.y - hPx * (0.24 + i * 0.24);
    const wdt = wPx * (1 - i * 0.26);
    ctx.fillStyle = greens[(i + Math.floor(f.seed * 3)) % 3];
    ctx.beginPath();
    ctx.moveTo(base.x - wdt / 2, y0);
    ctx.lineTo(base.x, y0 - hPx * 0.34);
    ctx.lineTo(base.x + wdt / 2, y0);
    ctx.closePath(); ctx.fill();
  }
}

function drawHouse(ctx, proj, f, hangar) {
  const base = proj(f.x, 0, f.z);
  if (!base) return;
  const wPx = base.scale * (hangar ? 34 : 17);
  const hPx = base.scale * f.h;
  const lean = wPx * 0.3;
  // Side face, then front, then roof — a little cardboard village.
  ctx.fillStyle = hangar ? '#7d8ea0' : '#a9805a';
  ctx.beginPath();
  ctx.moveTo(base.x + wPx / 2, base.y);
  ctx.lineTo(base.x + wPx / 2 + lean, base.y - hPx * 0.24);
  ctx.lineTo(base.x + wPx / 2 + lean, base.y - hPx * 0.24 - hPx * 0.72);
  ctx.lineTo(base.x + wPx / 2, base.y - hPx * 0.72);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = hangar ? '#9db2c4' : '#e8dcc4';
  ctx.fillRect(base.x - wPx / 2, base.y - hPx * 0.72, wPx, hPx * 0.72);
  ctx.fillStyle = hangar ? '#5d7185' : '#b5502f';
  ctx.beginPath();
  if (hangar) {
    ctx.arc(base.x, base.y - hPx * 0.72, wPx / 2, Math.PI, 0);
  } else {
    ctx.moveTo(base.x - wPx * 0.62, base.y - hPx * 0.72);
    ctx.lineTo(base.x, base.y - hPx * 1.12);
    ctx.lineTo(base.x + wPx * 0.62, base.y - hPx * 0.72);
  }
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255, 214, 120, 0.95)';
  const win = Math.max(1.4, wPx * 0.09);
  ctx.fillRect(base.x - wPx * 0.26, base.y - hPx * 0.45, win, win);
  ctx.fillRect(base.x + wPx * 0.14, base.y - hPx * 0.45, win, win);
}

function drawLighthouse(ctx, proj, f, time) {
  const base = proj(f.x, 0, f.z);
  if (!base) return;
  const hPx = f.h * base.scale;
  const wPx = hPx * 0.3;
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = i % 2 ? '#e8e4da' : '#c8452c';
    const y0 = base.y - (hPx * i) / 4;
    const wdt = wPx * (1 - i * 0.13);
    ctx.fillRect(base.x - wdt / 2, y0 - hPx / 4, wdt, hPx / 4);
  }
  const topY = base.y - hPx;
  const glow = ctx.createRadialGradient(base.x, topY, 1, base.x, topY, wPx * 1.7);
  glow.addColorStop(0, 'rgba(255, 240, 170, 0.85)');
  glow.addColorStop(1, 'rgba(255, 240, 170, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(base.x - wPx * 1.7, topY - wPx * 1.7, wPx * 3.4, wPx * 3.4);
  ctx.fillStyle = '#333';
  ctx.fillRect(base.x - wPx * 0.3, topY - hPx * 0.1, wPx * 0.6, hPx * 0.1);
}

function drawTower(ctx, proj, f, time) {
  const base = proj(f.x, 0, f.z);
  if (!base) return;
  const hPx = f.h * base.scale;
  ctx.strokeStyle = 'rgba(50, 58, 66, 0.9)';
  ctx.lineWidth = Math.max(1, base.scale * 0.8);
  ctx.beginPath();
  ctx.moveTo(base.x - hPx * 0.1, base.y);
  ctx.lineTo(base.x, base.y - hPx);
  ctx.lineTo(base.x + hPx * 0.1, base.y);
  ctx.moveTo(base.x - hPx * 0.06, base.y - hPx * 0.5);
  ctx.lineTo(base.x + hPx * 0.06, base.y - hPx * 0.5);
  ctx.stroke();
  if (Math.sin(time * 2.4) > 0.2) {
    ctx.fillStyle = '#ff4444';
    ctx.beginPath();
    ctx.arc(base.x, base.y - hPx, Math.max(1.6, base.scale * 1.6), 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBuoy(ctx, proj, f, time) {
  const bob = Math.sin(time * 1.4 + f.x) * 0.6;
  const base = proj(f.x, bob, f.z);
  if (!base) return;
  const hPx = f.h * base.scale;
  ctx.fillStyle = '#d84f35';
  ctx.beginPath();
  ctx.moveTo(base.x - hPx * 0.4, base.y);
  ctx.lineTo(base.x, base.y - hPx);
  ctx.lineTo(base.x + hPx * 0.4, base.y);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#ffe9a8';
  ctx.fillRect(base.x - 1, base.y - hPx * 1.2, 2, hPx * 0.2);
}

function drawCloud(ctx, proj, c) {
  for (const puff of c.puffs) {
    const p = proj(c.x + puff.dx, c.y + puff.dy, c.z + puff.dz);
    if (!p) continue;
    const r = puff.r * p.scale;
    if (r < 2) continue;
    ctx.fillStyle = c.storm ? PALETTE.stormShade : PALETTE.cloudShade;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + r * 0.24, r, r * 0.52, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = c.storm ? PALETTE.stormLit : PALETTE.cloudLit;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, r, r * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawRing(ctx, proj, ring, isCurrent, time, cam) {
  const c = proj(ring.x, ring.y, ring.z);
  if (!c) return;
  const rxv = Math.cos(cam.heading);
  const rzv = Math.sin(cam.heading);
  const side = proj(ring.x + rxv * 26, ring.y, ring.z + rzv * 26);
  const top = proj(ring.x, ring.y + 26, ring.z);
  if (!side || !top) return;
  const rx = Math.max(4, Math.abs(side.x - c.x));
  const ry = Math.max(4, Math.abs(top.y - c.y));
  const pulse = isCurrent ? 1 + Math.sin(time * 3.2) * 0.045 : 1;
  ctx.save();
  if (isCurrent) { ctx.shadowColor = 'rgba(255, 190, 40, 0.9)'; ctx.shadowBlur = 18; }
  ctx.strokeStyle = isCurrent ? '#ffc93c' : 'rgba(255, 201, 60, 0.45)';
  ctx.lineWidth = clamp(c.scale * 3.4, 2, 9);
  ctx.beginPath();
  ctx.ellipse(c.x, c.y, rx * pulse, ry * pulse, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawBeacon(ctx, proj, x, z, color, time) {
  const base = proj(x, 0, z);
  const top = proj(x, 320, z);
  if (!base || !top) return;
  const wdt = clamp(base.scale * 9, 2, 16) * (1 + Math.sin(time * 2.6) * 0.15);
  const g = ctx.createLinearGradient(0, top.y, 0, base.y);
  g.addColorStop(0, 'rgba(120, 230, 255, 0)');
  g.addColorStop(1, color);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(base.x - wdt, base.y);
  ctx.lineTo(top.x - wdt * 0.3, top.y);
  ctx.lineTo(top.x + wdt * 0.3, top.y);
  ctx.lineTo(base.x + wdt, base.y);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(base.x, base.y, clamp(base.scale * 30, 4, 60), clamp(base.scale * 9, 2, 18), 0, 0, Math.PI * 2);
  ctx.stroke();
}

// The Kestrel, drawn as a shaded rear-quarter sprite. unit scales the drawing;
// rollRad banks it, pitchRad nudges it up or down the frame.
export function drawPlaneSprite(ctx, px, py, unit, rollRad, pitchRad, plane, time) {
  ctx.save();
  ctx.translate(px, py - pitchRad * unit * 2.4);
  ctx.rotate(rollRad * 0.85);
  ctx.scale(unit, unit * (1 - Math.abs(pitchRad) * 0.1));
  // Prop disc, a translucent blur behind the nose.
  ctx.fillStyle = 'rgba(230, 238, 244, 0.20)';
  ctx.beginPath();
  ctx.ellipse(0, -6, 30, 30, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1.4;
  const blade = (plane.propSpin % (Math.PI * 2));
  ctx.beginPath();
  ctx.moveTo(Math.cos(blade) * -28, -6 + Math.sin(blade) * -28 * 0.9);
  ctx.lineTo(Math.cos(blade) * 28, -6 + Math.sin(blade) * 28 * 0.9);
  ctx.stroke();
  // Main wings with dihedral, aileron seams and tip lights.
  const wing = (side) => {
    ctx.fillStyle = PALETTE.planeBody;
    ctx.beginPath();
    ctx.moveTo(side * 6, 2);
    ctx.lineTo(side * 88, -12);
    ctx.lineTo(side * 92, -5);
    ctx.lineTo(side * 10, 12);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = PALETTE.planeStripe;
    ctx.beginPath();
    ctx.moveTo(side * 62, -8.4);
    ctx.lineTo(side * 88, -12);
    ctx.lineTo(side * 90, -8);
    ctx.lineTo(side * 64, -4.6);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(40,50,60,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(side * 58, -6); ctx.lineTo(side * 60, 4);
    ctx.stroke();
    ctx.fillStyle = side < 0 ? '#ff3b30' : '#2eff7a';
    ctx.beginPath();
    ctx.arc(side * 90, -8, 2.6, 0, Math.PI * 2);
    ctx.fill();
  };
  wing(-1); wing(1);
  // Tail feathers.
  ctx.fillStyle = PALETTE.planeBody;
  ctx.beginPath();
  ctx.moveTo(-4, -34); ctx.lineTo(-30, -44); ctx.lineTo(-30, -37); ctx.lineTo(-4, -26);
  ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(4, -34); ctx.lineTo(30, -44); ctx.lineTo(30, -37); ctx.lineTo(4, -26);
  ctx.closePath(); ctx.fill();
  // Vertical fin with the house stripe.
  ctx.beginPath();
  ctx.moveTo(-3, -30); ctx.lineTo(0, -62); ctx.lineTo(7, -60); ctx.lineTo(6, -30);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = PALETTE.planeStripe;
  ctx.fillRect(-1.4, -58, 6.4, 7);
  // Fuselage: a shaded teardrop, tail at the top, belly at the bottom.
  const bodyGrad = ctx.createLinearGradient(-13, 0, 13, 0);
  bodyGrad.addColorStop(0, '#cfd4d9');
  bodyGrad.addColorStop(0.45, PALETTE.planeBody);
  bodyGrad.addColorStop(1, '#b9bfc6');
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.moveTo(0, -58);
  ctx.quadraticCurveTo(13, -30, 12, 2);
  ctx.quadraticCurveTo(11, 22, 0, 26);
  ctx.quadraticCurveTo(-11, 22, -12, 2);
  ctx.quadraticCurveTo(-13, -30, 0, -58);
  ctx.fill();
  // Cheatline stripe down the fuselage.
  ctx.fillStyle = PALETTE.planeTeal;
  ctx.fillRect(-12.4, 2, 24.8, 4.6);
  // Canopy with a sky glint.
  const glass = ctx.createLinearGradient(0, -34, 0, -8);
  glass.addColorStop(0, '#9fd4e8');
  glass.addColorStop(0.5, '#3d6f8e');
  glass.addColorStop(1, '#274b63');
  ctx.fillStyle = glass;
  ctx.beginPath();
  ctx.ellipse(0, -20, 8.6, 13, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.beginPath();
  ctx.ellipse(-3, -26, 2.6, 5.4, -0.3, 0, Math.PI * 2);
  ctx.fill();
  // Spinner and exhaust stubs.
  ctx.fillStyle = PALETTE.planeStripe;
  ctx.beginPath();
  ctx.arc(0, -4, 4.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#4a4238';
  ctx.fillRect(-13, 12, 3.4, 6);
  ctx.fillRect(9.6, 12, 3.4, 6);
  // Fixed gear with spats.
  ctx.fillStyle = '#2c3136';
  ctx.beginPath();
  ctx.ellipse(-13, 27, 4.6, 6.4, 0, 0, Math.PI * 2);
  ctx.ellipse(13, 27, 4.6, 6.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPlaneShadow(ctx, proj, plane) {
  const gy = groundHeightAt(plane.x, plane.z);
  const p = proj(plane.x, gy + 0.5, plane.z);
  if (!p) return;
  const alt = plane.y - gy;
  const r = clamp(p.scale * 15 * clamp(1 - alt * 0.0016, 0.35, 1), 3, 100);
  ctx.fillStyle = `rgba(10, 20, 16, ${clamp(0.36 - alt * 0.0011, 0.04, 0.36)})`;
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, r * 1.7, r * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawBirds(ctx, proj, time) {
  const cx = 620;
  const cz = -1350;
  for (let i = 0; i < 5; i++) {
    const a = time * 0.11 + (i * Math.PI * 2) / 5;
    const x = cx + Math.cos(a) * 130;
    const z = cz + Math.sin(a) * 130;
    const p = proj(x, 175 + Math.sin(time * 0.9 + i) * 6, z);
    if (!p) continue;
    const s = clamp(p.scale * 5, 1.2, 5);
    const flap = Math.sin(time * 7 + i * 1.7) * s * 0.7;
    ctx.strokeStyle = 'rgba(30, 40, 50, 0.8)';
    ctx.lineWidth = Math.max(1, s * 0.3);
    ctx.beginPath();
    ctx.moveTo(p.x - s, p.y - flap);
    ctx.quadraticCurveTo(p.x, p.y + s * 0.4, p.x + s, p.y - flap);
    ctx.stroke();
  }
}

export function drawScene(ctx, state, world, w, h) {
  const cam = state.camera;
  const proj = makeProjector(cam, w, h);
  drawSky(ctx, cam, w, h, state.time);
  drawGround(ctx, proj, state, world);
  drawRunways(ctx, proj, state, world);

  // Everything with height, sorted far to near and drawn in one pass.
  const drawables = [];
  for (const m of MOUNTAINS) drawables.push({ d: Math.hypot(m.x - cam.x, m.z - cam.z), kind: 'mountain', o: m });
  for (const f of world.features) {
    const d = Math.hypot(f.x - cam.x, f.z - cam.z);
    if (d < VIEW.viewDistance) drawables.push({ d, kind: f.kind, o: f });
  }
  for (const c of world.clouds) {
    const d = Math.hypot(c.x - cam.x, c.z - cam.z);
    if (d < VIEW.viewDistance + 600) drawables.push({ d, kind: 'cloud', o: c });
  }
  drawables.sort((a, b) => b.d - a.d);
  for (const dr of drawables) {
    if (dr.kind === 'mountain') drawMountain(ctx, proj, dr.o, cam);
    else if (dr.kind === 'tree') drawTree(ctx, proj, dr.o);
    else if (dr.kind === 'house') drawHouse(ctx, proj, dr.o, false);
    else if (dr.kind === 'hangar') drawHouse(ctx, proj, dr.o, true);
    else if (dr.kind === 'lighthouse') drawLighthouse(ctx, proj, dr.o, state.time);
    else if (dr.kind === 'tower') drawTower(ctx, proj, dr.o, state.time);
    else if (dr.kind === 'buoy') drawBuoy(ctx, proj, dr.o, state.time);
    else if (dr.kind === 'cloud') drawCloud(ctx, proj, dr.o);
  }
  drawBirds(ctx, proj, state.time);

  // Mission dressing: rings, checkpoint pillars, the delivery beacon.
  const m = state.mission;
  if (state.screen === 'fly' && m) {
    if (m.def.id === 'rings') {
      m.def.rings.forEach((r, i) => {
        if (i >= m.ringIndex && i <= m.ringIndex + 2) drawRing(ctx, proj, r, i === m.ringIndex, state.time, cam);
      });
    } else if (m.def.id === 'patrol') {
      const c = m.def.checkpoints[m.checkpointIndex];
      if (c) drawBeacon(ctx, proj, c.x, c.z, 'rgba(110, 225, 255, 0.75)', state.time);
    } else if (m.def.id === 'delivery') {
      const s = world.runways[1];
      drawBeacon(ctx, proj, s.cx, s.cz, 'rgba(255, 170, 90, 0.8)', state.time);
    }
  }

  // The aircraft: projected on the title orbit, a chase sprite in flight.
  const p = state.plane;
  if (state.screen === 'title') {
    const sp = proj(p.x, p.y + 6, p.z);
    if (sp) drawPlaneSprite(ctx, sp.x, sp.y, clamp(sp.scale * 0.62, 0.05, 0.5), 0, 0, p, state.time);
  } else {
    drawPlaneShadow(ctx, proj, p);
    const bob = p.onGround ? 0 : Math.sin(state.time * 1.7) * 2.2;
    const unit = 1.55;
    drawPlaneSprite(ctx, w / 2, h * 0.545 + bob, unit, p.roll, p.pitch, p, state.time);
    if (state.screen === 'crashed') {
      for (let i = 0; i < 6; i++) {
        const t = (state.time * 0.24 + i / 6) % 1;
        ctx.fillStyle = `rgba(70, 70, 74, ${0.4 * (1 - t)})`;
        ctx.beginPath();
        ctx.arc(w / 2 + Math.sin(i * 2.4) * 20 * t, h * 0.5 - t * 120, 12 + t * 42, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Wind streaks when she is really moving.
    if (!p.onGround && p.speed > 68) {
      ctx.strokeStyle = 'rgba(255,255,255,0.28)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 7; i++) {
        const y = ((i * 173 + state.time * 900) % (h * 0.8)) + h * 0.08;
        const x = (i * 331) % w;
        const len = 60 + (p.speed - 68) * 3;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + len, y);
        ctx.stroke();
      }
    }
  }

  // A soft vignette to finish the frame.
  const vg = ctx.createRadialGradient(w / 2, h / 2, h * 0.42, w / 2, h / 2, h * 0.95);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(6, 12, 20, 0.30)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);
}
