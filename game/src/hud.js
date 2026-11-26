// Skyhaul 3D — the HUD and the lit instrument panel, drawn on a 2D overlay
// canvas above the WebGL view. A compass tape up top, altitude and speed
// blocks in the corners, a mission card, and a bottom dashboard of real
// gauges: airspeed, altimeter, attitude ball, fuel, hull — plus the radar.
import { PALETTE, DEG, WORLD, clamp } from './config.js';
import { RUNWAYS, PLACES, coastlinePoints } from './world.js';
import { formatClock } from './missions.js';

const FONT = '"Avenir Next", "Segoe UI", system-ui, sans-serif';
const MONO = '"SF Mono", Consolas, "Roboto Mono", monospace';

function panel(ctx, x, y, w, h, r = 10) {
  ctx.fillStyle = PALETTE.hudInk;
  ctx.strokeStyle = PALETTE.hudEdge;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
  ctx.stroke();
}

function label(ctx, text, x, y, size, color, align = 'left') {
  ctx.fillStyle = color;
  ctx.font = `600 ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, x, y);
}

function value(ctx, text, x, y, size, color, align = 'left') {
  ctx.fillStyle = color;
  ctx.font = `700 ${size}px ${MONO}`;
  ctx.textAlign = align;
  ctx.fillText(text, x, y);
}

function headingDeg(heading) {
  return ((heading / DEG) % 360 + 360) % 360;
}

function drawCompassTape(ctx, state, w) {
  const hdg = headingDeg(state.plane.heading);
  const tw = 360;
  const x0 = w / 2 - tw / 2;
  panel(ctx, x0, 14, tw, 40);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0 + 4, 16, tw - 8, 36);
  ctx.clip();
  const pxPerDeg = 3.1;
  const names = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
  for (let d = -60; d <= 60; d += 5) {
    const deg = ((Math.round(hdg / 5) * 5 + d) % 360 + 360) % 360;
    const x = w / 2 + (deg - hdg + (Math.abs(deg - hdg) > 180 ? (deg < hdg ? 360 : -360) : 0)) * pxPerDeg;
    if (x < x0 + 6 || x > x0 + tw - 6) continue;
    const major = deg % 45 === 0;
    ctx.strokeStyle = 'rgba(220, 240, 255, 0.8)';
    ctx.beginPath();
    ctx.moveTo(x, 50);
    ctx.lineTo(x, major ? 40 : 45);
    ctx.stroke();
    if (names[deg]) label(ctx, names[deg], x, 34, 13, PALETTE.hudText, 'center');
    else if (deg % 30 === 0) label(ctx, String(deg / 10).padStart(2, '0'), x, 34, 10, 'rgba(220,240,255,0.75)', 'center');
  }
  ctx.restore();
  ctx.fillStyle = PALETTE.hudAmber;
  ctx.beginPath();
  ctx.moveTo(w / 2 - 6, 56);
  ctx.lineTo(w / 2 + 6, 56);
  ctx.lineTo(w / 2, 63);
  ctx.closePath();
  ctx.fill();
  value(ctx, String(Math.round(hdg)).padStart(3, '0') + '°', w / 2, 82, 15, PALETTE.hudAmber, 'center');
}

function drawDial(ctx, x, y, r, title, needleAngle, ticks, redFrom, digital) {
  ctx.fillStyle = '#101c26';
  ctx.strokeStyle = 'rgba(170, 220, 255, 0.5)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  for (const t of ticks) {
    const a = t.angle;
    ctx.strokeStyle = t.red ? PALETTE.hudRed : 'rgba(230, 245, 255, 0.85)';
    ctx.lineWidth = t.red ? 3 : 1.4;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * r * 0.8, y + Math.sin(a) * r * 0.8);
    ctx.lineTo(x + Math.cos(a) * r * 0.94, y + Math.sin(a) * r * 0.94);
    ctx.stroke();
    if (t.text) label(ctx, t.text, x + Math.cos(a) * r * 0.58, y + Math.sin(a) * r * 0.58 + 4, 10, PALETTE.hudText, 'center');
  }
  if (redFrom !== null) {
    ctx.strokeStyle = PALETTE.hudRed;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.9, redFrom, Math.PI * 0.75);
    ctx.stroke();
  }
  ctx.strokeStyle = '#ffd76a';
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(x - Math.cos(needleAngle) * r * 0.16, y - Math.sin(needleAngle) * r * 0.16);
  ctx.lineTo(x + Math.cos(needleAngle) * r * 0.74, y + Math.sin(needleAngle) * r * 0.74);
  ctx.stroke();
  ctx.fillStyle = '#dfe9f2';
  ctx.beginPath();
  ctx.arc(x, y, 3.2, 0, Math.PI * 2);
  ctx.fill();
  label(ctx, title, x, y + r + 13, 9.5, 'rgba(200, 225, 245, 0.8)', 'center');
  if (digital) value(ctx, digital, x, y + r * 0.52, 12.5, PALETTE.hudText, 'center');
}

// Map a 0..1 fraction onto the dial sweep (135°..405°, aviation style).
const sweep = (f) => Math.PI * 0.75 + clamp(f, 0, 1) * Math.PI * 1.5;

function drawAttitude(ctx, x, y, r, plane) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(x, y);
  ctx.rotate(-plane.roll);
  const pitchPx = clamp(plane.pitch, -0.6, 0.6) * r * 1.1;
  ctx.fillStyle = '#3f7fbf';
  ctx.fillRect(-r, -r + pitchPx - r, r * 2, r * 2);
  ctx.fillStyle = '#8a6844';
  ctx.fillRect(-r, pitchPx, r * 2, r * 2);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-r, pitchPx);
  ctx.lineTo(r, pitchPx);
  ctx.stroke();
  for (const off of [-0.35, 0.35]) {
    ctx.beginPath();
    ctx.moveTo(-r * 0.34, pitchPx + off * r);
    ctx.lineTo(r * 0.34, pitchPx + off * r);
    ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = 'rgba(170, 220, 255, 0.5)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  // Fixed aircraft symbol.
  ctx.strokeStyle = '#ffd76a';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x - r * 0.62, y);
  ctx.lineTo(x - r * 0.18, y);
  ctx.lineTo(x, y + r * 0.14);
  ctx.lineTo(x + r * 0.18, y);
  ctx.lineTo(x + r * 0.62, y);
  ctx.stroke();
  label(ctx, 'ATTITUDE', x, y + r + 13, 9.5, 'rgba(200, 225, 245, 0.8)', 'center');
}

function drawBarGauge(ctx, x, y, w, h, frac, title, text, danger) {
  label(ctx, title, x, y - 5, 9.5, 'rgba(200, 225, 245, 0.8)');
  ctx.fillStyle = '#101c26';
  ctx.strokeStyle = 'rgba(170, 220, 255, 0.4)';
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 4);
  ctx.fill();
  ctx.stroke();
  const color = danger ? PALETTE.hudRed : frac < 0.3 ? PALETTE.hudAmber : PALETTE.hudGreen;
  ctx.fillStyle = color;
  if (frac > 0.01) {
    ctx.beginPath();
    ctx.roundRect(x + 1.5, y + 1.5, (w - 3) * clamp(frac, 0, 1), h - 3, 3);
    ctx.fill();
  }
  value(ctx, text, x + w + 8, y + h - 2, 13, PALETTE.hudText);
}

// The radar: a north-up plot of the whole island on one dial. Coastline from
// the world's own island field, both strips, the storm banks, the active
// objective blinking amber, and the aircraft as an arrow that turns with her
// heading — all from live world coordinates, redrawn every frame.
function drawRadar(ctx, state, world, cx, cy, r) {
  const p = state.plane;
  ctx.save();
  ctx.fillStyle = '#0b1723';
  ctx.strokeStyle = 'rgba(170, 220, 255, 0.5)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();

  const HALF = 2050; // metres of world across the radius: island plus its sea marks
  const s = r / HALF;
  const mx = (x) => cx + (x - WORLD.islandCx) * s;
  const mz = (z) => cy + (z - WORLD.islandCz) * s;

  // The island landmass, filled from the coastline loop, sand-rimmed.
  const coast = coastlinePoints();
  ctx.beginPath();
  coast.forEach((pt, i) => (i ? ctx.lineTo(mx(pt.x), mz(pt.z)) : ctx.moveTo(mx(pt.x), mz(pt.z))));
  ctx.closePath();
  ctx.fillStyle = '#26502c';
  ctx.fill();
  ctx.strokeStyle = 'rgba(236, 217, 160, 0.75)';
  ctx.lineWidth = 1.1;
  ctx.stroke();

  // Range ring and cross ticks.
  ctx.strokeStyle = 'rgba(160, 220, 255, 0.16)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - r, cy); ctx.lineTo(cx - r * 0.88, cy);
  ctx.moveTo(cx + r * 0.88, cy); ctx.lineTo(cx + r, cy);
  ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy - r * 0.88);
  ctx.moveTo(cx, cy + r * 0.88); ctx.lineTo(cx, cy + r);
  ctx.stroke();

  // Storm banks: soft grey blobs where the standing storms sit.
  if (world) {
    ctx.fillStyle = 'rgba(130, 146, 162, 0.5)';
    for (const c of world.clouds) {
      if (!c.storm) continue;
      ctx.beginPath();
      ctx.arc(mx(c.x), mz(c.z), Math.max(2.2, c.s * s * 1.2), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Both runways as pale bars at their true headings.
  ctx.strokeStyle = '#e8e4da';
  ctx.lineWidth = 1.7;
  for (const rwy of RUNWAYS) {
    const a = rwy.length / 2;
    const dx = Math.sin(rwy.heading) * a;
    const dz = -Math.cos(rwy.heading) * a;
    ctx.beginPath();
    ctx.moveTo(mx(rwy.cx - dx), mz(rwy.cz - dz));
    ctx.lineTo(mx(rwy.cx + dx), mz(rwy.cz + dz));
    ctx.stroke();
  }

  // The lighthouse, a steady warm dot.
  ctx.fillStyle = 'rgba(255, 240, 170, 0.95)';
  ctx.beginPath();
  ctx.arc(mx(PLACES.lighthouse.x), mz(PLACES.lighthouse.z), 1.8, 0, Math.PI * 2);
  ctx.fill();

  // The sweep, turning quietly under everything that matters.
  const sa = state.time * 0.8;
  ctx.strokeStyle = 'rgba(125, 255, 154, 0.30)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.sin(sa) * r, cy - Math.cos(sa) * r);
  ctx.stroke();

  // The active objective: a solid amber dot with a pulsing ring.
  const m = state.mission;
  if (m && m.target) {
    const tx = mx(m.target.x);
    const ty = mz(m.target.z);
    const pulse = (state.time * 0.9) % 1;
    ctx.strokeStyle = `rgba(255, 182, 72, ${0.85 * (1 - pulse)})`;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(tx, ty, 2.5 + pulse * 5.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = PALETTE.hudAmber;
    ctx.beginPath();
    ctx.arc(tx, ty, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }

  // The aircraft: a white arrow at her true position, turned to her heading.
  ctx.translate(mx(p.x), mz(p.z));
  ctx.rotate(p.heading);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = PALETTE.hudAmber;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(0, -6.4);
  ctx.lineTo(4.1, 5.2);
  ctx.lineTo(0, 2.6);
  ctx.lineTo(-4.1, 5.2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  label(ctx, 'N', cx, cy - r + 12, 9, 'rgba(200, 225, 245, 0.85)', 'center');
  label(ctx, 'RADAR', cx, cy + r + 13, 9.5, 'rgba(200, 225, 245, 0.8)', 'center');
}

export function drawHud(ctx, state, world, w, h) {
  const p = state.plane;
  const m = state.mission;
  const altFt = Math.round(p.y * 3.281);
  const spdKt = Math.round(p.speed * 1.944);
  const vsFpm = Math.round(p.vy * 196.85);

  drawCompassTape(ctx, state, w);

  // Altitude block, top-left.
  panel(ctx, 16, 14, 168, 74);
  label(ctx, 'ALTITUDE', 28, 36, 10.5, 'rgba(190, 220, 245, 0.85)');
  value(ctx, `${altFt}`, 28, 66, 27, PALETTE.hudText);
  label(ctx, 'ft', 118, 66, 12, 'rgba(190, 220, 245, 0.8)');
  label(ctx, `VS ${vsFpm >= 0 ? '+' : ''}${vsFpm} fpm`, 28, 82, 11, vsFpm < -700 ? PALETTE.hudAmber : 'rgba(190, 220, 245, 0.85)');

  // Speed block, top-right.
  panel(ctx, w - 184, 14, 168, 74);
  label(ctx, 'AIRSPEED', w - 172, 36, 10.5, 'rgba(190, 220, 245, 0.85)');
  value(ctx, `${spdKt}`, w - 172, 66, 27, p.stress ? PALETTE.hudRed : PALETTE.hudText);
  label(ctx, 'kt', w - 108, 66, 12, 'rgba(190, 220, 245, 0.8)');
  label(ctx, `THR ${Math.round(p.throttle * 100)}%`, w - 172, 82, 11, 'rgba(190, 220, 245, 0.85)');

  // Mission card, right side under the speed block.
  if (m) {
    const left = Math.max(0, m.def.timeLimit - m.t);
    panel(ctx, w - 300, 100, 284, 96);
    label(ctx, m.def.name.toUpperCase(), w - 288, 122, 12, PALETTE.hudAmber);
    label(ctx, m.objectiveText, w - 288, 142, 13.5, PALETTE.hudText);
    const progress = m.def.id === 'rings' ? `${m.ringIndex}/${m.def.rings.length} rings` : m.def.id === 'patrol' ? `${m.checkpointIndex}/3 marks` : m.def.id === 'rescue' ? (m.buoy ? 'buoy away' : m.dropped ? 'splashdown' : 'buoy aboard') : 'one crate, one strip';
    label(ctx, progress, w - 288, 160, 11.5, 'rgba(200, 228, 248, 0.9)');
    value(ctx, formatClock(left), w - 28, 160, 13, left < 30 ? PALETTE.hudRed : PALETTE.hudText, 'right');
    if (m.target) {
      const bearing = ((Math.atan2(m.target.x - p.x, -(m.target.z - p.z)) / DEG) % 360 + 360) % 360;
      const rel = ((bearing - headingDeg(p.heading) + 540) % 360) - 180;
      label(ctx, `TARGET ${m.targetDist} m`, w - 288, 178, 11.5, 'rgba(200, 228, 248, 0.9)');
      ctx.save();
      ctx.translate(w - 52, 168);
      ctx.rotate(rel * DEG);
      ctx.fillStyle = PALETTE.hudAmber;
      ctx.beginPath();
      ctx.moveTo(0, -9); ctx.lineTo(5.5, 7); ctx.lineTo(0, 3.4); ctx.lineTo(-5.5, 7);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    value(ctx, `${m.score}`, w - 28, 122, 13, PALETTE.hudText, 'right');
    ctx.textAlign = 'left';
  }

  // Centre warnings.
  const warn = [];
  if (!p.onGround && p.stalled) warn.push(['STALL', PALETTE.hudRed]);
  if (p.stress) warn.push(['OVERSPEED — SLOW DOWN', PALETTE.hudRed]);
  if (p.engineOut) warn.push(['ENGINE OUT — GLIDE HER DOWN', PALETTE.hudAmber]);
  else if (p.fuel < 25 && p.fuel > 0) warn.push(['FUEL LOW', PALETTE.hudAmber]);
  if (p.turbulence) warn.push(['TURBULENCE', PALETTE.hudAmber]);
  warn.forEach(([text, color], i) => {
    if (Math.sin(state.time * 6) > -0.35 || color === PALETTE.hudAmber) {
      ctx.font = `800 25px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillStyle = color;
      ctx.fillText(text, w / 2, 138 + i * 32);
      ctx.textAlign = 'left';
    }
  });

  // Announcement banner.
  if (state.banner && state.time < state.banner.until) {
    ctx.textAlign = 'center';
    ctx.font = `800 30px ${FONT}`;
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0, 20, 40, 0.65)';
    ctx.shadowBlur = 10;
    ctx.fillText(state.banner.text, w / 2, 196);
    if (state.banner.sub) {
      ctx.font = `600 15.5px ${FONT}`;
      ctx.fillStyle = 'rgba(235, 246, 255, 0.95)';
      ctx.fillText(state.banner.sub, w / 2, 220);
    }
    ctx.shadowBlur = 0;
    ctx.textAlign = 'left';
  }

  // The instrument panel along the bottom.
  const ph = 118;
  const py = h - ph;
  ctx.fillStyle = 'rgba(10, 17, 24, 0.88)';
  ctx.fillRect(0, py, w, ph);
  const grad = ctx.createLinearGradient(0, py, 0, py + ph);
  grad.addColorStop(0, 'rgba(120, 180, 230, 0.20)');
  grad.addColorStop(0.06, 'rgba(120, 180, 230, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, py, w, ph);
  ctx.strokeStyle = 'rgba(150, 210, 255, 0.35)';
  ctx.beginPath();
  ctx.moveTo(0, py + 0.5);
  ctx.lineTo(w, py + 0.5);
  ctx.stroke();

  const cy = py + 52;
  const spdTicks = [0, 50, 100, 150, 200].map((v) => ({ angle: sweep(v / 200), text: String(v) }));
  drawDial(ctx, 92, cy, 40, 'AIRSPEED kt', sweep(spdKt / 200), spdTicks, sweep(189 / 200), null);
  const altTicks = [0, 500, 1000, 1500, 2000].map((v) => ({ angle: sweep(v / 2000), text: v === 0 ? '0' : String(v / 100) }));
  drawDial(ctx, 218, cy, 40, 'ALTIMETER ×100 ft', sweep(altFt / 2000), altTicks, null, null);
  drawAttitude(ctx, 344, cy, 40, p);
  drawBarGauge(ctx, 440, cy - 32, 190, 15, p.throttle, 'THROTTLE', `${Math.round(p.throttle * 100)}%`, false);
  drawBarGauge(ctx, 440, cy - 4, 190, 15, p.fuel / 100, 'FUEL', `${Math.round(p.fuel)}`, p.fuel <= 0);
  drawBarGauge(ctx, 440, cy + 24, 190, 15, p.hull / 100, 'AIRFRAME', `${Math.round(p.hull)}%`, p.hull < 35);
  // The radar, in the panel gap right of the gauges.
  drawRadar(ctx, state, world, 862, cy, 46);
  // Mission clock + campaign score, right of the gauges.
  label(ctx, 'MISSION TIME', w - 268, cy - 30, 10.5, 'rgba(190, 220, 245, 0.85)');
  if (m) value(ctx, formatClock(Math.max(0, m.def.timeLimit - m.t)), w - 268, cy - 6, 24, PALETTE.hudText);
  label(ctx, 'SORTIE SCORE', w - 268, cy + 22, 10.5, 'rgba(190, 220, 245, 0.85)');
  if (m) value(ctx, `${m.score}`, w - 268, cy + 46, 24, PALETTE.hudAmber);
  label(ctx, `CAMPAIGN ${state.campaignScore}`, w - 118, cy + 46, 12, 'rgba(200, 228, 248, 0.9)');
  if (m && m.def.wind) label(ctx, 'WIND: SE GUSTING', w - 118, cy - 6, 12, PALETTE.hudAmber);

  label(ctx, 'W/S pitch · A/D bank · SHIFT/Q throttle · F drop · mouse steers · M mute', 16, h - 8, 10.5, 'rgba(170, 200, 225, 0.55)');
}
