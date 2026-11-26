// Skyhaul — the Kestrel's flight model. Arcade physics with real teeth:
// a stall that drops the nose, an overspeed that shakes the airframe apart,
// fuel that burns faster the harder you push, and landings judged by sink rate.

import { PHYS, DEG, clamp } from './config.js';
import { groundHeightAt, featureHit, onRunway, RUNWAYS } from './world.js';

export function createPlane() {
  const rwy = RUNWAYS[0];
  return {
    x: rwy.cx, z: rwy.cz + rwy.length / 2 - 70, y: 0,
    heading: 0, pitch: 0, roll: 0,
    speed: 0, vy: 0, throttle: 0,
    fuel: PHYS.fuelCapacity, hull: PHYS.hullMax,
    onGround: true, stalled: false, stress: false, engineOut: false,
    turbulence: 0, propSpin: 0, lastWheel: 0,
    touchdown: null,
  };
}

// A clean reset on a runway threshold, used at every mission start:
// half a length behind the centre, facing along the runway heading.
export function resetPlane(plane, rwy) {
  const back = rwy.length / 2 - 70;
  plane.x = rwy.cx - Math.sin(rwy.heading) * back;
  plane.z = rwy.cz + Math.cos(rwy.heading) * back;
  plane.heading = rwy.heading;
  plane.pitch = 0; plane.roll = 0;
  plane.speed = 0; plane.vy = 0; plane.throttle = 0;
  plane.fuel = PHYS.fuelCapacity; plane.hull = PHYS.hullMax;
  plane.onGround = true; plane.stalled = false; plane.stress = false;
  plane.engineOut = false; plane.turbulence = 0; plane.touchdown = null;
  plane.y = groundHeightAt(plane.x, plane.z);
}

// Advance the aircraft one step. Returns flight events for the mission layer:
// { tookOff, landed:{quality, runway}, crashed:reason, ditched, clipped }
export function stepPlane(plane, controls, world, dt) {
  const ev = {};
  const groundH = groundHeightAt(plane.x, plane.z);

  // Throttle: keys walk it, the wheel snaps it, an empty tank kills it.
  if (controls.throttleUp) plane.throttle = clamp(plane.throttle + 0.55 * dt, 0, 1);
  if (controls.throttleDown && plane.onGround && plane.throttle <= 0.02) {
    plane.speed = Math.max(0, plane.speed - 7 * dt); // wheel brakes
  } else if (controls.throttleDown) {
    plane.throttle = clamp(plane.throttle - 0.7 * dt, 0, 1);
  }
  if (controls.wheelTrim !== plane.lastWheel) {
    plane.throttle = clamp(0.5 + controls.wheelTrim, 0, 1);
    plane.lastWheel = controls.wheelTrim;
  }
  plane.fuel = Math.max(0, plane.fuel - (PHYS.idleDrain + plane.throttle * (PHYS.fullDrain - PHYS.idleDrain)) * dt);
  plane.engineOut = plane.fuel <= 0;
  const thrust = plane.engineOut ? 0 : plane.throttle * PHYS.accelFull;

  if (plane.onGround) {
    plane.speed = Math.max(0, plane.speed + (thrust - PHYS.dragBase * 0.4 - plane.speed * 0.012) * dt);
    // Taxi steering from the roll keys.
    plane.heading += controls.roll * 0.55 * dt * clamp(plane.speed / 14, 0, 1);
    plane.roll = controls.roll * 0.06;
    plane.pitch = plane.speed > PHYS.rotateSpeed - 6 && controls.pitch > 0 ? controls.pitch * 0.1 : 0;
    plane.x += Math.sin(plane.heading) * plane.speed * dt;
    plane.z += -Math.cos(plane.heading) * plane.speed * dt;
    plane.y = groundHeightAt(plane.x, plane.z);
    if (plane.speed >= PHYS.rotateSpeed && controls.pitch > 0.25) {
      plane.onGround = false;
      plane.pitch = 9 * DEG;
      plane.vy = 2.2;
      ev.tookOff = true;
    }
  } else {
    // Attitude eases toward the pilot's ask — never snaps, never fights.
    const targetPitch = controls.pitch * PHYS.maxPitchDeg * DEG;
    const targetRoll = controls.roll * PHYS.maxBankDeg * DEG;
    plane.pitch += clamp(targetPitch - plane.pitch, -1.35 * dt, 1.35 * dt);
    plane.roll += clamp(targetRoll - plane.roll, -2.1 * dt, 2.1 * dt);

    // Coordinated turn: bank is what turns the aircraft.
    plane.heading += Math.tan(clamp(plane.roll, -1.05, 1.05)) * 9.81 / Math.max(plane.speed, 18) * PHYS.turnGain * dt;

    // Speed trades against climb, drag and turn load.
    const drag = PHYS.dragQuad * plane.speed * plane.speed + PHYS.dragBase + Math.abs(Math.sin(plane.roll)) * plane.speed * 0.011;
    plane.speed = Math.max(0, plane.speed + (thrust - drag - Math.sin(plane.pitch) * 5.4) * dt);

    // Lift, stall and sink.
    plane.stalled = plane.speed < PHYS.stallSpeed;
    if (plane.stalled) plane.pitch += clamp(-0.32 - plane.pitch, -0.7 * dt, 0.7 * dt);
    const stallSink = plane.stalled ? PHYS.stallSink * (1 - plane.speed / PHYS.stallSpeed) : 0;
    const vyTarget = Math.sin(plane.pitch) * plane.speed * PHYS.climbSink - PHYS.gravitySink - stallSink;
    plane.vy += clamp(vyTarget - plane.vy, -14 * dt, 14 * dt);

    const hSpeed = plane.speed * Math.cos(plane.pitch * 0.55);
    plane.x += Math.sin(plane.heading) * hSpeed * dt;
    plane.z += -Math.cos(plane.heading) * hSpeed * dt;
    plane.y += plane.vy * dt;

    // Overspeed stress.
    plane.stress = plane.speed > PHYS.neverExceed;
    if (plane.stress) plane.hull = Math.max(0, plane.hull - (plane.speed - PHYS.neverExceed) * 0.55 * dt);
    if (plane.hull <= 0) { ev.crashed = 'The airframe came apart in overspeed.'; return ev; }

    // Storm turbulence: rough air, and hail damage if you charge through fast.
    plane.turbulence = 0;
    for (const c of world.clouds) {
      if (!c.storm) continue;
      const d = Math.hypot(plane.x - c.x, plane.z - c.z);
      if (d < c.s * 1.35 && Math.abs(plane.y - c.y) < 110) {
        plane.turbulence = 1;
        if (plane.speed > 68) plane.hull = Math.max(0, plane.hull - 5.5 * dt);
      }
    }
    if (plane.hull <= 0) { ev.crashed = 'Hail tore the airframe apart in the storm.'; return ev; }

    // Solid things: trees, houses, the lighthouse, the tower.
    const hit = featureHit(world, plane.x, plane.z, plane.y);
    if (hit && plane.y > groundH + 1) {
      if (plane.speed < 22) {
        plane.hull -= 12; plane.speed = 0; plane.y = hit.h;
        ev.clipped = hit.kind;
      } else {
        ev.crashed = `You flew into the ${hit.kind === 'tree' ? 'trees' : hit.kind}.`;
        return ev;
      }
    }

    // The ground itself.
    if (plane.y <= groundH) {
      const sink = -plane.vy;
      const rwy = RUNWAYS.find((r) => onRunway(r, plane.x, plane.z)) || null;
      const overSea = groundH <= 0 && !rwy && plane.y <= 0;
      if (overSea) {
        if (sink <= 2.4 && plane.speed <= 40) ev.ditched = 'You ditched in the sea — wet, but walking away.';
        else ev.crashed = 'You went into the sea.';
        plane.y = 0;
        return ev;
      }
      if (groundH > 40 && !rwy) {
        ev.crashed = 'You flew into the mountain.';
        plane.y = groundH;
        return ev;
      }
      if (sink > PHYS.crashSink || plane.speed > 58) {
        ev.crashed = rwy ? 'You hit the runway far too hard.' : 'You hit the ground far too hard.';
        plane.y = groundH;
        return ev;
      }
      const quality = sink <= 1.7 ? 'smooth' : sink <= 2.8 ? 'firm' : 'hard';
      if (quality === 'hard') plane.hull = Math.max(1, plane.hull - 16);
      plane.y = groundH;
      plane.vy = 0;
      plane.onGround = true;
      plane.pitch = 0;
      ev.landed = { quality, runway: rwy };
      plane.touchdown = ev.landed;
    }
  }

  plane.propSpin += (1.5 + plane.throttle * 34 + plane.speed * 0.12) * dt;
  return ev;
}
