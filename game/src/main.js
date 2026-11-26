// Skyhaul — Island Courier: boot and the game loop.
// One state object, four screens (title, fly, done/failed, crashed), a fixed
// renderer, and the mission layer in between. No network, no storage, no fuss.

import { VIEW } from './config.js';
import { buildWorld, RUNWAYS } from './world.js';
import { createInput, readControls } from './input.js';
import { createPlane, resetPlane, stepPlane } from './flight.js';
import { MISSIONS, startMission, stepMission } from './missions.js';
import { createCamera, updateCamera, drawScene } from './render.js';
import { drawHud } from './hud.js';
import { drawTitle, drawResults, drawFailed, drawCrashed, titleMissionAt } from './screens.js';
import { stageShot } from './shots.js';
import { unlockAudio, sfx } from './audio.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const input = createInput(canvas);
const world = buildWorld();

const state = {
  screen: 'title',
  time: 0,
  frozen: false,
  plane: createPlane(),
  camera: createCamera(),
  mission: null,
  missionIndex: 0,
  result: null,
  banner: null,
  campaignScore: 0,
  cues: [],
};
resetPlane(state.plane, RUNWAYS[0]);

const shotName = new URLSearchParams(location.search).get('shot');
if (shotName) stageShot(state, shotName);

function endSortieCrash(reason, ditched) {
  const m = state.mission;
  const banked = m ? m.score : 0;
  state.campaignScore += banked;
  state.result = {
    title: ditched ? 'DITCHED' : 'AIRFRAME DOWN',
    success: false,
    missionName: m ? m.def.name : '',
    note: reason,
    lines: [[m && m.def.id === 'rings' ? 'Rings banked' : 'Objectives banked', banked]],
    total: banked,
  };
  state.screen = 'crashed';
  sfx.thud();
  sfx.fail();
}

function playCues() {
  for (const cue of state.cues) {
    if (cue === 'ring') sfx.ring();
    else if (cue === 'checkpoint') sfx.checkpoint();
    else if (cue === 'success') sfx.success();
    else if (cue === 'fail') sfx.fail();
  }
  state.cues.length = 0;
}

function step(dt) {
  state.time += dt;
  const controls = readControls(input);
  const coast = { pitch: 0, roll: 0, throttleUp: false, throttleDown: true, wheelTrim: state.plane.lastWheel };
  if (controls.confirm || controls.mission1 || controls.mission2 || controls.mission3 || controls.mission4) unlockAudio();

  if (state.screen === 'title') {
    let pick = -1;
    if (controls.mission1) pick = 0;
    if (controls.mission2) pick = 1;
    if (controls.mission3) pick = 2;
    if (controls.mission4) pick = 3;
    if (pick < 0 && input.clicked) {
      pick = titleMissionAt(input.mouseX * VIEW.width, input.mouseY * VIEW.height);
      if (pick >= 0) sfx.click();
    }
    if (pick >= 0) startMission(state, pick);
  } else if (state.screen === 'fly') {
    const ev = stepPlane(state.plane, controls, world, dt);
    if (controls.drop) ev.drop = true;
    if (ev.clipped) {
      state.banner = { text: `Clipped a ${ev.clipped}!`, sub: 'The airframe felt that one', until: state.time + 1.6 };
      sfx.thud();
    }
    if (ev.crashed) endSortieCrash(ev.crashed, false);
    else if (ev.ditched) endSortieCrash(ev.ditched, true);
    else stepMission(state, ev, dt);
    playCues();
  } else if (state.screen === 'done' || state.screen === 'failed' || state.screen === 'crashed') {
    // Let a landed plane roll to a stop behind its own results panel.
    if (state.plane.onGround && state.plane.speed > 0) stepPlane(state.plane, coast, world, dt);
    if (controls.confirm) startMission(state, (state.missionIndex + 1) % MISSIONS.length);
    else if (controls.retry) startMission(state, state.missionIndex);
    else if (input.keys.has('KeyT')) { state.screen = 'title'; state.mission = null; }
  }
  input.clicked = false;
  updateCamera(state, dt);
}

function frame() {
  ctx.clearRect(0, 0, VIEW.width, VIEW.height);
  drawScene(ctx, state, world, VIEW.width, VIEW.height);
  if (state.screen === 'fly') drawHud(ctx, state, world, VIEW.width, VIEW.height);
  else if (state.screen === 'title') drawTitle(ctx, state, VIEW.width, VIEW.height);
  else if (state.screen === 'done') drawResults(ctx, state, VIEW.width, VIEW.height);
  else if (state.screen === 'failed') drawFailed(ctx, state, VIEW.width, VIEW.height);
  else if (state.screen === 'crashed') drawCrashed(ctx, state, VIEW.width, VIEW.height);
}

let last = performance.now();
function loop(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  if (!state.frozen) step(dt);
  frame();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
