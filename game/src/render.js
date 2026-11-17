// Drawing only: the game state in, pixels out. The camera follows the player smoothly and
// zooms out a little when driving; the world is drawn in world units under a transform, then
// the HUD and overlays are drawn in the fixed 1280x720 logical field that is scaled and
// centred to fit the window. All the art is procedural: roads, buildings, cars, people.

import { CAMERA, FONT, PALETTE, VIEW, WORLD } from './config.js';

export const SCREEN = { title: 'title', play: 'play', paused: 'paused', over: 'over' };

const FOV = 1.7;
const SHADOW_DX = -0.62;  // late-afternoon sun low in the west, shadows reaching east
const SHADOW_DY = 0.44;
const SHADOW_LEN = 1.15;

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / VIEW.width, height / VIEW.height);
    view.x = (width - VIEW.width * view.scale) / 2;
    view.y = (height - VIEW.height * view.scale) / 2;
  }

  const fonts = new Map();
  function text(value, x, y, size, color, align, weight) {
    if (!fonts.has(size + '|' + weight)) fonts.set(size + '|' + weight, `${weight || 600} ${size}px ${FONT}`);
    context.font = fonts.get(size + '|' + weight);
    context.fillStyle = color;
    context.textAlign = align || 'left';
    context.textBaseline = 'alphabetic';
    context.fillText(value, x, y);
  }

  // --- Background and ground ----------------------------------------------------------
  function drawWater(px, py, time) {
    const w = WORLD.size + 4000;
    const x = px - w / 2;
    const y = py - w / 2;
    context.fillStyle = PALETTE.waterDeep;
    context.fillRect(x, y, w, w);
    // Slow broad ripples across the sea, cheap: a few translucent arcs.
    context.strokeStyle = 'rgba(255,255,255,0.05)';
    context.lineWidth = 3;
    const t = time * 0.4;
    for (let i = 0; i < 6; i += 1) {
      const ry = py - 700 + ((i * 340 + t * 60) % 1400);
      const rx = px - 800 + ((i * 520 + t * 34) % 1600);
      context.beginPath();
      context.arc(rx, ry, 90 + i * 16, 0, Math.PI * 2);
      context.stroke();
    }
  }

  // The land rectangle: grass base, beach sand strip, then the sea beyond it.
  function drawGround(time) {
    const land = WORLD.land;
    context.fillStyle = PALETTE.grass;
    context.fillRect(land.x0 - 8, land.y0 - 8, land.x1 - land.x0 + 16, land.y1 - land.y0 + 16);
    // Sand along the south shore, with a wet edge at the water line.
    context.fillStyle = PALETTE.sand;
    context.fillRect(land.x0, WORLD.beachY, land.x1 - land.x0, land.y1 - WORLD.beachY);
    context.fillStyle = PALETTE.sandWet;
    context.fillRect(land.x0, land.y1 - 26, land.x1 - land.x0, 26);
  }

  // --- Roads and markings --------------------------------------------------------------
  function drawRoads(world, time) {
    const land = WORLD.land;
    const rh = WORLD.roadHalf;
    // Asphalt over every road strip, clipped to the land rectangle.
    context.fillStyle = PALETTE.asphalt;
    for (const cx of world.centres) {
      context.fillRect(cx - rh, land.y0, rh * 2, land.y1 - land.y0);
      context.fillRect(land.x0, cx - rh, land.x1 - land.x0, rh * 2);
    }
    // Sidewalk edges just outside the asphalt.
    context.fillStyle = PALETTE.sidewalk;
    for (const cx of world.centres) {
      context.fillRect(cx - rh - 6, land.y0, 6, land.y1 - land.y0);
      context.fillRect(cx + rh, land.y0, 6, land.y1 - land.y0);
      context.fillRect(land.x0, cx - rh - 6, land.x1 - land.x0, 6);
      context.fillRect(land.x0, cx + rh, land.x1 - land.x0, 6);
    }
    // Dashed centre lines on every road, lightened where the light catches them.
    context.strokeStyle = PALETTE.lane;
    context.lineWidth = 2.4;
    context.setLineDash([16, 22]);
    for (const cx of world.centres) {
      context.beginPath();
      context.moveTo(cx, land.y0);
      context.lineTo(cx, land.y1);
      context.stroke();
      context.beginPath();
      context.moveTo(land.x0, cx);
      context.lineTo(land.x1, cx);
      context.stroke();
    }
    context.setLineDash([]);
    // Crosswalks at each intersection: white stripes on all four corners.
    context.fillStyle = PALETTE.crosswalk;
    const cw = 10;
    for (const ix of world.centres) {
      for (const iy of world.centres) {
        for (let s = -1; s <= 1; s += 2) {
          for (let k = -rh + 8; k < rh - 8; k += cw + 8) {
            context.fillRect(ix + k, iy + s * (rh - 4), cw, s > 0 ? 4 : 4);
            context.fillRect(ix + s * (rh - 4), iy + k, s > 0 ? 4 : 4, cw);
          }
        }
      }
    }
    // Traffic lights as small posts with a lit lens, one per intersection corner.
    for (let gi = 1; gi < world.grid; gi += 1) {
      for (let gj = 1; gj < world.grid; gj += 1) {
        const ix = gi * world.cell;
        const iy = gj * world.cell;
        const axis = gi % 2 === gj % 2 ? 'ns' : 'ew';
        const green = world.trafficLight(gi, gj, axis, time);
        const lx = ix + rh + 2;
        const ly = iy - rh - 2;
        context.fillStyle = '#20242b';
        context.fillRect(lx - 2, ly - 8, 4, 10);
        context.fillStyle = green ? '#62e06b' : '#e2574b';
        context.beginPath();
        context.arc(lx, ly, 3.4, 0, Math.PI * 2);
        context.fill();
      }
    }
  }

  // --- Buildings, trees and props ------------------------------------------------------
  // A long shadow from a low afternoon sun, cast east down the block.
  function castShadow(x, y, w, h, height) {
    const len = height * SHADOW_LEN;
    context.fillStyle = PALETTE.shadow;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + w, y);
    context.lineTo(x + w + SHADOW_DX * len, y + SHADOW_DY * len);
    context.lineTo(x + SHADOW_DX * len, y + SHADOW_DY * len);
    context.closePath();
    context.fill();
  }

  function drawBuildings(world) {
    for (const b of world.buildings) {
      if (b.cx < cam.x - 600 || b.cx > cam.x + 600 || b.cy < cam.y - 600 || b.cy > cam.y + 600) continue;
      castShadow(b.x, b.y, b.w, b.h, b.height);
      // Roof slab.
      context.fillStyle = b.color;
      context.fillRect(b.x, b.y, b.w, b.h);
      // A lighter fascia on the sun side gives a cheap sense of height.
      context.fillStyle = 'rgba(255,246,222,0.16)';
      context.fillRect(b.x, b.y, b.w, 5);
      context.fillStyle = 'rgba(18,26,34,0.22)';
      context.fillRect(b.x, b.y + b.h - 4, b.w, 4);
      if (b.type === 'tower') {
        context.fillStyle = 'rgba(18,26,34,0.16)';
        const pad = b.w * 0.16;
        context.fillRect(b.x + pad, b.y + pad, b.w - pad * 2, b.h - pad * 2);
        context.fillStyle = b.color;
        context.fillRect(b.x + pad * 1.6, b.y + pad * 1.6, b.w - pad * 3.2, b.h - pad * 3.2);
      } else if (b.type === 'warehouse') {
        // Roll-up doors along the south face.
        context.fillStyle = 'rgba(18,26,34,0.2)';
        for (let d = b.x + 8; d < b.x + b.w - 12; d += 26) {
          context.fillRect(d, b.y + b.h - 9, 15, 6);
        }
      } else if (b.type === 'old' || b.type === 'hut') {
        context.strokeStyle = 'rgba(18,26,34,0.18)';
        context.lineWidth = 1.4;
        context.strokeRect(b.x + 3, b.y + 3, b.w - 6, b.h - 6);
      } else {
        context.fillStyle = 'rgba(18,26,34,0.14)';
        const pad = b.w * 0.2;
        context.fillRect(b.x + pad, b.y + pad, b.w - pad * 2, b.h - pad * 2);
      }
    }
  }

  function drawTreesAndProps(world) {
    for (const t of world.trees) {
      if (t.x < cam.x - 400 || t.x > cam.x + 400 || t.y < cam.y - 400 || t.y > cam.y + 400) continue;
      context.fillStyle = PALETTE.shadow;
      context.beginPath();
      context.ellipse(t.x + SHADOW_DX * t.r * 1.6, t.y + SHADOW_DY * t.r * 1.6, t.r * 1.02, t.r * 0.7, 0, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#3c2f22';
      context.beginPath();
      context.arc(t.x, t.y, 2.6, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = t.color;
      context.beginPath();
      context.arc(t.x, t.y, t.r, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = 'rgba(255,246,214,0.14)';
      context.beginPath();
      context.arc(t.x - t.r * 0.3, t.y - t.r * 0.3, t.r * 0.5, 0, Math.PI * 2);
      context.fill();
    }
    // Waterfront gear: crane gantries, container stacks, a pier and a boardwalk strip.
    for (const p of world.props) {
      if (p.type === 'crane') {
        context.fillStyle = '#8c9099';
        context.fillRect(p.x - 22, p.y, 44, 5);
        context.fillRect(p.x - 2, p.y, 5, 30);
        context.fillStyle = '#e0a13c';
        context.fillRect(p.x - 22, p.y - 6, 44, 6);
      } else {
        context.fillStyle = PALETTE.shadow;
        context.fillRect(p.x + 10, p.y + 12, p.w, p.h);
        context.fillStyle = '#a8563f';
        context.fillRect(p.x, p.y, p.w, p.h);
        context.fillStyle = 'rgba(18,26,34,0.25)';
        for (let s = 6; s < p.w; s += 12) context.fillRect(p.x + s, p.y, 2, p.h);
      }
    }
  }

  // The boardwalk and sea edge, plus a subtle tide line.
  function drawShore() {
    const land = WORLD.land;
    context.fillStyle = '#b0894f';
    context.fillRect(land.x0, WORLD.beachY - 22, land.x1 - land.x0, 10);
    context.fillStyle = 'rgba(255,255,255,0.32)';
    context.fillRect(land.x0, land.y1 - 6, land.x1 - land.x0, 3);
  }

  // --- People --------------------------------------------------------------------------
  function drawPerson(x, y, angle, palette, phase, scale) {
    const s = scale || 1;
    context.save();
    context.translate(x, y);
    context.rotate(angle);
    context.scale(s, s);
    // Long shadow at the feet.
    context.fillStyle = PALETTE.carShadow;
    context.beginPath();
    context.ellipse(SHADOW_DX * 6, SHADOW_DY * 6 + 3, 7, 3.4, 0, 0, Math.PI * 2);
    context.fill();
    // Legs swing with the walk phase.
    const leg = Math.sin(phase) * 3.4;
    context.strokeStyle = palette.legs;
    context.lineWidth = 3;
    context.lineCap = 'round';
    context.beginPath();
    context.moveTo(-2, -2);
    context.lineTo(-2 + leg, 4);
    context.moveTo(2, -2);
    context.lineTo(2 - leg, 4);
    context.stroke();
    // Torso and head.
    context.fillStyle = palette.shirt;
    context.beginPath();
    context.arc(0, 0, 5.4, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = palette.skin;
    context.beginPath();
    context.arc(1.2, -0.5, 3.1, 0, Math.PI * 2);
    context.fill();
    // Arms point where the person faces.
    context.strokeStyle = palette.shirt;
    context.lineWidth = 2.4;
    context.beginPath();
    context.moveTo(0, 0);
    context.lineTo(5, 1.4);
    context.stroke();
    context.restore();
  }

  const PED_PALETTES = [
    { shirt: '#c96b4e', legs: '#3a4552', skin: '#e3b98f' },
    { shirt: '#5a8bc4', legs: '#52463a', skin: '#d9a877' },
    { shirt: '#8fbb6a', legs: '#3d3d48', skin: '#e7c39b' },
    { shirt: '#d9a04c', legs: '#404a55', skin: '#c98a5f' },
    { shirt: '#9a7fc4', legs: '#3c3f4a', skin: '#e3b98f' },
    { shirt: '#4fb3ab', legs: '#544a3d', skin: '#d9a877' },
  ];

  function drawPeds(G) {
    for (const p of G.peds) {
      if (!p.alive) continue;
      drawPerson(p.x, p.y, p.angle, PED_PALETTES[p.palette % PED_PALETTES.length], p.phase, 1);
    }
    // Foot cops wear navy and carry a little cap.
    for (const c of G.cops) {
      if (!c.onFoot || !c.alive) continue;
      context.save();
      context.translate(c.x, c.y);
      context.rotate(c.angle);
      context.fillStyle = PALETTE.carShadow;
      context.beginPath();
      context.ellipse(SHADOW_DX * 6, SHADOW_DY * 6 + 3, 7, 3.4, 0, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = PALETTE.police;
      context.lineWidth = 3;
      context.lineCap = 'round';
      const leg = Math.sin(c.phase) * 3.4;
      context.beginPath();
      context.moveTo(-2, -2);
      context.lineTo(-2 + leg, 4);
      context.moveTo(2, -2);
      context.lineTo(2 - leg, 4);
      context.stroke();
      context.fillStyle = PALETTE.police;
      context.beginPath();
      context.arc(0, 0, 5.4, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#e3b98f';
      context.beginPath();
      context.arc(1.2, -0.5, 3.1, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = PALETTE.policeBlue;
      context.beginPath();
      context.arc(2, -0.8, 2.6, 0, Math.PI * 2);
      context.fill();
      context.restore();
    }
  }

  // --- Cars ----------------------------------------------------------------------------
  const CAR_BODIES = {
    sedan:  { len: 52, wid: 26, color: '#c9564e' },
    sport:  { len: 48, wid: 24, color: '#4d9de0' },
    van:    { len: 60, wid: 28, color: '#d9c46a' },
    taxi:   { len: 50, wid: 25, color: '#e0c04c' },
    pickup: { len: 56, wid: 27, color: '#8b6f4e' },
    cop:    { len: 54, wid: 27, color: '#22304a' },
  };

  function drawCarBody(G, car, x, y, angle) {
    const spec = CAR_BODIES[car.kind] || CAR_BODIES.sedan;
    const len = car.len || spec.len;
    const wid = car.wid || spec.wid;
    const color = car.color || spec.color;
    context.save();
    context.translate(x, y);
    context.rotate(angle);
    // Shadow.
    context.fillStyle = PALETTE.carShadow;
    context.fillRect(-len / 2 + SHADOW_DX * 7, -wid / 2 + SHADOW_DY * 7 + 4, len, wid);
    // Body.
    context.fillStyle = color;
    context.fillRect(-len / 2, -wid / 2, len, wid);
    // Rounded nose and tail with a lighter sheen on the sun side.
    context.fillStyle = 'rgba(255,246,222,0.2)';
    context.fillRect(-len / 2 + 3, -wid / 2, len - 6, 3);
    context.fillStyle = 'rgba(18,26,34,0.3)';
    context.fillRect(-len / 2 + 3, wid / 2 - 3, len - 6, 3);
    // Cabin glass.
    context.fillStyle = '#1b2733';
    const cab = len * 0.42;
    context.fillRect(-cab / 2, -wid / 2 + 4, cab, wid - 8);
    context.fillStyle = 'rgba(210,230,246,0.22)';
    context.fillRect(-cab / 2 + 2, -wid / 2 + 5, cab - 4, 3);
    // Headlights at the nose (+x) and tail lights at the back.
    context.fillStyle = '#ffe9a8';
    context.fillRect(len / 2 - 4, -wid / 2 + 3, 4, 4);
    context.fillRect(len / 2 - 4, wid / 2 - 7, 4, 4);
    context.fillStyle = '#e2574b';
    context.fillRect(-len / 2, -wid / 2 + 3, 3, 4);
    context.fillRect(-len / 2, wid / 2 - 7, 3, 4);
    // Police light bar.
    if (car.kind === 'cop') {
      context.fillStyle = PALETTE.policeLight;
      context.fillRect(-6, -wid / 2 + 2, 12, 4);
      context.fillStyle = PALETTE.policeBlue;
      context.fillRect(-6, wid / 2 - 6, 12, 4);
    }
    context.restore();
  }

  function drawCars(G) {
    // Headlight cones at dusk.
    for (const car of G.cars) {
      if (car.wrecked || Math.abs(car.speed) < 40) continue;
      drawHeadlights(car);
    }
    for (const car of G.cars) {
      if (car.wrecked) drawWreck(car);
      else drawCarBody(G, car, car.x, car.y, car.angle);
    }
  }

  function drawHeadlights(car) {
    const spec = CAR_BODIES[car.kind] || CAR_BODIES.sedan;
    const len = car.len || spec.len;
    const wid = car.wid || spec.wid;
    const nose = len / 2;
    context.save();
    context.translate(car.x, car.y);
    context.rotate(car.angle);
    const cone = 120 + Math.abs(car.speed) * 0.12;
    const grad = context.createLinearGradient(nose, 0, nose + cone, 0);
    grad.addColorStop(0, PALETTE.headlight);
    grad.addColorStop(1, 'rgba(255,236,170,0)');
    context.fillStyle = grad;
    context.beginPath();
    context.moveTo(nose - 2, -wid / 2 + 4);
    context.lineTo(nose + cone, -wid / 2 - cone * 0.34);
    context.lineTo(nose + cone, wid / 2 + cone * 0.34);
    context.lineTo(nose - 2, wid / 2 - 4);
    context.closePath();
    context.fill();
    context.restore();
  }

  function drawWreck(car) {
    context.save();
    context.translate(car.x, car.y);
    context.rotate(car.angle);
    const spec = CAR_BODIES[car.kind] || CAR_BODIES.sedan;
    const len = (car.len || spec.len) * 1.04;
    const wid = (car.wid || spec.wid) * 1.04;
    context.fillStyle = '#2a2d33';
    context.fillRect(-len / 2, -wid / 2, len, wid);
    context.fillStyle = 'rgba(18,26,34,0.5)';
    context.fillRect(-len / 2 + 3, -wid / 2 + 3, len - 6, wid - 6);
    context.restore();
  }

  // --- Player --------------------------------------------------------------------------
  function drawPlayer(G) {
    const p = G.player;
    if (p.inCar) return;
    const palette = { shirt: '#e5b23c', legs: '#333a45', skin: '#e3b98f' };
    drawPerson(p.x, p.y, p.angle, palette, p.phase, 1.06);
    // The pistol, drawn out along the aim.
    if (p.ammo > 0 || p.reloading > 0) {
      context.save();
      context.translate(p.x, p.y);
      context.rotate(p.angle);
      context.fillStyle = '#22262d';
      context.fillRect(5, -1.6, 9, 3.2);
      context.fillRect(8, 0, 2, 4);
      context.restore();
    }
    // A short white aim line to the mouse, so shooting feels deliberate.
    if (G.input && G.input.mouse.down) {
      const mx = p.x + Math.cos(p.angle) * 26;
      const my = p.y + Math.sin(p.angle) * 26;
      context.strokeStyle = 'rgba(255,255,255,0.18)';
      context.lineWidth = 1.4;
      context.setLineDash([3, 6]);
      context.beginPath();
      context.moveTo(mx, my);
      context.lineTo(mx + Math.cos(p.angle) * 150, my + Math.sin(p.angle) * 150);
      context.stroke();
      context.setLineDash([]);
    }
    // Punch flash.
    if (p.punchT > 0) {
      context.fillStyle = 'rgba(255,255,255,0.7)';
      context.beginPath();
      context.arc(p.x + Math.cos(p.angle) * 16, p.y + Math.sin(p.angle) * 16, 5, 0, Math.PI * 2);
      context.fill();
    }
  }

  // --- Bullets, pickups, particles, skids ----------------------------------------------
  function drawBullets(G) {
    for (const b of G.bullets) {
      context.strokeStyle = PALETTE.bullet;
      context.lineWidth = 2.4;
      context.beginPath();
      context.moveTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02);
      context.lineTo(b.x, b.y);
      context.stroke();
      context.fillStyle = PALETTE.bullet;
      context.beginPath();
      context.arc(b.x, b.y, 1.6, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawPickups(G) {
    const t = G.time;
    for (const p of G.pickups) {
      const bob = Math.sin(t * 3 + p.seed) * 3;
      context.save();
      context.translate(p.x, p.y + bob);
      if (p.kind === 'health') {
        context.fillStyle = PALETTE.shadow;
        context.beginPath();
        context.ellipse(0, 10, 10, 4, 0, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = '#f3f5f8';
        context.beginPath();
        context.arc(0, 0, 10, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = PALETTE.health;
        context.fillRect(-7, -2, 14, 5);
        context.fillRect(-2.5, -7, 5, 14);
      } else if (p.kind === 'ammo') {
        context.fillStyle = PALETTE.shadow;
        context.beginPath();
        context.ellipse(0, 10, 10, 4, 0, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = '#f3f5f8';
        context.fillRect(-10, -7, 20, 14);
        context.fillStyle = PALETTE.accent;
        context.fillRect(-6, -4, 5, 8);
        context.fillRect(1, -4, 5, 8);
      } else {
        context.fillStyle = PALETTE.shadow;
        context.beginPath();
        context.ellipse(0, 8, 9, 4, 0, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = PALETTE.accent;
        context.beginPath();
        context.arc(0, 0, 9, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = '#8a6a10';
        context.fillRect(-1.5, -5, 3, 10);
      }
      context.restore();
    }
  }

  function drawParticles(G) {
    for (const pt of G.particles) {
      const a = Math.max(0, pt.life / pt.max);
      if (pt.kind === 'spark') {
        context.strokeStyle = `rgba(255,214,120,${a})`;
        context.lineWidth = 2;
        context.beginPath();
        context.moveTo(pt.x, pt.y);
        context.lineTo(pt.x - pt.vx * 0.05, pt.y - pt.vy * 0.05);
        context.stroke();
      } else if (pt.kind === 'muzzle') {
        context.fillStyle = `rgba(255,236,150,${a})`;
        context.beginPath();
        context.arc(pt.x, pt.y, 3 + (1 - a) * 6, 0, Math.PI * 2);
        context.fill();
      } else {
        context.fillStyle = `rgba(210,214,220,${a * 0.4})`;
        context.beginPath();
        context.arc(pt.x, pt.y, 2 + (1 - a) * 5, 0, Math.PI * 2);
        context.fill();
      }
    }
  }

  function drawSkids(G) {
    context.strokeStyle = 'rgba(20,20,24,0.5)';
    context.lineWidth = 3.4;
    context.lineCap = 'round';
    for (const s of G.skids) {
      context.globalAlpha = Math.max(0, s.life / s.max);
      context.beginPath();
      context.moveTo(s.x1, s.y1);
      context.lineTo(s.x2, s.y2);
      context.stroke();
    }
    context.globalAlpha = 1;
  }

  // The mission marker: a ring on the ground and a bobbing beacon over the spot.
  function drawMarker(G) {
    const m = G.mission.marker;
    if (!m) return;
    const t = G.time;
    const pulse = 1 + Math.sin(t * 4) * 0.16;
    context.strokeStyle = 'rgba(240,178,60,0.9)';
    context.lineWidth = 3;
    context.beginPath();
    context.ellipse(m.x, m.y, 26 * pulse, 18 * pulse, 0, 0, Math.PI * 2);
    context.stroke();
    context.fillStyle = 'rgba(240,178,60,0.24)';
    context.beginPath();
    context.ellipse(m.x, m.y, 26 * pulse, 18 * pulse, 0, 0, Math.PI * 2);
    context.fill();
    const bob = 54 + Math.sin(t * 2.4) * 6;
    context.fillStyle = PALETTE.accent;
    context.beginPath();
    context.moveTo(m.x, m.y - bob + 16);
    context.lineTo(m.x - 9, m.y - bob);
    context.lineTo(m.x + 9, m.y - bob);
    context.closePath();
    context.fill();
    context.fillStyle = PALETTE.accent;
    context.beginPath();
    context.arc(m.x, m.y - bob, 5, 0, Math.PI * 2);
    context.fill();
  }

  // --- Frame ---------------------------------------------------------------------------
  let cam = null;

  // A warm afternoon gradient over the whole field, with a soft vignette at the corners.
  function dayOverlay() {
    const g = context.createLinearGradient(0, 0, 0, VIEW.height);
    g.addColorStop(0, 'rgba(255,222,150,0.10)');
    g.addColorStop(0.5, 'rgba(255,214,140,0.05)');
    g.addColorStop(1, 'rgba(120,90,160,0.10)');
    context.fillStyle = g;
    context.fillRect(0, 0, VIEW.width, VIEW.height);
  }

  /** Advance the camera toward the player and hand back the zoom it settled on. */
  function updateCamera(G, dt) {
    if (!cam) cam = { x: G.cam.x, y: G.cam.y, zoom: G.cam.zoom || 1 };
    const target = G.player.inCar ? CAMERA.zoomDrive : CAMERA.zoomFoot;
    cam.zoom += (target - cam.zoom) * Math.min(1, dt * 3);
    const look = G.player.inCar ? CAMERA.lookAhead : 46;
    const tx = G.player.x + Math.cos(G.player.angle) * look;
    const ty = G.player.y + Math.sin(G.player.angle) * look;
    const ease = Math.min(1, dt * CAMERA.speed);
    cam.x += (tx - cam.x) * ease;
    cam.y += (ty - cam.y) * ease;
    G.cam = cam;
    // Screen shake from impacts and gunfire.
    if (G.shake > 0) {
      G.shake -= dt;
      cam.ox = (Math.random() - 0.5) * G.shake * 26;
      cam.oy = (Math.random() - 0.5) * G.shake * 26;
    } else {
      cam.ox = 0;
      cam.oy = 0;
    }
    return cam.zoom;
  }

  function draw(G) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);

    // World space: centre the camera in the field, zoom, then push the shake offset.
    context.save();
    const z = G.cam.zoom;
    context.translate(VIEW.width / 2 + (G.cam.ox || 0), VIEW.height / 2 + (G.cam.oy || 0));
    context.scale(z, z);
    context.translate(-G.cam.x, -G.cam.y);

    drawWater(G.cam.x, G.cam.y, G.time);
    drawGround(G.time);
    drawShore();
    drawRoads(G.world, G.time);
    drawBuildings(G.world);
    drawTreesAndProps(G.world);
    drawSkids(G);
    drawPickups(G);
    drawMarker(G);
    drawPeds(G);
    drawCars(G);
    drawPlayer(G);
    drawBullets(G);
    drawParticles(G);
    context.restore();

    // The screen-space lighting overlay, then the HUD is drawn by its own module.
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    dayOverlay();
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, updateCamera, resize };
}
