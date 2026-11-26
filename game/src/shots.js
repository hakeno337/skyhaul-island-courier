// Skyhaul — screenshot staging. The kit takes its pictures by loading the game
// with ?shot=<name>; each name parks the game in one deterministic, honest
// scene (real state, real renderer, frozen clock) for the camera.

import { RUNWAYS } from './world.js';
import { resetPlane } from './flight.js';
import { startMission } from './missions.js';

function snapCameraBehind(state) {
  const p = state.plane;
  const cam = state.camera;
  cam.x = p.x - Math.sin(p.heading) * 30;
  cam.z = p.z + Math.cos(p.heading) * 30;
  cam.y = p.y + 11;
  cam.heading = p.heading;
  cam.pitch = p.pitch * 0.5;
  cam.roll = p.roll * 0.55;
  cam.shakeX = 0;
  cam.shakeY = 0;
}

export function stageShot(state, name) {
  state.frozen = true;
  state.time = 12;
  if (name === 'flight') {
    startMission(state, 0);
    const p = state.plane;
    // Airborne over the west shore, one ring banked, the next lit ahead-right.
    p.x = 60; p.y = 150; p.z = -520;
    p.heading = 0.1; p.pitch = 0.02; p.roll = -0.14;
    p.speed = 56; p.vy = 2.8; p.throttle = 0.62; p.fuel = 71; p.onGround = false;
    p.propSpin = 2.2;
    const m = state.mission;
    m.ringIndex = 1;
    m.score = 250;
    m.t = 38;
    m.objectiveText = 'Ring 2 of 8';
    m.target = { x: 260, z: -880 };
    m.targetDist = 412;
    state.banner = null;
    snapCameraBehind(state);
  } else if (name === 'landing') {
    startMission(state, 1);
    const p = state.plane;
    const s = RUNWAYS[1];
    // On short final for the dirt strip: 330 m out, 30 m up, gear down, sinking gently.
    p.x = s.cx + 135; p.z = s.cz + 301; p.y = 30;
    p.heading = s.heading; p.pitch = -0.05; p.roll = 0.03;
    p.speed = 36; p.vy = -1.9; p.throttle = 0.3; p.fuel = 58; p.onGround = false;
    p.propSpin = 1.4;
    state.mission.t = 74;
    state.mission.targetDist = 330;
    state.banner = null;
    snapCameraBehind(state);
  } else if (name === 'rescue') {
    startMission(state, 3);
    const p = state.plane;
    // Low over the east sea, banking in toward the lit drop circle, buoy away.
    p.x = 1420; p.y = 38; p.z = 610;
    p.heading = 1.08; p.pitch = -0.02; p.roll = -0.18;
    p.speed = 44; p.vy = -0.8; p.throttle = 0.45; p.fuel = 66; p.onGround = false;
    p.propSpin = 1.9;
    const m = state.mission;
    m.t = 52;
    m.dropped = true;
    m.buoy = { x: 1630, y: 27, z: 385, vx: 0, vz: 0, vy: -6 };
    m.objectiveText = 'Buoy away — watch the splash';
    m.target = { x: 1720, z: 300 };
    m.targetDist = 431;
    state.banner = null;
    snapCameraBehind(state);
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
    };
    state.campaignScore = 2787;
    state.screen = 'done';
    snapCameraBehind(state);
  } else {
    // 'start' and anything else: the title screen over the orbiting island.
    // A later clock puts the camera east of the island, mountains behind it.
    state.screen = 'title';
    state.time = 30;
    resetPlane(state.plane, RUNWAYS[0]);
    state.campaignScore = 0;
  }
}
