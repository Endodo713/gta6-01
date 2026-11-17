// Traffic AI: cars follow the road grid in a lane, slow for the car ahead and for a red
// light, and choose a new direction at each intersection. They are ordinary cars with a
// `driver` of 'traffic', so stealing one works exactly like stealing a parked car.

import { CAR, TRAFFIC } from './config.js';
import { makeCar, carStep } from './vehicles.js';

const DIRS = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];

/** A traffic car's route is a list of intersection cells [ix, iy] it will pass through. */
function newRoute(G, ix, iy, dir) {
  const route = [];
  let cx = ix;
  let cy = iy;
  let d = dir;
  for (let i = 0; i < 7; i += 1) {
    // Pick a new direction at the next intersection: mostly straight, sometimes a turn.
    if (i > 0) {
      const r = Math.random();
      if (r < 0.34) {
        d = [d[1], -d[0]]; // turn right
      } else if (r < 0.66) {
        d = [-d[1], d[0]]; // turn left
      }
    }
    let nx = cx + d[0];
    let ny = cy + d[1];
    if (nx < 1 || nx > G.world.grid - 1) {
      nx = cx - d[0];
      d = [-d[0], d[1]];
    }
    if (ny < 1 || ny > G.world.grid - 1) {
      ny = cy - d[1];
      d = [d[0], -d[1]];
    }
    cx = nx;
    cy = ny;
    route.push({ ix: cx, iy: cy, dir: d.slice() });
  }
  return route;
}

/** Spawn one traffic car on a random road heading in a random direction. */
export function spawnTrafficCar(G) {
  const g = G.world.grid;
  const ix = 1 + Math.floor(Math.random() * (g - 2));
  const iy = 1 + Math.floor(Math.random() * (g - 2));
  const dir = DIRS[Math.floor(Math.random() * 4)];
  const x = ix * G.world.cell + dir[0] * (G.world.cell * 0.4);
  const y = iy * G.world.cell + dir[1] * (G.world.cell * 0.4);
  const kinds = ['sedan', 'sedan', 'sedan', 'taxi', 'sport', 'pickup', 'van'];
  const car = makeCar(kinds[Math.floor(Math.random() * kinds.length)], x, y, Math.atan2(dir[1], dir[0]), 'traffic');
  car.route = newRoute(G, ix, iy, dir);
  car.routeIndex = 0;
  G.cars.push(car);
  return car;
}

function lanePointAt(G, ix, iy, dir) {
  return G.world.lanePoint(ix, iy, dir);
}

/** Advance one traffic car. Returns the car it collided with, if it braked hard. */
export function stepTrafficCar(G, car, dt) {
  if (car.wrecked || car.driver !== 'traffic') return null;
  const route = car.route;
  if (!route || route.length === 0) {
    // Route exhausted: pick a fresh one from the nearest intersection.
    const ix = Math.max(1, Math.min(G.world.grid - 1, Math.round(car.x / G.world.cell)));
    const iy = Math.max(1, Math.min(G.world.grid - 1, Math.round(car.y / G.world.cell)));
    const dir = [Math.cos(car.angle), Math.sin(car.angle)];
    car.route = newRoute(G, ix, iy, dir);
    car.routeIndex = 0;
  }
  const target = route[car.routeIndex];
  const point = lanePointAt(G, target.ix, target.iy, target.dir);
  const dx = point.x - car.x;
  const dy = point.y - car.y;
  const dist = Math.hypot(dx, dy);

  // Have we reached the intersection? Take the next leg.
  if (dist < 26) {
    car.routeIndex += 1;
    if (car.routeIndex >= route.length) {
      car.route = null;
      car.routeIndex = 0;
    }
    return null;
  }

  const desired = Math.atan2(dy, dx);
  const steer = angleDiff(desired, car.angle);
  let throttle = 1;

  // Stop for the car ahead, the one in front in the same lane.
  let ahead = false;
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  for (const other of G.cars) {
    if (other === car || other.wrecked) continue;
    const odx = other.x - car.x;
    const ody = other.y - car.y;
    const forwardDist = odx * fx + ody * fy;
    const sideDist = Math.abs(-odx * fy + ody * fx);
    if (forwardDist > 6 && forwardDist < TRAFFIC.stopGap && sideDist < (car.wid + other.wid) * 0.55) {
      ahead = true;
      break;
    }
  }
  if (ahead) {
    throttle = 0;
    if (car.speed > TRAFFIC.topSpeed * 0.55) throttle = -0.5;
  }

  // Stop at a red light on approach to the next intersection.
  const axis = target.dir[0] !== 0 ? 'ew' : 'ns';
  const green = G.world.trafficLight(target.ix, target.iy, axis, G.time);
  const centreDist = Math.hypot(target.ix * G.world.cell - car.x, target.iy * G.world.cell - car.y);
  if (!green && centreDist < G.world.roadHalf + 30) {
    throttle = car.speed > 30 ? -0.6 : 0;
  }

  // A gentle cruise: cap speed well below the car model's maximum.
  const cruise = TRAFFIC.topSpeed + (Math.sin(car.id * 3.1) + 1) * 22;
  if (car.speed > cruise) throttle = Math.min(throttle, 0);

  const prevSpeed = car.speed;
  carStep(G, car, dt, throttle, clamp(steer, -1, 1), false);
  if (Math.abs(car.speed - prevSpeed) < 0.01 && throttle > 0.5) return car;
  return null;
}

/** Keep traffic at the count: respawn a car far from the player to replace a stolen one. */
export function keepTraffic(G) {
  let count = 0;
  for (const car of G.cars) {
    if (car.driver === 'traffic') count += 1;
  }
  let missing = TRAFFIC.count - count;
  let guard = 0;
  while (missing > 0 && guard < 8) {
    const car = spawnTrafficCar(G);
    // Don't pop it into view.
    if (Math.hypot(car.x - G.player.x, car.y - G.player.y) < TRAFFIC.spawnRange) {
      G.cars.pop();
      guard += 1;
    } else {
      missing -= 1;
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
