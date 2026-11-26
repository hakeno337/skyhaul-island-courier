// Skyhaul — keyboard and mouse input.
// Keyboard is primary; the mouse steers whenever it moves away from screen centre,
// and the wheel trims the throttle. readControls() blends both into one set of axes.

import { clamp } from './config.js';

export function createInput(canvas) {
  const input = {
    keys: new Set(),
    mouseX: 0.5,       // 0..1 across the canvas
    mouseY: 0.5,       // 0..1 down the canvas
    mouseSeen: false,
    wheelTrim: 0,      // accumulated wheel throttle steps, -1..1
    clicked: false,    // a click since the last frame (consumed by main)
  };

  const code = (e) => e.code || e.key;

  window.addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(code(e))) e.preventDefault();
    input.keys.add(code(e));
  });
  window.addEventListener('keyup', (e) => input.keys.delete(code(e)));
  window.addEventListener('blur', () => input.keys.clear());

  const track = (e) => {
    const r = canvas.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) {
      input.mouseX = clamp((e.clientX - r.left) / r.width, 0, 1);
      input.mouseY = clamp((e.clientY - r.top) / r.height, 0, 1);
      input.mouseSeen = true;
    }
  };
  canvas.addEventListener('mousemove', track);
  canvas.addEventListener('mousedown', (e) => { track(e); input.clicked = true; });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    input.wheelTrim = clamp(input.wheelTrim - Math.sign(e.deltaY) * 0.08, -1, 1);
  }, { passive: false });

  return input;
}

// One frame of pilot intent: pitch/roll in -1..1, throttle nudges, and action keys.
export function readControls(input) {
  const k = input.keys;
  const has = (...codes) => codes.some((c) => k.has(c));

  let pitch = 0;
  if (has('KeyW', 'ArrowUp')) pitch += 1;      // pull up / climb
  if (has('KeyS', 'ArrowDown')) pitch -= 1;   // push down / descend
  let roll = 0;
  if (has('KeyA', 'ArrowLeft')) roll -= 1;    // bank left
  if (has('KeyD', 'ArrowRight')) roll += 1;   // bank right

  // Mouse steering fills in only where the keyboard is quiet.
  if (input.mouseSeen) {
    const dx = (input.mouseX - 0.5) * 2;
    const dy = (input.mouseY - 0.5) * 2;
    if (roll === 0 && Math.abs(dx) > 0.14) roll = clamp(dx * 1.15, -1, 1);
    if (pitch === 0 && Math.abs(dy) > 0.14) pitch = clamp(-dy * 1.15, -1, 1);
  }

  return {
    pitch,
    roll,
    throttleUp: has('ShiftLeft', 'ShiftRight', 'KeyE'),
    throttleDown: has('KeyQ') || k.has('Space'),
    wheelTrim: input.wheelTrim,
    confirm: has('Enter') || input.clicked,
    mission1: has('Digit1'),
    mission2: has('Digit2'),
    mission3: has('Digit3'),
    retry: has('KeyR'),
  };
}

export function consumeClick(input) {
  const was = input.clicked;
  input.clicked = false;
  return was;
}
