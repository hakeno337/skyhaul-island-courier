// Skyhaul 3D — screenshot staging. The kit takes its pictures by loading
// the game with ?shot=<name>; each name parks the game in one deterministic,
// honest scene (real state, real renderer, frozen clock) for the camera.
// The camera snap itself happens in the scene module: staging just sets
// state.snapCam and the next frame is composed from directly behind her.

import { RUNWAYS } from './world.js';
import { resetPlane } from './flight.js';
import { startMission } from './missions.js';

export function stageShot(state, name) {
  state.frozen = true;
  state.time = 12;
  state.snapCam = true;
  if (name === 'flight') {
    startMission(state, 0);
    const p = state.plane;
    // Cover staging: on the SE approach line to ring 2, close chase camera
    // pinned by camShot — plane large, banked, ring dead ahead on the nose,
    // village fields right of frame, the mountain ridge ahead-left.
    p.x = 461; p.y = 132; p.z = -511;
    p.heading = -0.50; p.pitch = 0.05; p.roll = -0.40;
    p.speed = 52; p.vy = 2.8; p.throttle = 0.62; p.fuel = 71; p.onGround = false;
    p.propSpin = 2.2;
    state.camShot = { back: 13, up: 4.2, side: 3.2, look: 30 };
    state.gNow = 1.09;
    state.gPeak = 1.36;
    const m = state.mission;
    m.ringIndex = 1;
    m.score = 250;
    m.t = 38;
    m.objectiveText = 'Ring 2 of 8';
    m.target = { x: 260, z: -880 };
    m.targetDist = 421;
    state.banner = null;
  } else if (name === 'landing') {
    startMission(state, 1);
    const p = state.plane;
    const s = RUNWAYS[1];
    // On short final for the dirt strip: 330 m out, 30 m up, sinking gently.
    p.x = s.cx + 135; p.z = s.cz + 301; p.y = 30;
    p.heading = s.heading; p.pitch = -0.05; p.roll = 0.03;
    p.speed = 36; p.vy = -1.9; p.throttle = 0.3; p.fuel = 58; p.onGround = false;
    p.propSpin = 1.4;
    state.mission.t = 74;
    state.mission.targetDist = 330;
    state.banner = null;
  } else if (name === 'rescue') {
    startMission(state, 3);
    const p = state.plane;
    // Low over the east sea, banking in toward the lit drop circle with
    // the island behind it, buoy already falling toward the boat.
    p.x = 1900; p.y = 36; p.z = 130;
    p.heading = 3.96; p.pitch = -0.02; p.roll = 0.16;
    p.speed = 44; p.vy = -0.8; p.throttle = 0.45; p.fuel = 66; p.onGround = false;
    p.propSpin = 1.9;
    const m = state.mission;
    m.t = 52;
    m.dropped = true;
    m.buoy = { x: 1810, y: 24, z: 215, vx: 0, vz: 0, vy: -6 };
    m.objectiveText = 'Buoy away — watch the splash';
    m.target = { x: 1720, z: 300 };
    m.targetDist = 262;
    state.banner = null;
  } else if (name === 'medevac') {
    startMission(state, 4);
    const p = state.plane;
    // Mid-route with the patient: banked left onto the south-west run for
    // Teluk Emas Field, the front wall standing dark on the horizon ahead.
    p.x = 350; p.y = 55; p.z = 80;
    p.heading = -2.08; p.pitch = -0.03; p.roll = -0.34;
    p.speed = 44; p.vy = -0.4; p.throttle = 0.55; p.fuel = 64; p.hull = 97; p.onGround = false;
    p.propSpin = 1.8;
    const m = state.mission;
    m.t = 95;
    m.comfort = 86;
    m.frontT = 105;
    m.objectiveText = 'Fly her to Teluk Emas Field — under 1.4 G';
    m.target = { x: RUNWAYS[0].cx, z: RUNWAYS[0].cz };
    m.targetDist = 940;
    state.gNow = 1.08;
    state.gPeak = 1.38;
    state.campaign = { cash: 4550, bestStars: { 0: 3, 1: 2, 2: 2, 3: 1 } };
    state.campaignScore = 9100;
    state.banner = null;
  } else if (name === 'results') {
    startMission(state, 1);
    const p = state.plane;
    const s = RUNWAYS[1];
    resetPlane(p, s);
    p.x = s.cx; p.z = s.cz;
    p.throttle = 0; p.fuel = 43; p.hull = 96;
    state.result = {
      title: 'Delivered!',
      success: true,
      missionName: 'Sunset Delivery',
      note: 'The crate is down at Kampung Aer — a smooth touchdown.',
      lines: [['Delivery made', 600], ['Touchdown: smooth', 300], ['Time bonus', 1116], ['Fuel left', 387], ['Airframe intact', 384]],
      total: 2787,
      fee: 1800,
      stars: 3,
      breakdown: [['PRECISION', 3], ['TIME', 3], ['FUEL', 2], ['DAMAGE', 3]],
    };
    state.campaign = { cash: 3050, bestStars: { 0: 3, 1: 3 } };
    state.campaignScore = 2787;
    state.screen = 'done';
    state.banner = null;
  } else {
    // 'start' and anything else: the title screen over the orbiting island.
    // t=319 puts the slow orbit south-east of the island, looking north-west
    // across the main strip to the mountains, storm banks out of frame.
    state.screen = 'title';
    state.time = 319;
    resetPlane(state.plane, RUNWAYS[0]);
    // A campaign under way: two sorties flown well, cash in the tin.
    state.campaign = { cash: 3050, bestStars: { 0: 3, 1: 2 } };
    state.campaignScore = 5300;
    state.banner = null;
  }
}
