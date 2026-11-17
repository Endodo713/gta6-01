// The heads-up display: health, cash, ammo, wanted stars, the mission objective and a live
// minimap. Dialogue boxes and the pause / game-over / mission-complete screens are drawn here
// too, so the renderer stays purely a world painter.

import { MINIMAP, PALETTE, VIEW } from './config.js';

export function createHud() {
  let bestLabel = 'Best 0';
  let bestValue = 0;
  let objectiveLabel = '';

  return {
    draw: function drawHud(G) {
      const { context } = G;
      drawVitals(G);
      drawWanted(G);
      drawObjective(G);
      drawAmmo(G);
      drawSpeed(G);
      drawMinimap(G);
      if (G.flashCash > 0) {
        G.flashCash -= 1 / 60;
        context.globalAlpha = Math.min(1, G.flashCash);
        context.fillStyle = PALETTE.accent;
        context.textAlign = 'left';
        context.fillText('+$', 22, 152);
        context.globalAlpha = 1;
      }
    },
    drawDialogue: function drawDialogue(G) {
      const { context } = G;
      const m = G.mission;
      if (!m || (m.phase !== 'intro' && m.phase !== 'outro')) return;
      const def = G.missions.def(m.index);
      if (!def) return;
      const lines = m.phase === 'intro' ? def.intro : def.outro;
      const line = lines[Math.min(m.line, lines.length - 1)];
      panel(G, 24, VIEW.height - 190, 620, 150);
      context.fillStyle = PALETTE.accent;
      context.textAlign = 'left';
      context.font = '700 17px system-ui, sans-serif';
      context.fillText(m.phase === 'intro' ? def.title.toUpperCase() : def.title.toUpperCase() + ' - COMPLETE', 44, VIEW.height - 162);
      context.fillStyle = PALETTE.text;
      context.font = '400 16px system-ui, sans-serif';
      context.fillText(line, 44, VIEW.height - 128);
      context.fillStyle = PALETTE.muted;
      context.font = '400 13px system-ui, sans-serif';
      context.fillText('Press E or Enter to continue', 44, VIEW.height - 62);
    },
    bestLabel: function best(v) {
      if (v !== bestValue) {
        bestValue = v;
        bestLabel = 'Best ' + v;
      }
      return bestLabel;
    },
  };
}

function drawVitals(G) {
  const { context } = G;
  const p = G.player;
  context.textAlign = 'left';
  context.textBaseline = 'alphabetic';
  // Health bar, filled left to right, turning red when low.
  context.fillStyle = 'rgba(10,14,20,0.55)';
  context.fillRect(20, 20, 190, 16);
  const hp = Math.max(0, p.health);
  context.fillStyle = hp > 30 ? PALETTE.health : PALETTE.healthLow;
  context.fillRect(23, 23, 184 * (hp / 100), 10);
  // Cash.
  context.fillStyle = PALETTE.accent;
  context.font = '700 19px system-ui, sans-serif';
  context.fillText('$' + G.cash, 22, 64);
  context.font = '400 13px system-ui, sans-serif';
  context.fillStyle = PALETTE.muted;
  context.fillText('cash', 22, 81);
  // Ammo pips below the health bar.
  if (p.ammo > 0 || p.reserve > 0) {
    context.fillStyle = PALETTE.text;
    context.font = '700 15px system-ui, sans-serif';
    context.fillText(String(p.ammo), 22, 106);
    context.fillStyle = PALETTE.muted;
    context.font = '400 13px system-ui, sans-serif';
    context.fillText('/ ' + p.reserve, 22 + String(p.ammo).length * 9 + 4, 106);
    if (p.reloading > 0) {
      context.fillText('RELOADING', 60, 106);
    }
  }
}

function drawWanted(G) {
  const { context } = G;
  const stars = G.wanted.stars;
  const right = VIEW.width - 24;
  for (let i = 0; i < 5; i += 1) {
    const x = right - (4 - i) * 26;
    drawStar(context, x, 34, 10, i < stars);
  }
}

function drawStar(context, cx, cy, r, filled) {
  context.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const rad = i % 2 === 0 ? r : r * 0.42;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const px = cx + Math.cos(a) * rad;
    const py = cy + Math.sin(a) * rad;
    if (i === 0) context.moveTo(px, py);
    else context.lineTo(px, py);
  }
  context.closePath();
  if (filled) {
    context.fillStyle = PALETTE.star;
    context.fill();
  } else {
    context.strokeStyle = 'rgba(255,209,88,0.3)';
    context.lineWidth = 1.4;
    context.stroke();
  }
}

function drawObjective(G) {
  const { context } = G;
  const m = G.mission;
  if (!m || m.phase !== 'run' || !m.objective) return;
  context.textAlign = 'center';
  context.textBaseline = 'alphabetic';
  context.font = '700 17px system-ui, sans-serif';
  context.fillStyle = 'rgba(10,14,20,0.5)';
  const w = context.measureText(m.objective).width + 34;
  context.fillRect(VIEW.width / 2 - w / 2, 92, w, 28);
  context.fillStyle = PALETTE.accent;
  context.fillText(m.objective, VIEW.width / 2, 112);
  if (m.timer > 0) {
    context.fillStyle = PALETTE.text;
    context.font = '700 22px system-ui, sans-serif';
    context.fillText(Math.ceil(m.timer) + 's', VIEW.width / 2, 142);
  }
}

function drawAmmo(G) {
  // Handled inside vitals.
}

function drawSpeed(G) {
  const { context } = G;
  const car = G.player.inCar;
  if (!car) return;
  const kmh = Math.abs(Math.round(car.speed * 0.28));
  context.textAlign = 'right';
  context.textBaseline = 'alphabetic';
  context.font = '700 26px system-ui, sans-serif';
  context.fillStyle = PALETTE.text;
  context.fillText(String(kmh), VIEW.width - 26, VIEW.height - 58);
  context.font = '400 14px system-ui, sans-serif';
  context.fillStyle = PALETTE.muted;
  context.fillText('km/h', VIEW.width - 26, VIEW.height - 38);
}

// --- Minimap ---------------------------------------------------------------------------
function drawMinimap(G) {
  const { context } = G;
  const size = MINIMAP.size;
  const r = MINIMAP.radius;
  const cx = VIEW.width - size / 2 - 24;
  const cy = size / 2 + 56;
  const scale = (size - 8) / 3000;
  // Round clip.
  context.save();
  context.beginPath();
  context.arc(cx, cy, r, 0, Math.PI * 2);
  context.clip();
  // Sea.
  context.fillStyle = PALETTE.waterDeep;
  context.fillRect(cx - r, cy - r, size, size);
  // Land block.
  const lx = cx - size / 2 + G.world.land.x0 * scale;
  const ly = cy - size / 2 + G.world.land.y0 * scale;
  const lw = (G.world.land.x1 - G.world.land.x0) * scale;
  const lh = (G.world.land.y1 - G.world.land.y0) * scale;
  context.fillStyle = PALETTE.grass;
  context.fillRect(lx, ly, lw, lh);
  // Sand strip.
  context.fillStyle = PALETTE.sand;
  context.fillRect(lx, cy - size / 2 + G.world.beachY * scale, lw, lh - (G.world.beachY - G.world.land.y0) * scale);
  // Roads.
  context.strokeStyle = 'rgba(240,240,240,0.75)';
  context.lineWidth = 1.6;
  for (const c of G.world.centres) {
    const rx = cx - size / 2 + c * scale;
    const ry = cy - size / 2 + c * scale;
    context.beginPath();
    context.moveTo(rx, ly);
    context.lineTo(rx, ly + lh);
    context.stroke();
    context.beginPath();
    context.moveTo(lx, ry);
    context.lineTo(lx + lw, ry);
    context.stroke();
  }
  // Entities.
  for (const car of G.cars) {
    if (car.wrecked) continue;
    const px = cx - size / 2 + car.x * scale;
    const py = cy - size / 2 + car.y * scale;
    if (Math.hypot(px - cx, py - cy) > r - 4) continue;
    context.fillStyle = car.kind === 'cop' ? PALETTE.policeBlue : 'rgba(255,255,255,0.7)';
    context.fillRect(px - 1.5, py - 1.5, 3, 3);
  }
  for (const cop of G.cops) {
    if (!cop.alive) continue;
    const px = cx - size / 2 + cop.x * scale;
    const py = cy - size / 2 + cop.y * scale;
    if (Math.hypot(px - cx, py - cy) > r - 4) continue;
    context.fillStyle = PALETTE.policeLight;
    context.fillRect(px - 1.5, py - 1.5, 3, 3);
  }
  // Mission marker.
  const marker = G.mission.marker;
  if (marker) {
    const px = cx - size / 2 + marker.x * scale;
    const py = cy - size / 2 + marker.y * scale;
    const dx = px - cx;
    const dy = py - cy;
    const d = Math.hypot(dx, dy);
    if (d > r - 6) {
      const a = Math.atan2(dy, dx);
      const ex = cx + Math.cos(a) * (r - 7);
      const ey = cy + Math.sin(a) * (r - 7);
      context.fillStyle = PALETTE.accent;
      context.beginPath();
      context.arc(ex, ey, 4, 0, Math.PI * 2);
      context.fill();
    } else {
      context.fillStyle = PALETTE.accent;
      context.beginPath();
      context.arc(px, py, 4, 0, Math.PI * 2);
      context.fill();
    }
  }
  // Player: a wedge showing the way they face, and north is a small N at the top.
  const px = cx - size / 2 + G.player.x * scale;
  const py = cy - size / 2 + G.player.y * scale;
  context.save();
  context.translate(px, py);
  context.rotate(G.player.angle);
  context.fillStyle = PALETTE.accent;
  context.beginPath();
  context.moveTo(6, 0);
  context.lineTo(-3, -4);
  context.lineTo(-3, 4);
  context.closePath();
  context.fill();
  context.restore();
  context.restore();
  // Ring and north marker.
  context.strokeStyle = 'rgba(255,255,255,0.3)';
  context.lineWidth = 2;
  context.beginPath();
  context.arc(cx, cy, r, 0, Math.PI * 2);
  context.stroke();
  context.fillStyle = PALETTE.text;
  context.font = '700 13px system-ui, sans-serif';
  context.textAlign = 'center';
  context.fillText('N', cx, cy - r + 15);
}

// --- Screens ---------------------------------------------------------------------------
function panel(G, x, y, w, h) {
  G.context.fillStyle = PALETTE.panel;
  G.context.fillRect(x, y, w, h);
  G.context.strokeStyle = PALETTE.panelEdge;
  G.context.lineWidth = 1.4;
  G.context.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

export function drawTitle(G) {
  const { context } = G;
  context.fillStyle = 'rgba(10,14,22,0.45)';
  context.fillRect(0, 0, VIEW.width, VIEW.height);
  context.textAlign = 'center';
  context.textBaseline = 'alphabetic';
  context.font = '800 64px system-ui, sans-serif';
  context.fillStyle = PALETTE.accent;
  context.fillText('SOLMAR CITY', VIEW.width / 2, 250);
  context.font = '500 22px system-ui, sans-serif';
  context.fillStyle = PALETTE.text;
  context.fillText('A sun-soaked crime story', VIEW.width / 2, 292);
  context.font = '400 16px system-ui, sans-serif';
  context.fillStyle = PALETTE.muted;
  context.fillText('Mara Kade - bike courier - one job too many', VIEW.width / 2, 320);
  panel(G, VIEW.width / 2 - 260, 380, 520, 190);
  context.textAlign = 'left';
  context.font = '700 22px system-ui, sans-serif';
  context.fillStyle = PALETTE.text;
  context.fillText('New Game', VIEW.width / 2 - 220, 428);
  context.fillStyle = PALETTE.muted;
  context.font = '400 15px system-ui, sans-serif';
  context.fillText('Continue', VIEW.width / 2 - 220, 460);
  context.font = '400 14px system-ui, sans-serif';
  context.fillText('Controls: WASD / Arrows move, Shift sprint, E enter car', VIEW.width / 2 - 220, 500);
  context.fillText('F punch, Mouse aim, Click shoot, R reload, M mute', VIEW.width / 2 - 220, 522);
  context.fillStyle = PALETTE.accent;
  context.font = '400 15px system-ui, sans-serif';
  context.fillText('Press Enter to start', VIEW.width / 2 - 220, 556);
}

export function drawPause(G) {
  const { context } = G;
  context.fillStyle = 'rgba(10,14,22,0.55)';
  context.fillRect(0, 0, VIEW.width, VIEW.height);
  panel(G, VIEW.width / 2 - 240, VIEW.height / 2 - 90, 480, 180);
  context.textAlign = 'center';
  context.fillStyle = PALETTE.text;
  context.font = '700 30px system-ui, sans-serif';
  context.fillText('PAUSED', VIEW.width / 2, VIEW.height / 2 - 26);
  context.font = '400 16px system-ui, sans-serif';
  context.fillStyle = PALETTE.muted;
  context.fillText('Press P or Esc to resume, S to save', VIEW.width / 2, VIEW.height / 2 + 16);
  context.fillText('M to mute, Q to quit to title', VIEW.width / 2, VIEW.height / 2 + 42);
}

export function drawGameOver(G, reason) {
  const { context } = G;
  context.fillStyle = 'rgba(10,10,14,0.66)';
  context.fillRect(0, 0, VIEW.width, VIEW.height);
  panel(G, VIEW.width / 2 - 250, VIEW.height / 2 - 110, 500, 220);
  context.textAlign = 'center';
  context.fillStyle = PALETTE.healthLow;
  context.font = '800 40px system-ui, sans-serif';
  context.fillText(reason === 'busted' ? 'BUSTED' : 'WASTED', VIEW.width / 2, VIEW.height / 2 - 42);
  context.fillStyle = PALETTE.text;
  context.font = '500 20px system-ui, sans-serif';
  context.fillText('Cash: $' + G.cash, VIEW.width / 2, VIEW.height / 2 - 4);
  context.font = '400 16px system-ui, sans-serif';
  context.fillStyle = PALETTE.muted;
  context.fillText('Press Enter to return to the title', VIEW.width / 2, VIEW.height / 2 + 44);
}

export function drawMissionComplete(G) {
  const { context } = G;
  context.fillStyle = 'rgba(10,14,22,0.5)';
  context.fillRect(0, 0, VIEW.width, VIEW.height);
  const def = G.missions.def(G.mission.index);
  if (!def) return;
  panel(G, VIEW.width / 2 - 270, VIEW.height / 2 - 120, 540, 240);
  context.textAlign = 'center';
  context.fillStyle = PALETTE.accent;
  context.font = '800 34px system-ui, sans-serif';
  context.fillText('MISSION COMPLETE', VIEW.width / 2, VIEW.height / 2 - 58);
  context.fillStyle = PALETTE.text;
  context.font = '600 24px system-ui, sans-serif';
  context.fillText(def.title, VIEW.width / 2, VIEW.height / 2 - 18);
  context.fillStyle = PALETTE.accent;
  context.font = '700 26px system-ui, sans-serif';
  context.fillText('+$' + def.reward, VIEW.width / 2, VIEW.height / 2 + 20);
  context.fillStyle = PALETTE.muted;
  context.font = '400 16px system-ui, sans-serif';
  context.fillText('Cash: $' + G.cash, VIEW.width / 2, VIEW.height / 2 + 52);
  context.fillText('Press Enter to continue', VIEW.width / 2, VIEW.height / 2 + 84);
}
