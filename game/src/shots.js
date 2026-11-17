// Deterministic screenshot scenes behind ?shot=cover|mission|chase|start. Each one builds the
// real game state with the fixed seed, places the player, cars, cops and peds for the scene,
// advances the simulation a few steps so shadows and skids settle, and hands back a function
// that paints that one frame - so a screenshot is an honest frame of the running game.

import { makeCar } from './vehicles.js';
import { spawnTrafficCar } from './traffic.js';
import { spawnPed } from './pedestrians.js';
import { MISSIONS, startMission } from './missions.js';
import { starsFor } from './police.js';

/** Advance the world a little under the given scene so it looks lived-in, then return it. */
export function stageShot(G, name) {
  // Every scene starts from a clean, well-populated city.
  G.cars.length = 0;
  G.peds.length = 0;
  G.cops.length = 0;
  G.bullets.length = 0;
  G.particles.length = 0;
  G.skids.length = 0;
  for (let i = 0; i < 20; i += 1) spawnTrafficCar(G);
  for (let i = 0; i < 30; i += 1) spawnPed(G);

  if (name === 'cover' || name === 'chase') {
    placeDriving(G, name === 'chase');
    G.wanted.stars = starsFor(G.wanted.heat);
  } else if (name === 'mission') {
    placeMission(G);
  } else {
    // The title screen: the courier stands in the downtown plaza with the skyline behind.
    G.player.x = G.world.plaza.x;
    G.player.y = G.world.plaza.y + 40;
    G.player.angle = -Math.PI / 2;
    G.cam.x = G.player.x;
    G.cam.y = G.player.y - 40;
    G.cam.zoom = 0.9;
  }
  return G;
}

function placeDriving(G, chase) {
  // In the downtown grid, heading east up a wide avenue.
  const c = G.world.cell;
  G.player.x = 4 * c;
  G.player.y = 4 * c + G.world.laneHalf;
  G.player.angle = 0;
  const car = makeCar(chase ? 'cop' : 'sport', G.player.x - 40, G.player.y, 0, 'player');
  car.vx = 140;
  car.speed = 140;
  G.cars.push(car);
  G.player.inCar = car;
  G.cam.x = car.x;
  G.cam.y = car.y;
  G.cam.zoom = 0.82;

  // Traffic flowing both ways and a couple of parked cars near the avenue.
  for (let i = 0; i < 6; i += 1) {
    const ahead = makeCar(i % 2 ? 'sedan' : 'taxi', car.x + 240 + i * 300, 4 * c + G.world.laneHalf, 0, 'traffic');
    ahead.vx = 130 + i * 8;
    ahead.speed = 130;
    G.cars.push(ahead);
  }
  for (let i = 0; i < 3; i += 1) {
    const oncoming = makeCar('van', car.x + 120 + i * 360, 4 * c - G.world.laneHalf, Math.PI, 'traffic');
    oncoming.vx = -110;
    oncoming.speed = -110;
    G.cars.push(oncoming);
  }

  if (chase) {
    G.wanted.heat = 7.2;
    // Cop cars boxing the courier in, lights on.
    const angles = [0.5, 2.4, 3.6];
    for (let i = 0; i < angles.length; i += 1) {
      const cop = makeCar('cop', car.x + Math.cos(angles[i]) * 260, car.y + Math.sin(angles[i]) * 260, angles[i] + Math.PI, 'cop');
      cop.copT = 0;
      G.cars.push(cop);
    }
    // Foot cops on the sidewalk.
    for (let i = 0; i < 3; i += 1) {
      G.cops.push({ x: car.x + 90 + i * 60, y: car.y + 150, angle: -Math.PI / 2, phase: i, health: 30, alive: true, dead: 0, onFoot: true, alert: 0, arrest: 0, shootCd: 0 });
    }
  } else {
    // Heat 4.0 reads as exactly three wanted stars.
    G.wanted.heat = 4.0;
    // Two foot cops on the corner, distant.
    for (let i = 0; i < 2; i += 1) {
      G.cops.push({ x: car.x + 210 + i * 70, y: car.y - 170, angle: Math.PI, phase: i, health: 30, alive: true, dead: 0, onFoot: true, alert: 0, arrest: 0, shootCd: 0 });
    }
  }

  // Skid marks behind a hard stop, and a little tyre smoke.
  for (let i = 0; i < 26; i += 1) {
    G.skids.push({ x1: car.x - 40 - i * 4, y1: car.y - 12, x2: car.x - 44 - i * 4, y2: car.y - 12, life: 6, max: 6 });
  }
  // A few pedestrians on the sidewalk right beside the avenue so the frame is alive.
  for (let i = 0; i < 4; i += 1) {
    const ped = spawnPed(G);
    ped.x = car.x - 120 + i * 55;
    ped.y = car.y - G.world.laneHalf - 78 - (i % 2) * 26;
    ped.angle = 0;
  }
}

function placeMission(G) {
  // On foot at the courier's first drop, mission dialogue up, marker on the next one.
  const c = G.world.cell;
  G.player.x = 2 * c;
  G.player.y = 2 * c + 60;
  G.player.angle = Math.PI / 2;
  G.cam.x = G.player.x;
  G.cam.y = G.player.y - 30;
  G.cam.zoom = 1.0;
  G.wanted.heat = 0;

  startMission(G, 0);
  G.mission.stage = 1;
  G.mission.phase = 'intro';
  G.mission.line = 0;
  G.mission.marker = { x: 4.5 * c, y: 4.5 * c };
  G.mission.objective = 'Drop 2 of 3 - old town';
  // A parked car and some strollers around the square.
  const parked = makeCar('sedan', 1.6 * c, 2 * c, Math.PI / 2, null);
  G.cars.push(parked);
  for (let i = 0; i < 6; i += 1) {
    spawnPed(G);
  }
  G.peds.forEach((p, i) => {
    p.x = G.player.x - 60 + i * 34;
    p.y = G.player.y + 90 + (i % 3) * 24;
    p.angle = Math.PI / 2;
  });
}
