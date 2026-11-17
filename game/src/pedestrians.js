// Pedestrians: casual strollers on the sidewalks who pick a direction, wander, and duck into
// a shop or turn around at a crossing. When the player shoots or drives at them they panic
// and sprint away; a car can knock them down. The police treat a fleeing crowd as a lead.

import { Peds, WORLD } from './config.js';

export function spawnPed(G) {
  const cell = G.world.cell;
  const grid = G.world.grid;
  // A point on the sidewalk of a random road, off the asphalt.
  const horiz = Math.random() < 0.5;
  const lane = 1 + Math.floor(Math.random() * (grid - 2));
  const along = (Math.random() * (grid - 1)) * cell;
  const x = horiz ? along + cell * 0.2 : lane * cell + (Math.random() < 0.5 ? G.world.roadHalf + 10 : -G.world.roadHalf - 10);
  const y = horiz ? lane * cell + (Math.random() < 0.5 ? G.world.roadHalf + 10 : -G.world.roadHalf - 10) : along + cell * 0.2;
  const p = {
    x,
    y,
    angle: Math.random() * Math.PI * 2,
    phase: Math.random() * 7,
    health: 1,
    alive: true,
    dead: 0,
    panic: 0,
    palette: Math.floor(Math.random() * 6),
    turn: 2 + Math.random() * 4,
    speed: 0,
    wander: 0,
  };
  G.peds.push(p);
  return p;
}

function stepPed(G, p, dt) {
  if (p.dead > 0) {
    p.dead -= dt;
    return;
  }
  if (!p.alive) return;
  const distP = Math.hypot(G.player.x - p.x, G.player.y - p.y);

  // Panic: run away from the courier, or from gunfire near them.
  if (p.panic > 0) {
    p.panic -= dt;
    const away = Math.atan2(p.y - G.player.y, p.x - G.player.x);
    p.angle = turnToward(p.angle, away, 6 * dt);
    p.speed = Peds.panic;
  } else {
    if (distP < 130 && (G.wanted.heat > 0.4 || Math.random() < dt * 3)) {
      p.panic = 1.4;
    }
    p.wander -= dt;
    if (p.wander <= 0) {
      p.wander = 1.5 + Math.random() * 3;
      p.angle = Math.random() < 0.7 ? p.angle + (Math.random() - 0.5) * 2 : Math.random() * Math.PI * 2;
    }
    p.speed = Peds.walk;
  }

  const nx = p.x + Math.cos(p.angle) * p.speed * dt;
  const ny = p.y + Math.sin(p.angle) * p.speed * dt;
  // Stay on the land; a pedestrian walks around a building, not through it.
  const corrected = G.world.collideCircle(nx, ny, 4);
  if (G.world.isWater(corrected.x, corrected.y)) {
    p.angle += Math.PI;
    return;
  }
  if (corrected.moved) p.angle += (Math.random() - 0.5) * 2.4;
  p.x = corrected.x;
  p.y = corrected.y;
  p.phase += dt * 9;
}

/** The player's car (or any car) can knock a pedestrian flat. */
export function runOver(G, ped, speed) {
  if (!ped.alive || ped.dead > 0) return;
  if (speed > 130) {
    G.combat.hitPed(G, ped, 99, 'runover');
  } else {
    ped.panic = 2.6;
  }
}

function turnToward(current, target, max) {
  let d = target - current;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return current + Math.max(-max, Math.min(max, d));
}

/** Advance the whole crowd and keep a steady number on the streets near the player. */
export function updatePeds(G, dt) {
  const peds = G.peds;
  for (let i = peds.length - 1; i >= 0; i -= 1) {
    const p = peds[i];
    if (!p.alive && p.dead <= 0) {
      peds.splice(i, 1);
      continue;
    }
    stepPed(G, p, dt);
  }
  let guard = 0;
  while (peds.length < Peds.count && guard < 10) {
    const p = spawnPed(G);
    guard += 1;
    if (Math.hypot(p.x - G.player.x, p.y - G.player.y) > Peds.range) break;
  }
  // Drop a crowd member who has wandered off the map or too far from the player.
  for (let i = peds.length - 1; i >= 0; i -= 1) {
    const p = peds[i];
    if (!p.alive || Math.hypot(p.x - G.player.x, p.y - G.player.y) > Peds.range * 1.8) peds.splice(i, 1);
  }
}
