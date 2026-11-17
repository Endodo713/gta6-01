// Cars: one arcade physics model shared by traffic, the police and the player, plus the
// enter/exit and stealing rules. Each car has a forward speed along its nose and a lateral
// speed that grip bleeds away; the handbrake cuts that grip, which is how you slide.

import { CAR } from './config.js';

export const KINDS = {
  sedan:  { len: 52, wid: 26, color: '#c9564e', hp: CAR.health },
  sport:  { len: 48, wid: 24, color: '#4d9de0', hp: CAR.health * 1.05 },
  van:    { len: 60, wid: 28, color: '#d9c46a', hp: CAR.health * 1.3 },
  taxi:   { len: 50, wid: 25, color: '#e0c04c', hp: CAR.health },
  pickup: { len: 56, wid: 27, color: '#8b6f4e', hp: CAR.health * 1.1 },
  cop:    { len: 54, wid: 27, color: '#22304a', hp: CAR.health * 1.6 },
};

let carId = 0;

/** Build a car. `driver` is 'player', 'traffic', 'cop', 'npc' or null for parked. */
export function makeCar(kind, x, y, angle, driver) {
  const spec = KINDS[kind] || KINDS.sedan;
  return {
    id: ++carId,
    kind,
    x,
    y,
    angle,
    vx: 0,
    vy: 0,
    speed: 0,
    len: spec.len,
    wid: spec.wid,
    color: spec.color,
    health: spec.hp,
    maxHealth: spec.hp,
    wrecked: false,
    driver: driver || null,
    smokeT: 0,
    flashT: 0,
    braking: false,
    skidding: false,
    throttle: 0,
    aiTarget: null,
    route: [],
    stopT: 0,
    fireT: 0,
    copT: 0,
  };
}

// --- Physics ---------------------------------------------------------------------------

/** One step of the car model. throttle -1..1, steer -1..1. */
export function carStep(G, car, dt, throttle, steer, handbrake) {
  if (car.wrecked) {
    decayVelocity(car, dt, CAR.drag * 1.6);
    integrate(G, car, dt);
    return car.speed;
  }
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  const rx = -fy;
  const ry = fx;
  let forward = car.vx * fx + car.vy * fy;
  let lateral = car.vx * rx + car.vy * ry;

  // Water drags a car to a stop and sinks it into a wreck.
  if (G.world.isWater(car.x, car.y)) {
    forward *= Math.max(0, 1 - 2.6 * dt);
    lateral *= Math.max(0, 1 - 2.6 * dt);
  }

  if (throttle > 0) forward += CAR.accel * throttle * dt;
  else if (throttle < 0) {
    if (forward > 20) forward -= CAR.brake * dt;
    else forward += CAR.reverseAccel * throttle * dt;
  }

  forward = Math.max(-CAR.maxReverse, Math.min(CAR.maxSpeed, forward));
  forward *= Math.max(0, 1 - CAR.drag * 0.28 * dt);
  if (throttle === 0) forward *= Math.max(0, 1 - 1.1 * dt);

  const grip = handbrake ? CAR.handbrakeGrip : CAR.grip;
  lateral *= Math.max(0, 1 - grip * dt);

  // Turning needs some speed, and works backwards at speed.
  const gripFactor = Math.min(1, Math.abs(forward) / 130);
  const direction = forward >= 0 ? 1 : -1;
  car.angle += steer * CAR.turnRate * direction * gripFactor * dt;

  car.vx = fx * forward + rx * lateral;
  car.vy = fy * forward + ry * lateral;
  car.speed = forward;
  car.braking = throttle < -0.05 || handbrake;
  car.skidding = Math.abs(lateral) > 60 || handbrake;

  integrate(G, car, dt);
  return forward;
}

function decayVelocity(car, dt, drag) {
  const k = Math.max(0, 1 - drag * dt);
  car.vx *= k;
  car.vy *= k;
  car.speed = 0;
}

function integrate(G, car, dt) {
  car.x += car.vx * dt;
  car.y += car.vy * dt;
  // Keep the car on the land, then push it out of buildings at all four corners.
  const land = WORLD_LAND(G);
  car.x = Math.max(land.x0 + 14, Math.min(land.x1 - 14, car.x));
  car.y = Math.max(land.y0 + 14, Math.min(land.y1 - 14, car.y));
  if (!G.world.isWater(car.x, car.y)) collideBuildings(G, car);
}

function WORLD_LAND(G) {
  return G.world.land;
}

function collideBuildings(G, car) {
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  const rx = -fy;
  const ry = fx;
  const hl = car.len / 2 - 2;
  const hw = car.wid / 2 - 1;
  let totalX = 0;
  let totalY = 0;
  let hit = 0;
  const corners = [[hl, hw], [hl, -hw], [-hl, hw], [-hl, -hw]];
  for (const c of corners) {
    const px = car.x + fx * c[0] + rx * c[1];
    const py = car.y + fy * c[0] + ry * c[1];
    const out = G.world.collideCircle(px, py, 2.4);
    totalX += out.x - px;
    totalY += out.y - py;
    if (out.moved) hit += 1;
  }
  if (hit > 0) {
    car.x += totalX / 4;
    car.y += totalY / 4;
    const impact = Math.hypot(car.vx, car.vy);
    if (impact > 60) {
      damageCar(G, car, impact * 0.045);
      const fxp = car.x + Math.cos(car.angle) * (car.len / 2);
      const fyp = car.y + Math.sin(car.angle) * (car.len / 2);
      G.effects.sparks(G, fxp, fyp, Math.min(10, impact * 0.03));
      if (impact > 150) {
        G.audio.play('crash');
        G.shake = Math.max(G.shake, Math.min(0.5, impact / 700));
      }
    }
    car.vx *= 0.42;
    car.vy *= 0.42;
    car.speed *= 0.42;
  }
}

/** Knock health off a car and set it smoking when badly hit. */
export function damageCar(G, car, amount) {
  if (car.wrecked) return;
  car.health -= amount;
  if (car.health <= 0) {
    car.health = 0;
    car.wrecked = true;
    car.fireT = 0;
    if (car.driver === 'player') ejectPlayer(G);
    G.audio.play('crash');
    G.shake = Math.max(G.shake, 0.35);
  } else if (car.health < car.maxHealth * 0.55) {
    car.smokeT = 0.12;
  }
}

// --- Stealing and driving the player's car ---------------------------------------------

/** The nearest car the player can climb into, or null. */
export function nearestCar(G, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const car of G.cars) {
    if (car.wrecked) continue;
    const d = Math.hypot(car.x - G.player.x, car.y - G.player.y) - car.len * 0.3;
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}

/** Pull the driver out, or take an empty one; returns true when the player is now driving. */
export function tryEnterCar(G) {
  const car = nearestCar(G, 46);
  if (!car) return false;
  if (car.driver === 'traffic' || car.driver === 'ped' || car.driver === 'npc') {
    // The courier shoves the driver out of the window.
    G.effects.sparks(G, car.x, car.y, 4);
    G.combat.reportCrime(G, 'steal');
  } else if (car.driver === 'cop') {
    G.combat.reportCrime(G, 'cop');
  }
  car.driver = 'player';
  car.route = [];
  G.player.inCar = car;
  G.player.x = car.x + Math.cos(car.angle) * car.len * 0.5;
  G.player.y = car.y + Math.sin(car.angle) * car.len * 0.5;
  G.audio.play('door');
  car.flashT = 0.2;
  return true;
}

/** Hop out of the current car next to its door. */
export function tryExitCar(G) {
  const car = G.player.inCar;
  if (!car) return false;
  const side = Math.PI / 2;
  let nx = car.x + Math.cos(car.angle + side) * (car.wid * 0.9 + 14);
  let ny = car.y + Math.sin(car.angle + side) * (car.wid * 0.9 + 14);
  const out = G.world.collideCircle(nx, ny, 11);
  if (G.world.isWater(out.x, out.y)) {
    nx = car.x - Math.cos(car.angle + side) * (car.wid * 0.9 + 14);
    ny = car.y - Math.sin(car.angle + side) * (car.wid * 0.9 + 14);
  }
  G.player.x = out.x;
  G.player.y = out.y;
  G.player.angle = car.angle;
  car.driver = null;
  car.vx *= 0.3;
  car.vy *= 0.3;
  G.player.inCar = null;
  G.audio.play('door');
  return true;
}

export function ejectPlayer(G) {
  const car = G.player.inCar;
  if (!car) return;
  G.player.x = car.x;
  G.player.y = car.y;
  G.player.inCar = null;
  car.driver = null;
  G.player.health = Math.min(G.player.health, 22);
}

/** Steer the player's own car from the keyboard. */
export function drivePlayerCar(G, dt) {
  const car = G.player.inCar;
  if (!car) return;
  const throttle = (G.input.held('up') ? 1 : 0) - (G.input.held('down') ? 1 : 0);
  const steer = (G.input.held('right') ? 1 : 0) - (G.input.held('left') ? 1 : 0);
  const handbrake = G.input.held('handbrake');
  G.player.angle = car.angle;
  G.player.x = car.x;
  G.player.y = car.y;
  carStep(G, car, dt, throttle, steer, handbrake);
  // Skid marks under a sliding or hard-braking tyre.
  if ((handbrake || car.braking) && Math.abs(car.speed) > 60) {
    G.effects.skid(G, car);
  }
}
