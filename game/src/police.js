// The wanted level and the police. Heat rises with crimes and falls when the courier lies
// low; the stars are read off the thresholds. Police cars and foot cops spawn in proportion
// to the heat, chase the player, ram and, at high wanted, open fire. A foot cop who reaches
// the player and stays close for a beat arrests them.

import { POLICE, WANTED } from './config.js';
import { makeCar, carStep, ejectPlayer } from './vehicles.js';

/** The number of stars for the current heat. */
export function starsFor(heat) {
  const t = WANTED.thresholds;
  let stars = 0;
  for (let i = 1; i < t.length; i += 1) {
    if (heat >= t[i]) stars = i;
  }
  return stars;
}

export function updateWanted(G, dt) {
  const w = G.wanted;
  w.stars = starsFor(w.heat);
  if (w.cool > 0) {
    w.cool -= dt;
  } else {
    // Hidden when no cop can see the player: cool faster when out of sight.
    const seen = copsCanSee(G);
    const rate = seen ? WANTED.decay : WANTED.hiddenDecay;
    w.heat = Math.max(0, w.heat - rate * dt);
  }
}

function copsCanSee(G) {
  const p = G.player;
  for (const car of G.cars) {
    if (car.kind !== 'cop' || car.wrecked) continue;
    if (Math.hypot(car.x - p.x, car.y - p.y) < 620) return true;
  }
  for (const cop of G.cops) {
    if (!cop.alive || !cop.onFoot) continue;
    if (Math.hypot(cop.x - p.x, cop.y - p.y) < 420) return true;
  }
  return false;
}

/** Spawn and drive the police; called every step while the player is on the streets. */
export function updatePolice(G, dt) {
  updateWanted(G, dt);
  const stars = G.wanted.stars;
  const wantCars = Math.min(POLICE.maxCars, stars === 0 ? 0 : Math.ceil(stars / 2) + 1);
  const wantCops = Math.min(POLICE.maxCops, stars >= 2 ? Math.ceil(stars * 1.5) : 0);

  countAndSpawn(G, wantCars, wantCops);
  driveCopCars(G, dt);
  stepFootCops(G, dt);
}

function countAndSpawn(G, wantCars, wantCops) {
  let cars = 0;
  let cops = 0;
  for (const car of G.cars) if (car.kind === 'cop' && !car.wrecked) cars += 1;
  for (const cop of G.cops) if (cop.alive) cops += 1;
  if (cars < wantCars) spawnCopCar(G);
  if (cops < wantCops) spawnFootCop(G);
}

function spawnCopCar(G) {
  const p = G.player;
  const a = Math.random() * Math.PI * 2;
  const d = 700 + Math.random() * 500;
  const x = Math.max(G.world.land.x0 + 40, Math.min(G.world.land.x1 - 40, p.x + Math.cos(a) * d));
  const y = Math.max(G.world.land.y0 + 40, Math.min(G.world.land.y1 - 40, p.y + Math.sin(a) * d));
  const car = makeCar('cop', x, y, Math.atan2(p.y - y, p.x - x), 'cop');
  car.copT = 1;
  G.cars.push(car);
  G.audio.play('sirenBlip');
}

function spawnFootCop(G) {
  const p = G.player;
  const a = Math.random() * Math.PI * 2;
  const d = 480 + Math.random() * 220;
  const x = p.x + Math.cos(a) * d;
  const y = p.y + Math.sin(a) * d;
  G.cops.push({
    x,
    y,
    angle: Math.atan2(p.y - y, p.x - x),
    phase: Math.random() * 7,
    health: 30,
    alive: true,
    dead: 0,
    onFoot: true,
    alert: 0,
    arrest: 0,
    shootCd: 0,
  });
}

function driveCopCars(G, dt) {
  const p = G.player;
  for (const car of G.cars) {
    if (car.kind !== 'cop' || car.wrecked || car.driver !== 'cop') continue;
    if (car.copT > 0) {
      car.copT -= dt;
      continue;
    }
    const dx = p.x - car.x;
    const dy = p.y - car.y;
    const dist = Math.hypot(dx, dy);
    const desired = Math.atan2(dy, dx);
    const steer = clamp(angleDiff(desired, car.angle), -1, 1);
    // Ram toward the player; back off a touch once very close so it doesn't pin them.
    const throttle = dist > 90 ? 1 : 0.5;
    carStep(G, car, dt, throttle, steer, false);
    // High-wanted cars stop and shoot.
    if (G.wanted.stars >= 4 && dist < 520) {
      car.shootT = (car.shootT || 0) - dt;
      if (car.shootT <= 0) {
        car.shootT = POLICE.fireRate;
        const muzzle = car.len / 2;
        const mx = car.x + Math.cos(car.angle) * muzzle;
        const my = car.y + Math.sin(car.angle) * muzzle;
        G.combat.fireFrom(G, mx, my, desired + (Math.random() - 0.5) * 0.14, POLICE.bulletSpeed, 'cop');
        G.bullets[G.bullets.length - 1].damage = POLICE.damage;
      }
    }
    // Cars collide hard: the ram damage is handled by the collision pass in main.
  }
}

function stepFootCops(G, dt) {
  const p = G.player;
  const cops = G.cops;
  for (let i = cops.length - 1; i >= 0; i -= 1) {
    const cop = cops[i];
    if (cop.dead > 0) {
      cop.dead -= dt;
      continue;
    }
    if (!cop.alive) {
      cops.splice(i, 1);
      continue;
    }
    const dx = p.x - cop.x;
    const dy = p.y - cop.y;
    const dist = Math.hypot(dx, dy);
    cop.angle = angleDiff(Math.atan2(dy, dx), cop.angle) === 0 ? cop.angle : cop.angle + clamp(angleDiff(Math.atan2(dy, dx), cop.angle), -6 * dt, 6 * dt);
    // Chase the player, but not into water or through a building.
    const speed = 150;
    let nx = cop.x + Math.cos(cop.angle) * speed * dt;
    let ny = cop.y + Math.sin(cop.angle) * speed * dt;
    const corrected = G.world.collideCircle(nx, ny, 5);
    if (!G.world.isWater(corrected.x, corrected.y)) {
      cop.x = corrected.x;
      cop.y = corrected.y;
    }
    cop.phase += dt * 11;

    if (dist < 20 && p.alive) {
      cop.arrest += dt;
      if (cop.arrest >= WANTED.arrestTime) {
        G.gameOver('busted');
        return;
      }
    } else if (cop.arrest > 0) {
      cop.arrest = Math.max(0, cop.arrest - dt * 2);
    }
    // Foot cops shoot when the player is wanted and they have a line.
    if (cop.shootCd > 0) cop.shootCd -= dt;
    if (G.wanted.stars >= 3 && dist < 400 && dist > 60 && cop.shootCd <= 0) {
      cop.shootCd = POLICE.fireRate * 1.4;
      const a = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.12;
      G.combat.fireFrom(G, cop.x + Math.cos(a) * 8, cop.y + Math.sin(a) * 8, a, POLICE.bulletSpeed, 'cop');
      G.bullets[G.bullets.length - 1].damage = POLICE.damage;
    }
  }
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
