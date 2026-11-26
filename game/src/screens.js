// Skyhaul — the screens that frame the flying: a title screen over a slow
// orbit of the island, and the results / failure / crash panels that close
// a sortie. All of them share one house style: dark glass, amber headings.

import { PALETTE } from './config.js';
import { MISSIONS } from './missions.js';

const FONT = '"Avenir Next", "Segoe UI", system-ui, sans-serif';
const MONO = '"SF Mono", Consolas, "Roboto Mono", monospace';

// Title-screen mission rows: y positions are shared by drawing and clicking.
export const TITLE_ROWS = { top: 356, rowH: 64, x: 340, w: 600 };

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

export function drawTitle(ctx, state, w, h) {
  // Warm gradient at the top so the masthead sits on sky, not on terrain.
  const g = ctx.createLinearGradient(0, 0, 0, 300);
  g.addColorStop(0, 'rgba(10, 26, 44, 0.55)');
  g.addColorStop(1, 'rgba(10, 26, 44, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, 300);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = `900 92px ${FONT}`;
  ctx.shadowColor = 'rgba(8, 24, 44, 0.7)';
  ctx.shadowBlur = 18;
  ctx.fillText('SKYHAUL', w / 2, 138);
  ctx.shadowBlur = 0;
  ctx.font = `700 25px ${FONT}`;
  ctx.fillStyle = PALETTE.hudAmber;
  ctx.fillText('I S L A N D   C O U R I E R', w / 2, 178);
  ctx.font = `500 16.5px ${FONT}`;
  ctx.fillStyle = 'rgba(238, 247, 255, 0.92)';
  ctx.fillText('One little prop plane, one island, and everybody\'s parcels — Teluk Emas, golden hour.', w / 2, 208);

  // The sortie board.
  const { top, rowH, x, w: rw } = TITLE_ROWS;
  ctx.textAlign = 'left';
  MISSIONS.forEach((mission, i) => {
    const y = top + i * rowH;
    glassPanel(ctx, x, y, rw, rowH - 10);
    ctx.fillStyle = PALETTE.hudAmber;
    ctx.font = `800 21px ${FONT}`;
    ctx.fillText(`${i + 1}.  ${mission.name}`, x + 22, y + 30);
    ctx.fillStyle = 'rgba(226, 240, 252, 0.92)';
    ctx.font = `500 13.5px ${FONT}`;
    ctx.fillText(mission.sub, x + 22, y + 50);
    ctx.fillStyle = 'rgba(160, 205, 240, 0.85)';
    ctx.font = `700 12px ${MONO}`;
    ctx.textAlign = 'right';
    ctx.fillText('FLY ▸', x + rw - 20, y + 36);
    ctx.textAlign = 'left';
  });

  // Controls card.
  const cy = top + MISSIONS.length * rowH + 14;
  glassPanel(ctx, x, cy, rw, 92);
  ctx.fillStyle = PALETTE.hudAmber;
  ctx.font = `700 13px ${FONT}`;
  ctx.fillText('CONTROLS', x + 22, cy + 24);
  ctx.fillStyle = 'rgba(232, 244, 255, 0.95)';
  ctx.font = `500 14.5px ${FONT}`;
  ctx.fillText('Pitch  W / S or ↑ / ↓        Bank  A / D or ← / →        Throttle  SHIFT / Q (or wheel)', x + 22, cy + 48);
  ctx.fillText('The mouse steers too — ease her around, watch the stall, mind the fuel.', x + 22, cy + 72);

  if (Math.sin(state.time * 2.6) > -0.2) {
    const prompt = 'Press 1, 2 or 3 — or click a sortie — to fly';
    ctx.font = `800 19px ${FONT}`;
    const pw = ctx.measureText(prompt).width + 44;
    ctx.fillStyle = 'rgba(7, 15, 24, 0.72)';
    ctx.beginPath();
    ctx.roundRect(w / 2 - pw / 2, cy + 116, pw, 34, 17);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(prompt, w / 2, cy + 139);
    ctx.textAlign = 'left';
  }
  if (state.campaignScore > 0) {
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.hudAmber;
    ctx.font = `700 16px ${MONO}`;
    ctx.fillText(`CAMPAIGN SCORE  ${state.campaignScore}`, w / 2, 246);
    ctx.textAlign = 'left';
  }
}

function drawEndPanel(ctx, state, w, h, accent) {
  const r = state.result;
  if (!r) return;
  const pw = 560;
  const ph = 330 + r.lines.length * 30;
  const x = (w - pw) / 2;
  const y = (h - ph) / 2 - 30;
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
    ctx.fillStyle = PALETTE.hudText;
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
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(200, 226, 246, 0.9)';
  ctx.font = `600 14.5px ${FONT}`;
  ctx.fillText(`Campaign score  ${state.campaignScore}`, w / 2, ly + 48);
  ctx.fillText('ENTER  next sortie      R  fly it again      T  title', w / 2, ly + 76);
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
