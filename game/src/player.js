// The courier on foot: WASD/arrows to walk, Shift to sprint, mouse to aim, click to shoot
// and F to punch. Movement is pushed out of buildings and stopped at the water; the punch is
// a short cone in front of the player that can knock a bystander or a cop flat. Combat
// helpers (fire, hitPed, hitCop) live in combat.js and are reached through the shared game
// object, so the two systems never import each other.

import { GUN, PLAYER } from './config.js';

export function createPlayer(x, y) {
  return {
    x,
    y,
    angle: -Math.PI / 2,
    phase: 0,
    health: PLAYER.health,
    ammo: GUN.mag,
    reserve: GUN.reserve,
    reloading: 0,
    shootCd: 0,
    punchCd: 0,
    punchT: 0,
    inCar: null,
    invuln: 0,
    alive: true,
  };
}

/** The player's position on the 1280x720 field, for aiming at the mouse. */
function screenPos(G) {
  const z = G.cam ? G.cam.zoom : 1;
  return { x: (G.player.x - G.cam.x) * z + 640, y: (G.player.y - G.cam.y) * z + 360 };
}

/** Move the on-foot player one step; mutates the shared game state. */
export function updatePlayer(G, dt) {
  const p = G.player;
  if (!p.alive) return;
  if (p.shootCd > 0) p.shootCd -= dt;
  if (p.punchCd > 0) p.punchCd -= dt;
  if (p.punchT > 0) p.punchT -= dt;
  if (p.invuln > 0) p.invuln -= dt;
  if (p.reloading > 0) {
    p.reloading -= dt;
    if (p.reloading <= 0) {
      const take = Math.min(GUN.mag - p.ammo, p.reserve);
      p.ammo += take;
      p.reserve -= take;
      p.reloading = 0;
      G.audio.play('door');
    }
  }

  const ax = (G.input.held('right') ? 1 : 0) - (G.input.held('left') ? 1 : 0);
  const ay = (G.input.held('down') ? 1 : 0) - (G.input.held('up') ? 1 : 0);
  const sprint = G.input.held('sprint');
  const speed = sprint ? PLAYER.sprint : PLAYER.walk;
  let vx = 0;
  let vy = 0;
  if (ax !== 0 || ay !== 0) {
    const inv = 1 / Math.hypot(ax, ay);
    vx = ax * inv * speed;
    vy = ay * inv * speed;
    p.phase += dt * (sprint ? 13 : 9);
  }

  let nx = p.x + vx * dt;
  let ny = p.y + vy * dt;
  if (G.world.isWater(nx, ny)) {
    nx = p.x;
    ny = p.y;
  }
  const corrected = G.world.collideCircle(nx, ny, PLAYER.radius);
  p.x = corrected.x;
  p.y = corrected.y;

  // Aim at the mouse, which lives in field coordinates.
  const m = G.input.mouse;
  const sp = screenPos(G);
  if (Math.hypot(m.x - sp.x, m.y - sp.y) > 12) {
    p.angle = Math.atan2(m.y - sp.y, m.x - sp.x);
  }

  if (G.input.pressed('reload')) {
    if (p.ammo < GUN.mag && p.reserve > 0) {
      p.reloading = GUN.reload;
      G.audio.play('click');
    }
  }

  if (G.input.pressed('punch') && p.punchCd <= 0) {
    p.punchCd = PLAYER.punchCooldown;
    p.punchT = 0.14;
    G.audio.play('punch');
    G.shake = Math.max(G.shake, 0.1);
    G.combat.punch(G);
  }

  if (G.input.mouse.down && p.shootCd <= 0) {
    if (p.ammo > 0) {
      G.combat.fire(G);
      p.shootCd = GUN.fireRate;
    } else if (p.reserve > 0) {
      p.reloading = GUN.reload;
      p.shootCd = 0.3;
      G.audio.play('click');
    }
  }
}
