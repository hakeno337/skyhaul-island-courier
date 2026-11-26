# skyhaul-island-courier

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/hakeno337/skyhaul-island-courier/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/hakeno337/skyhaul-island-courier/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

The 3D rebuild of Skyhaul: the same four sorties, the same flight model,
the same island — drawn in real time 3D with Three.js instead of a 2D
canvas. One little prop plane, one island, and everybody's parcels:
Teluk Emas at golden hour.

**The flying.** An arcade model with teeth, unchanged from the 2D game:
a stall that drops the nose below 26 m/s, overspeed damage past 97 m/s,
fuel that burns with throttle, hull damage from storms and hard arrivals,
and landings graded smooth / firm / hard by sink rate.

**The sorties.**
1. **Ring Run** — thread 8 golden rings against the clock.
2. **Sunset Delivery** — land a medicine crate on the village dirt strip;
   touchdown quality pays.
3. **Storm Patrol** — three checkpoints in a gusting crosswind, between
   two storm banks that damage you if you charge through fast.
4. **Harbour Rescue** — drop a pump buoy to a sinking fishing boat from
   below 150 ft (F to drop); accuracy pays.

**The world.** A seeded heightmap island with vertex-coloured terrain
(sand, grass, fields, forest, rock, snow), two graded strips, a village,
a lighthouse, a tower, several hundred instanced trees and palms, and a
glassy sea under a warm low sun. The HUD is a lit instrument panel —
compass tape, airspeed and altimeter dials, attitude ball, throttle /
fuel / airframe bars — plus a live radar plotting the coastline, both
strips, the storms and the active objective.

**Controls.** W/S pitch · A/D bank · SHIFT/Q throttle (or the wheel) ·
F drop the buoy · mouse steers · M mute · 1–4 pick a sortie.

Everything runs offline from static files: Three.js is vendored at
`game/vendor/three.min.js` (r149, MIT), all other code is hand-written
under `game/src/`, one job per file. `main.ts` is the hand-in program;
`node serve.ts` plays it locally.
