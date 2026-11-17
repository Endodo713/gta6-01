// Shooting, bullets, damage and pickups, plus the particle/skid effects every other module
// reaches through the shared game object as G.effects, so nothing has to import this file
// in a cycle. A bullet travels in a straight line, hits the first person, car or building it
// touches, and either wounds it or kicks up sparks.

import { GUN, PICKUP, WANTED, WORLD } from './config.js';
import { randRange } from './random.js';

// --- Wanted level ----------------------------------------------------------------------

/** Add heat for a crime; the police read the stars off the thresholds. */
export function reportCrime(G, type) {
  const amount = WANTED.crimes[type] || 1;
  G.wanted.heat = Math.min(9.5, G.wanted.heat + amount);
  G.wanted.cool = WANTED.coolDown;
}

// --- Player fire -----------------------------------------------------------------------

export function fire(G) {
  const p = G.player;
  p.ammo -= 1;
  const spread = (Math.random() - 0.5) * GUN.spread * 2;
  const a = p.angle + spread;
  const sx = p.x + Math.cos(a) * (p.inCar ? p.inCar.len * 0.5 + 2 : 12);
  const sy = p.y + Math.sin(a) * (p.inCar ? p.inCar.len * 0.5 + 2 : 12);
  G.bullets.push({
    x: sx,
    y: sy,
    vx: Math.cos(a) * GUN.bulletSpeed,
    vy: Math.sin(a) * GUN.bulletSpeed,
    life: GUN.bulletLife,
    from: 'player',
  });
  G.effects.muzzle(G, sx, sy, a);
  G.audio.play('shot');
  G.shake = Math.max(G.shake, 0.14);
  G.aiming = true;
  reportCrime(G, 'shoot');
}

/** Fire a round at a target from anywhere (the police, a crew member). */
export function fireFrom(G, x, y, angle, speed, from) {
  G.bullets.push({
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    life: GUN.bulletLife * 1.25,
    from,
  });
  G.effects.muzzle(G, x, y, angle);
  G.audio.play('shot');
}

// --- Punch -----------------------------------------------------------------------------

export function punch(G) {
  const p = G.player;
  const range = 34;
  const fx = p.x + Math.cos(p.angle) * range;
  const fy = p.y + Math.sin(p.angle) * range;
  for (const ped of G.peds) {
    if (!ped.alive) continue;
    if (Math.hypot(ped.x - fx, ped.y - fy) < 24) hitPed(G, ped, 1, 'punch');
  }
  for (const cop of G.cops) {
    if (!cop.onFoot || !cop.alive) continue;
    if (Math.hypot(cop.x - fx, cop.y - fy) < 24) hitCop(G, cop, 1, 'punch');
  }
  // Punching a parked car is harmless but loud.
  for (const car of G.cars) {
    if (car.wrecked) continue;
    if (Math.hypot(car.x - fx, car.y - fy) < car.wid) {
      G.effects.sparks(G, fx, fy, 3);
      reportCrime(G, 'hitCar');
      break;
    }
  }
}

// --- Damage ----------------------------------------------------------------------------

export function hitPed(G, ped, damage, cause) {
  if (!ped.alive) return;
  ped.health -= damage;
  G.effects.blood(G, ped.x, ped.y);
  if (ped.health <= 0) {
    ped.alive = false;
    ped.dead = 6;
    G.effects.smoke(G, ped.x, ped.y, 5);
    if (cause === 'runover') reportCrime(G, 'runOver');
  } else {
    ped.panic = 3.4;
    reportCrime(G, 'shoot');
  }
}

export function hitCop(G, cop, damage, cause) {
  if (!cop.alive) return;
  cop.health -= damage;
  G.effects.blood(G, cop.x, cop.y);
  if (cop.health <= 0) {
    cop.alive = false;
    cop.dead = 5;
    reportCrime(G, 'cop');
  } else {
    cop.alert = 6;
    reportCrime(G, 'shoot');
  }
}

// --- Bullets and pickups ---------------------------------------------------------------

export function updateCombat(G, dt) {
  updateBullets(G, dt);
  updatePickups(G, dt);
  updateParticles(G, dt);
  updateSkids(G, dt);
  updateSmoke(G, dt);
}

function updateBullets(G, dt) {
  const bullets = G.bullets;
  for (let i = bullets.length - 1; i >= 0; i -= 1) {
    const b = bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    let dead = b.life <= 0;
    if (!dead && G.world.isWater(b.x, b.y)) dead = true;
    // Buildings stop a round with a puff of dust.
    if (!dead) {
      const hit = G.world.collideCircle(b.x, b.y, 1.2);
      if (hit.moved) {
        dead = true;
        G.effects.smoke(G, b.x, b.y, 2);
      }
    }
    if (!dead && b.from === 'player') {
      for (const cop of G.cops) {
        if (!cop.alive || !cop.onFoot) continue;
        if (Math.hypot(b.x - cop.x, b.y - cop.y) < 8) {
          hitCop(G, cop, GUN.damage, 'shot');
          dead = true;
          break;
        }
      }
    }
    if (!dead) {
      for (const car of G.cars) {
        if (car.wrecked) continue;
        const fx = Math.cos(car.angle);
        const fy = Math.sin(car.angle);
        const dx = b.x - car.x;
        const dy = b.y - car.y;
        const along = dx * fx + dy * fy;
        const side = Math.abs(-dx * fy + dy * fx);
        if (Math.abs(along) < car.len / 2 && side < car.wid / 2) {
          if (b.from === 'player' && car.driver === 'cop') {
            reportCrime(G, 'cop');
          }
          G.effects.sparks(G, b.x, b.y, 4);
          G.vehicles.damageCar(G, car, GUN.damage * 0.6);
          dead = true;
          break;
        }
      }
    }
    if (!dead && b.from !== 'player') {
      // A hostile round can hit the courier.
      const p = G.player;
      if (p.alive && Math.hypot(b.x - p.x, b.y - p.y) < 9) {
        hurtPlayer(G, b.damage || 9);
        dead = true;
      }
    }
    if (dead) {
      bullets[i] = bullets[bullets.length - 1];
      bullets.pop();
    }
  }
}

export function hurtPlayer(G, amount) {
  const p = G.player;
  if (p.invuln > 0) return;
  p.health -= amount;
  p.invuln = 0.5;
  G.effects.blood(G, p.x, p.y);
  G.shake = Math.max(G.shake, 0.2);
  G.audio.play('hit');
  if (p.health <= 0) {
    p.health = 0;
    p.alive = false;
  }
}

export function spawnPickup(G, kind, x, y) {
  G.pickups.push({ kind, x, y, seed: Math.random() * 7, life: PICKUP.life });
}

function updatePickups(G, dt) {
  const p = G.player;
  for (let i = G.pickups.length - 1; i >= 0; i -= 1) {
    const pk = G.pickups[i];
    pk.life -= dt;
    if (pk.life <= 0) {
      G.pickups.splice(i, 1);
      continue;
    }
    if (!p.alive) continue;
    if (Math.hypot(pk.x - p.x, pk.y - p.y) < 24) {
      if (pk.kind === 'health') {
        p.health = Math.min(100, p.health + PICKUP.health);
      } else if (pk.kind === 'ammo') {
        p.reserve += PICKUP.ammo;
      } else {
        const cash = PICKUP.cash[Math.floor(Math.random() * PICKUP.cash.length)];
        G.cash += cash;
        G.mission.cashEarned += cash;
        G.flashCash = 1.4;
      }
      G.audio.play('pickup');
      G.pickups.splice(i, 1);
    }
  }
}

// --- Effects (reached by every module as G.effects) ------------------------------------

export const effects = {
  sparks(G, x, y, n) {
    for (let i = 0; i < n; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const sp = randRange(Math.random, 40, 180);
      G.particles.push({ kind: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.4, max: 0.4 });
    }
  },
  smoke(G, x, y, n) {
    for (let i = 0; i < n; i += 1) {
      G.particles.push({ kind: 'smoke', x: x + (Math.random() - 0.5) * 8, y: y + (Math.random() - 0.5) * 8, vx: (Math.random() - 0.5) * 14, vy: -14 - Math.random() * 14, life: 0.8, max: 0.8 });
    }
  },
  blood(G, x, y) {
    for (let i = 0; i < 3; i += 1) {
      G.particles.push({ kind: 'smoke', x, y, vx: (Math.random() - 0.5) * 60, vy: (Math.random() - 0.5) * 60, life: 0.3, max: 0.3 });
    }
  },
  muzzle(G, x, y, angle) {
    G.particles.push({ kind: 'muzzle', x: x + Math.cos(angle) * 2, y: y + Math.sin(angle) * 2, vx: 0, vy: 0, life: 0.07, max: 0.07 });
  },
  skid(G, car) {
    const fx = Math.cos(car.angle);
    const fy = Math.sin(car.angle);
    const rx = -fy;
    const ry = fx;
    const back = -car.len / 2;
    for (const side of [-1, 1]) {
      const x = car.x + fx * back + rx * side * (car.wid / 2 - 3);
      const y = car.y + fy * back + ry * side * (car.wid / 2 - 3);
      G.skids.push({ x1: x, y1: y, x2: x - car.vx * 0.05, y2: y - car.vy * 0.05, life: 6, max: 6 });
    }
    if (G.skids.length > 500) G.skids.splice(0, G.skids.length - 500);
    if (Math.random() < 0.3) G.audio.play('screech');
  },
};

function updateParticles(G, dt) {
  for (let i = G.particles.length - 1; i >= 0; i -= 1) {
    const pt = G.particles[i];
    pt.life -= dt;
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    if (pt.life <= 0) G.particles.splice(i, 1);
  }
}

function updateSkids(G, dt) {
  for (let i = G.skids.length - 1; i >= 0; i -= 1) {
    G.skids[i].life -= dt;
    if (G.skids[i].life <= 0) G.skids.splice(i, 1);
  }
}

function updateSmoke(G, dt) {
  for (const car of G.cars) {
    if (!car.wrecked) continue;
    if (Math.random() < dt * 4) {
      G.effects.smoke(G, car.x + (Math.random() - 0.5) * car.wid, car.y - 6, 1);
    }
  }
}
