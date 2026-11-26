// Skyhaul 3D — the four sorties, the same missions as the 2D game: a ring
// circuit against the clock, a delivery that ends in a landing on a short
// dirt strip, a storm patrol through checkpoints in gusting wind, and a
// low-level rescue drop over the sea. Same goals, same scoring shape.

import { SCORE } from './config.js';
import { RUNWAYS, PLACES } from './world.js';
import { resetPlane } from './flight.js';

const RING_Y = 120;

export const MISSIONS = [
  {
    id: 'rings',
    name: 'Ring Run',
    sub: 'Thread all 8 golden rings, then the clock pays you.',
    brief: 'Take off north, follow the golden rings around the island. Every ring is 250 points; whatever time is left at the last ring pays 6 a second.',
    startRunway: 0,
    timeLimit: 175,
    rings: [
      { x: -260, y: RING_Y, z: -350 },
      { x: 260, y: 150, z: -880 },
      { x: 900, y: 130, z: -1080 },
      { x: 1330, y: 110, z: -480 },
      { x: 1080, y: 140, z: 180 },
      { x: 430, y: 120, z: 620 },
      { x: -420, y: 150, z: 420 },
      { x: -700, y: 120, z: -260 },
    ],
  },
  {
    id: 'delivery',
    name: 'Sunset Delivery',
    sub: 'Medicine for Kampung Aer — land it on their dirt strip.',
    brief: 'The village across the island needs this crate before dark. Fly east, find the short dirt strip at Kampung Aer, and put her down gently: a smooth touchdown pays 300, a firm one 150, a hard one nothing but dents.',
    startRunway: 0,
    timeLimit: 260,
    rings: [],
  },
  {
    id: 'patrol',
    name: 'Storm Patrol',
    sub: 'Three checkpoints, two storm banks, one gusty crosswind.',
    brief: 'Check the lighthouse, the north buoy and the west buoy, in that order, and thread between the storm banks if you dare — hail at speed tears panels. The crosswind pushes you south-east the whole way.',
    startRunway: 0,
    timeLimit: 230,
    rings: [],
    checkpoints: [
      { x: PLACES.lighthouse.x, z: PLACES.lighthouse.z, label: 'Lighthouse', maxY: 210 },
      { x: 300, z: -1850, label: 'North buoy', maxY: 260 },
      { x: -1750, z: -300, label: 'West buoy', maxY: 260 },
    ],
    wind: { x: 5.5, z: 4.5 },
  },
  {
    id: 'rescue',
    name: 'Harbour Rescue',
    sub: 'A fishing boat is taking water — put the pump buoy right on her.',
    brief: 'A fishing boat off the lighthouse point is taking water and needs the pump buoy. Fly out low and slow: you must be under 150 ft when you let go (F to drop) or the fall ruins the aim. The closer the splash lands to the lit circle, the bigger the pay — inside 30 m is a bullseye.',
    startRunway: 0,
    timeLimit: 200,
    rings: [],
    drop: { x: 1720, z: 300 },
    dropMaxY: 45.7, // metres = 150 ft: the low-altitude gate at the drop
  },
];

export function startMission(state, index) {
  const def = MISSIONS[index];
  state.missionIndex = index;
  resetPlane(state.plane, RUNWAYS[def.startRunway]);
  state.mission = {
    def,
    t: 0,
    score: 0,
    ringIndex: 0,
    checkpointIndex: 0,
    dropped: false,
    buoy: null,
    phase: 'fly',
    finished: false,
    objectiveText: '',
    target: null,
  };
  state.result = null;
  state.screen = 'fly';
  setBanner(state, def.name, def.sub, 3.4);
  updateObjective(state);
}

export function setBanner(state, text, sub, seconds) {
  state.banner = { text, sub: sub || '', until: state.time + seconds };
}

function updateObjective(state) {
  const m = state.mission;
  const p = state.plane;
  if (m.def.id === 'rings') {
    const r = m.def.rings[m.ringIndex];
    m.objectiveText = `Ring ${Math.min(m.ringIndex + 1, m.def.rings.length)} of ${m.def.rings.length}`;
    m.target = r ? { x: r.x, z: r.z } : null;
  } else if (m.def.id === 'delivery') {
    const s = RUNWAYS[1];
    m.objectiveText = 'Land on the Kampung dirt strip';
    m.target = { x: s.cx, z: s.cz };
  } else if (m.def.id === 'patrol') {
    const c = m.def.checkpoints[m.checkpointIndex];
    m.objectiveText = c ? `Checkpoint: ${c.label}` : 'All checkpoints visited';
    m.target = c ? { x: c.x, z: c.z } : null;
  } else if (m.def.id === 'rescue') {
    m.target = { x: m.def.drop.x, z: m.def.drop.z };
    if (m.buoy) m.objectiveText = 'Buoy away — watch the splash';
    else if (p.onGround) m.objectiveText = 'Get airborne, stay low, F drops the buoy';
    else if (p.y > m.def.dropMaxY) m.objectiveText = `Drop zone ahead — get below ${Math.round(m.def.dropMaxY * 3.281)} ft`;
    else m.objectiveText = 'In the gate — F to drop the buoy';
  }
  if (m.target) {
    m.targetDist = Math.round(Math.hypot(p.x - m.target.x, p.z - m.target.z));
  }
}

function finishMission(state, success, title, note, lines) {
  const m = state.mission;
  m.finished = true;
  const total = lines.reduce((s, l) => s + l[1], 0);
  state.campaignScore += total;
  state.result = { title, success, note, lines, total, missionName: m.def.name };
  state.screen = success ? 'done' : 'failed';
}

// Advance the mission. Flight events arrive from stepPlane; announcements and
// sound cues are pushed onto state.cues for main to play.
export function stepMission(state, ev, dt) {
  const m = state.mission;
  const p = state.plane;
  if (!m || m.finished) return;
  m.t += dt;

  // Storm patrol wind: a steady push plus a slow gust cycle.
  if (m.def.wind && !p.onGround) {
    const gust = 1 + 0.45 * Math.sin(state.time * 0.5) + 0.25 * Math.sin(state.time * 1.7);
    p.x += m.def.wind.x * gust * dt;
    p.z += m.def.wind.z * gust * dt;
  }

  if (m.def.id === 'rings') {
    const r = m.def.rings[m.ringIndex];
    if (r && !p.onGround) {
      const d = Math.hypot(p.x - r.x, p.y - r.y, p.z - r.z);
      if (d < 32) {
        m.score += SCORE.ring;
        m.ringIndex++;
        state.cues.push('ring');
        if (m.ringIndex >= m.def.rings.length) {
          const left = Math.max(0, m.def.timeLimit - m.t);
          finishMission(state, true, 'Circuit complete!', 'Every ring threaded. The island looks good from up here.', [
            ['Rings, 8 of 8', m.score],
            ['Time bonus', Math.round(left) * SCORE.perSecondLeft],
            ['Fuel left', Math.round(p.fuel) * SCORE.perFuelLeft],
            ['Airframe intact', Math.round(p.hull) * SCORE.perHullLeft],
          ]);
          state.cues.push('success');
          return;
        }
        setBanner(state, `Ring ${m.ringIndex} cleared`, `${m.def.rings.length - m.ringIndex} to go`, 1.6);
      }
    }
  }

  if (m.def.id === 'patrol') {
    const c = m.def.checkpoints[m.checkpointIndex];
    if (c && !p.onGround && p.y < c.maxY) {
      const d = Math.hypot(p.x - c.x, p.z - c.z);
      if (d < 115) {
        m.score += SCORE.checkpoint;
        m.checkpointIndex++;
        state.cues.push('checkpoint');
        if (m.checkpointIndex >= m.def.checkpoints.length) {
          const left = Math.max(0, m.def.timeLimit - m.t);
          finishMission(state, true, 'Patrol complete!', 'All three marks checked, storm and all.', [
            ['Checkpoints, 3 of 3', m.score],
            ['Time bonus', Math.round(left) * SCORE.perSecondLeft],
            ['Fuel left', Math.round(p.fuel) * SCORE.perFuelLeft],
            ['Airframe intact', Math.round(p.hull) * SCORE.perHullLeft],
          ]);
          state.cues.push('success');
          return;
        }
        setBanner(state, `${c.label} checked`, 'Next mark is lit', 1.8);
      }
    }
  }

  if (m.def.id === 'rescue') {
    // The drop itself: F lets go, but only inside the low-altitude gate.
    if (ev.drop && !m.dropped && !p.onGround) {
      if (p.y > m.def.dropMaxY) {
        if (state.time - (m.dropWarnAt || -9) > 1.8) {
          m.dropWarnAt = state.time;
          setBanner(state, 'Too high to drop', 'Get below 150 ft — from up there it drifts', 1.6);
        }
      } else {
        m.dropped = true;
        const hSpeed = p.speed * Math.cos(p.pitch * 0.55);
        m.buoy = {
          x: p.x, y: p.y - 2, z: p.z,
          vx: Math.sin(p.heading) * hSpeed * 0.94,
          vz: -Math.cos(p.heading) * hSpeed * 0.94,
          vy: p.vy,
        };
        setBanner(state, 'Buoy away!', 'Fingers crossed for the splash', 1.5);
        state.cues.push('checkpoint');
      }
    }
    // Once away, the buoy falls ballistically until it splashes.
    if (m.buoy) {
      const b = m.buoy;
      b.vy -= 16 * dt;
      b.x += b.vx * dt;
      b.z += b.vz * dt;
      b.y += b.vy * dt;
      if (b.y <= 0) {
        const dist = Math.round(Math.hypot(b.x - m.def.drop.x, b.z - m.def.drop.z));
        m.buoy = null;
        const left = Math.max(0, m.def.timeLimit - m.t);
        if (dist > 450) {
          finishMission(state, false, 'Wide of the mark', `The buoy splashed ${dist} m from the boat — far beyond her reach.`, [
            [`Drop accuracy: ${dist} m`, 0],
            ['Fuel left', Math.round(p.fuel) * SCORE.perFuelLeft],
            ['Airframe intact', Math.round(p.hull) * SCORE.perHullLeft],
          ]);
          state.cues.push('fail');
        } else {
          const accuracy = dist <= 30 ? SCORE.dropMax : dist <= 80 ? 420 : dist <= 160 ? 260 : 120;
          finishMission(state, true, dist <= 30 ? 'Bullseye!' : 'Supplies delivered!', `The buoy splashed ${dist} m from the boat — close enough for her crew to haul it in.`, [
            ['Rescue delivery', SCORE.rescueBase],
            [`Drop accuracy: ${dist} m`, accuracy],
            ['Time bonus', Math.round(left) * SCORE.perSecondLeft],
            ['Fuel left', Math.round(p.fuel) * SCORE.perFuelLeft],
            ['Airframe intact', Math.round(p.hull) * SCORE.perHullLeft],
          ]);
          state.cues.push('success');
        }
        return;
      }
    }
  }

  if (m.def.id === 'delivery' && ev.landed) {
    if (ev.landed.runway === RUNWAYS[1]) {
      const landingPay = ev.landed.quality === 'smooth' ? SCORE.softLandingBonus : ev.landed.quality === 'firm' ? 150 : 0;
      const left = Math.max(0, m.def.timeLimit - m.t);
      finishMission(state, true, 'Delivered!', `The crate is down at Kampung Aer — a ${ev.landed.quality} touchdown.`, [
        ['Delivery made', SCORE.deliveryBase],
        [`Touchdown: ${ev.landed.quality}`, landingPay],
        ['Time bonus', Math.round(left) * SCORE.perSecondLeft],
        ['Fuel left', Math.round(p.fuel) * SCORE.perFuelLeft],
        ['Airframe intact', Math.round(p.hull) * SCORE.perHullLeft],
      ]);
      state.cues.push('success');
      return;
    }
    finishMission(state, false, 'Wrong field', 'You landed safely — but the medicine was for Kampung Aer, across the island.', [
      ['Sortie flown', 0],
    ]);
    return;
  }

  // Landing anywhere ends the ring and patrol sorties too: home safe, partial pay.
  if (ev.landed && m.def.id !== 'delivery') {
    const home = ev.landed.runway === RUNWAYS[0];
    finishMission(state, m.score > 0, home ? 'Home safe' : 'Down in one piece', home ? 'You brought her home early.' : 'Not the home field, but a landing you walk away from.', [
      [m.def.id === 'rings' ? `Rings, ${m.ringIndex} of ${m.def.rings.length}` : m.def.id === 'patrol' ? `Checkpoints, ${m.checkpointIndex} of 3` : m.dropped ? 'Buoy dropped' : 'Buoy never dropped', m.score],
      ['Fuel left', Math.round(p.fuel) * SCORE.perFuelLeft],
      ['Airframe intact', Math.round(p.hull) * SCORE.perHullLeft],
    ]);
    return;
  }

  if (m.t > m.def.timeLimit && !m.finished) {
    finishMission(state, false, 'Out of time', 'The light went before the job was done.', [
      [m.def.id === 'rings' ? `Rings, ${m.ringIndex} of ${m.def.rings.length}` : m.def.id === 'patrol' ? `Checkpoints, ${m.checkpointIndex} of 3` : m.def.id === 'rescue' ? 'Buoy never dropped' : 'Distance covered', m.score],
    ]);
    state.cues.push('fail');
  }

  updateObjective(state);
}

export function formatClock(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
