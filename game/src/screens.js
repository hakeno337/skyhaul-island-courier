// Skyhaul 3D — the screens that frame the flying: a title screen over a slow
// orbit of the island with the campaign strip (one pilot, one aircraft, the
// cash and stars she has earned), and the results / failure / crash panels
// that close a sortie — score lines, a landing breakdown in stars, and the
// fee the sortie paid. All share one house style: dark glass, amber headings.

import { PALETTE, CAMPAIGN } from './config.js';
import { MISSIONS } from './missions.js';

const FONT = '"Avenir Next", "Segoe UI", system-ui, sans-serif';
const MONO = '"SF Mono", Consolas, "Roboto Mono", monospace';

// Title-screen mission rows: y positions are shared by drawing and clicking.
export const TITLE_ROWS = { top: 262, rowH: 58, x: 340, w: 600 };

export function titleMissionAt(mx, my) {
  const { top, rowH, x, w } = TITLE_ROWS;
  if (mx < x || mx > x + w) return -1;
  const i = Math.floor((my - top) / rowH);
  return i >= 0 && i < MISSIONS.length ? i : -1;
}

function glassPanel(ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(7, 15, 24, 0.78)';
  ctx.strokeStyle = 'rgba(150, 210, 255, 0.4)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 14);
  ctx.fill();
  ctx.stroke();
}

const starStr = (n) => '★'.repeat(n) + '☆'.repeat(3 - n);
const totalStars = (state) => state.campaign ? Object.values(state.campaign.bestStars).reduce((s, v) => s + v, 0) : 0;

export function drawTitle(ctx, state, w, h) {
  // Warm gradient at the top so the masthead sits on sky, not on terrain.
  const g = ctx.createLinearGradient(0, 0, 0, 300);
  g.addColorStop(0, 'rgba(10, 26, 44, 0.55)');
  g.addColorStop(1, 'rgba(10, 26, 44, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, 300);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = `900 84px ${FONT}`;
  ctx.shadowColor = 'rgba(8, 24, 44, 0.7)';
  ctx.shadowBlur = 18;
  ctx.fillText('SKYHAUL', w / 2, 106);
  ctx.shadowBlur = 0;
  ctx.font = `700 24px ${FONT}`;
  ctx.fillStyle = PALETTE.hudAmber;
  ctx.fillText('I S L A N D   C O U R I E R', w / 2, 138);
  ctx.font = `700 15px ${FONT}`;
  ctx.fillStyle = 'rgba(168, 224, 255, 0.97)';
  ctx.fillText('ISLAND COURIER CAMPAIGN · MEDEVAC G-LIMIT · STORM WINDOW', w / 2, 164);
  ctx.font = `500 16px ${FONT}`;
  ctx.fillStyle = 'rgba(238, 247, 255, 0.92)';
  ctx.fillText('One little prop plane, one island, and everybody\'s parcels — Teluk Emas, golden hour.', w / 2, 186);

  const { top, rowH, x, w: rw } = TITLE_ROWS;

  // The campaign strip: who flies, what she flies, what she has earned.
  const cash = state.campaign ? state.campaign.cash : 0;
  glassPanel(ctx, x, 196, rw, 46);
  ctx.textAlign = 'left';
  ctx.fillStyle = PALETTE.hudText;
  ctx.font = `700 14.5px ${FONT}`;
  ctx.fillText(`PILOT ${CAMPAIGN.pilot.toUpperCase()} · ${CAMPAIGN.aircraft} · ${CAMPAIGN.reg}`, x + 20, 225);
  ctx.textAlign = 'right';
  ctx.fillStyle = PALETTE.hudAmber;
  ctx.font = `800 15px ${MONO}`;
  ctx.fillText(`$ ${cash.toLocaleString('en-US')}  ·  ★ ${totalStars(state)}/15`, x + rw - 20, 225);
  ctx.textAlign = 'left';

  // The sortie board.
  MISSIONS.forEach((mission, i) => {
    const y = top + i * rowH;
    glassPanel(ctx, x, y, rw, rowH - 8);
    ctx.fillStyle = PALETTE.hudAmber;
    ctx.font = `800 20px ${FONT}`;
    ctx.fillText(`${i + 1}.  ${mission.name}`, x + 22, y + 27);
    ctx.fillStyle = 'rgba(226, 240, 252, 0.92)';
    ctx.font = `500 13px ${FONT}`;
    ctx.fillText(mission.sub, x + 22, y + 45);
    const best = state.campaign ? (state.campaign.bestStars[i] || 0) : 0;
    ctx.textAlign = 'right';
    ctx.fillStyle = best > 0 ? PALETTE.hudAmber : 'rgba(160, 205, 240, 0.5)';
    ctx.font = `700 15px ${FONT}`;
    ctx.fillText(starStr(best), x + rw - 20, y + 27);
    ctx.fillStyle = 'rgba(160, 205, 240, 0.85)';
    ctx.font = `700 12px ${MONO}`;
    ctx.fillText(`FEE $${mission.fee.toLocaleString('en-US')}`, x + rw - 20, y + 45);
    ctx.textAlign = 'left';
  });

  // Controls card.
  const cy = top + MISSIONS.length * rowH + 12;
  glassPanel(ctx, x, cy, rw, 84);
  ctx.fillStyle = PALETTE.hudAmber;
  ctx.font = `700 13px ${FONT}`;
  ctx.fillText('CONTROLS', x + 22, cy + 24);
  ctx.fillStyle = 'rgba(232, 244, 255, 0.95)';
  ctx.font = `500 14.5px ${FONT}`;
  ctx.fillText('Pitch  W / S or ↑ / ↓        Bank  A / D or ← / →        Throttle  SHIFT / Q (or wheel)', x + 22, cy + 47);
  ctx.fillText('The mouse steers too — ease her around, watch the stall, mind the fuel.', x + 22, cy + 69);

  if (Math.sin(state.time * 2.6) > -0.2) {
    const prompt = 'Press 1–5, or click a sortie, to fly';
    ctx.font = `800 19px ${FONT}`;
    const pw = ctx.measureText(prompt).width + 44;
    ctx.fillStyle = 'rgba(7, 15, 24, 0.72)';
    ctx.beginPath();
    ctx.roundRect(w / 2 - pw / 2, cy + 100, pw, 34, 17);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(prompt, w / 2, cy + 123);
    ctx.textAlign = 'left';
  }
}

function drawEndPanel(ctx, state, w, h, accent) {
  const r = state.result;
  if (!r) return;
  const bd = r.breakdown || null;
  const pw = 560;
  const ph = 208 + r.lines.length * 30 + (bd ? 30 + bd.length * 26 : 0) + (r.success ? 40 : 0) + 92;
  const x = (w - pw) / 2;
  const y = (h - ph) / 2 - 20;
  glassPanel(ctx, x, y, pw, ph);
  ctx.textAlign = 'center';
  ctx.fillStyle = accent;
  ctx.font = `900 40px ${FONT}`;
  ctx.fillText(r.title, w / 2, y + 58);
  ctx.fillStyle = 'rgba(200, 226, 246, 0.9)';
  ctx.font = `700 14px ${FONT}`;
  ctx.fillText(r.missionName.toUpperCase(), w / 2, y + 84);
  ctx.fillStyle = 'rgba(238, 247, 255, 0.95)';
  ctx.font = `500 15px ${FONT}`;
  wrapText(ctx, r.note, w / 2, y + 112, pw - 70, 20);

  let ly = y + 158;
  for (const [name, pts] of r.lines) {
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(226, 240, 252, 0.92)';
    ctx.font = `500 16px ${FONT}`;
    ctx.fillText(name, x + 44, ly);
    ctx.textAlign = 'right';
    ctx.fillStyle = pts < 0 ? PALETTE.hudRed : PALETTE.hudText;
    ctx.font = `700 16px ${MONO}`;
    ctx.fillText(`${pts}`, x + pw - 44, ly);
    ly += 30;
  }
  ctx.strokeStyle = 'rgba(150, 210, 255, 0.35)';
  ctx.beginPath();
  ctx.moveTo(x + 44, ly - 12);
  ctx.lineTo(x + pw - 44, ly - 12);
  ctx.stroke();
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.font = `800 19px ${FONT}`;
  ctx.fillText('SORTIE TOTAL', x + 44, ly + 18);
  ctx.textAlign = 'right';
  ctx.fillStyle = PALETTE.hudAmber;
  ctx.font = `800 21px ${MONO}`;
  ctx.fillText(`${r.total}`, x + pw - 44, ly + 18);
  ly += 48;

  if (bd) {
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.hudAmber;
    ctx.font = `700 12.5px ${FONT}`;
    ctx.fillText('LANDING BREAKDOWN', x + 44, ly + 6);
    ly += 30;
    for (const [name, stars] of bd) {
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(226, 240, 252, 0.92)';
      ctx.font = `500 14.5px ${FONT}`;
      ctx.fillText(name, x + 44, ly);
      ctx.textAlign = 'right';
      ctx.fillStyle = PALETTE.hudAmber;
      ctx.font = `700 16px ${FONT}`;
      ctx.fillText(starStr(stars).split('').join(' '), x + pw - 44, ly);
      ly += 26;
    }
    ly += 4;
  }

  if (r.success) {
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 17px ${FONT}`;
    ctx.fillText('FEE EARNED', x + 44, ly + 16);
    ctx.textAlign = 'right';
    ctx.fillStyle = PALETTE.hudAmber;
    ctx.font = `800 19px ${MONO}`;
    ctx.fillText(`${starStr(r.stars || 0).split('').join(' ')}   $${(r.fee || 0).toLocaleString('en-US')}`, x + pw - 44, ly + 16);
    ly += 40;
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(200, 226, 246, 0.9)';
  ctx.font = `600 14.5px ${FONT}`;
  const cash = state.campaign ? state.campaign.cash : 0;
  ctx.fillText(`Campaign  $${cash.toLocaleString('en-US')}  ·  ★ ${totalStars(state)}/15  ·  score ${state.campaignScore}`, w / 2, ly + 22);
  ctx.fillText('ENTER  next sortie      R  fly it again      T  title', w / 2, ly + 50);
  ctx.textAlign = 'left';
}

function wrapText(ctx, text, cx, y, maxW, lineH) {
  const words = text.split(' ');
  let line = '';
  let yy = y;
  for (const word of words) {
    const trial = line ? line + ' ' + word : word;
    if (ctx.measureText(trial).width > maxW && line) {
      ctx.fillText(line, cx, yy);
      line = word;
      yy += lineH;
    } else line = trial;
  }
  if (line) ctx.fillText(line, cx, yy);
}

export function drawResults(ctx, state, w, h) {
  drawEndPanel(ctx, state, w, h, PALETTE.hudGreen);
}

export function drawFailed(ctx, state, w, h) {
  drawEndPanel(ctx, state, w, h, PALETTE.hudAmber);
}

export function drawCrashed(ctx, state, w, h) {
  const g = ctx.createRadialGradient(w / 2, h / 2, h * 0.2, w / 2, h / 2, h * 0.85);
  g.addColorStop(0, 'rgba(60, 8, 4, 0.12)');
  g.addColorStop(1, 'rgba(60, 8, 4, 0.5)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  drawEndPanel(ctx, state, w, h, PALETTE.hudRed);
}
