// Boot and the one loop. The game moves through states: title, play, paused, the dialogue
// overlay, the mission-complete screen and game over. Input is read every frame, the world
// advances in fixed 1/60 s steps, and the renderer paints what there is. ?shot=<scene>&seed=N
// stages a deterministic screenshot instead of running the loop and sets __shotReady.

import { STEP, VIEW } from './config.js';
import { createRandom } from './random.js';
import { createWorld } from './world.js';
import { createPlayer, updatePlayer } from './player.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer } from './render.js';
import { createHud, drawTitle, drawPause, drawGameOver, drawMissionComplete } from './hud.js';
import { makeCar, tryEnterCar, tryExitCar, drivePlayerCar, damageCar, ejectPlayer, carStep } from './vehicles.js';
import { spawnTrafficCar, stepTrafficCar, keepTraffic } from './traffic.js';
import { updatePeds, spawnPed, runOver } from './pedestrians.js';
import { updatePolice } from './police.js';
import { updateMission, startMission, advanceDialogue, retryMission, abandonMission, nextMission, def, createMissionState } from './missions.js';
import { updateCombat, hurtPlayer, reportCrime, effects, fire, punch } from './combat.js';
import { loadSave, storeSave as persist, emptySave } from './save.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');

// --- Game state ------------------------------------------------------------------------

function createGame() {
  const world = createWorld(createRandom(seed));
  const player = createPlayer(world.plaza.x, world.plaza.y);
  const G = {
    canvas,
    context: canvas.getContext('2d'),
    world,
    player,
    cars: [],
    peds: [],
    cops: [],
    bullets: [],
    pickups: [],
    particles: [],
    skids: [],
    wanted: { heat: 0, stars: 0, cool: 0 },
    cash: 0,
    cam: { x: player.x, y: player.y, zoom: 1 },
    time: 0,
    shake: 0,
    aiming: false,
    flashCash: 0,
    phase: 'title',
    overReason: '',
  };
  G.effects = effects;
  G.vehicles = { makeCar, tryEnterCar, tryExitCar, drivePlayerCar, damageCar, ejectPlayer, carStep };
  G.combat = { updateCombat, hurtPlayer, reportCrime, fire, punch };
  G.missions = { updateMission, startMission, advanceDialogue, retryMission, abandonMission, nextMission, def, createMissionState };
  G.mission = createMissionState();
  G.gameOver = (reason) => gameOver(G, reason);
  G.storeSave = save;
  return G;
}

function populate(G) {
  G.cars.length = 0;
  G.peds.length = 0;
  for (let i = 0; i < 22; i += 1) spawnTrafficCar(G);
  for (let i = 0; i < 18; i += 1) spawnPed(G);
  const c = G.world.cell;
  G.cars.push(makeCar('taxi', 3.2 * c, 4 * c + G.world.laneHalf, 0, null));
  G.cars.push(makeCar('sedan', 4.6 * c, 3 * c - G.world.laneHalf, Math.PI, null));
  G.cars.push(makeCar('pickup', 1.6 * c, 2 * c + G.world.laneHalf, Math.PI / 2, null));
}

function resetState(G, fresh) {
  const w = G.world;
  G.player.x = w.plaza.x;
  G.player.y = w.plaza.y;
  G.player.angle = -Math.PI / 2;
  G.player.health = 100;
  G.player.alive = true;
  G.player.inCar = null;
  G.player.ammo = 12;
  G.player.reserve = 36;
  G.player.reloading = 0;
  G.cam.x = G.player.x;
  G.cam.y = G.player.y;
  G.cam.zoom = 1;
  G.wanted.heat = 0;
  G.wanted.stars = 0;
  G.bullets.length = 0;
  G.pickups.length = 0;
  G.particles.length = 0;
  G.skids.length = 0;
  G.cops.length = 0;
  G.mission.phase = 'idle';
  G.mission.index = -1;
  G.mission.marker = null;
  G.mission.objective = '';
  G.flashCash = 0;
  G.shake = 0;
  populate(G);
  if (fresh) G.cash = 0;
}

function save(G) {
  persist(G.save);
}

// --- Collisions ------------------------------------------------------------------------

// Cars vs cars: a circle around each car, push them apart and trade some damage. This is
// the pass where a cop rams the courier and where traffic jams form.
function carVsCar(G, dt) {
  const cars = G.cars;
  for (let i = 0; i < cars.length; i += 1) {
    const a = cars[i];
    if (a.wrecked) continue;
    for (let j = i + 1; j < cars.length; j += 1) {
      const b = cars[j];
      if (b.wrecked) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      const min = (a.wid + b.wid) * 0.55;
      if (d < min && d > 0.01) {
        const push = (min - d) / 2;
        const nx = dx / d;
        const ny = dy / d;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
        const rel = Math.hypot(a.vx - b.vx, a.vy - b.vy);
        if (rel > 70) {
          const dmg = rel * 0.05;
          damageCar(G, a, dmg);
          damageCar(G, b, dmg);
          G.effects.sparks(G, a.x + nx * a.wid, a.y + ny * a.wid, 6);
          G.audio.play('crash');
          G.shake = Math.max(G.shake, Math.min(0.4, rel / 900));
          // A cop ramming the player's car hurts the courier.
          if ((a.kind === 'cop' || b.kind === 'cop') && (a.driver === 'player' || b.driver === 'player')) {
            hurtPlayer(G, rel * 0.012);
            reportCrime(G, 'cop');
          }
          if (a.kind === 'cop' && b.driver === 'player') reportCrime(G, 'cop');
          if (b.kind === 'cop' && a.driver === 'player') reportCrime(G, 'cop');
        }
        a.vx *= 0.88;
        a.vy *= 0.88;
        b.vx *= 0.88;
        b.vy *= 0.88;
      }
    }
  }
}

// Cars vs pedestrians: a fast-moving car knocks them down; a slow one just scares them off.
function carVsPeds(G, dt) {
  const p = G.player;
  for (const car of G.cars) {
    if (car.wrecked) continue;
    const speed = Math.hypot(car.vx, car.vy);
    if (speed < 40) continue;
    for (const ped of G.peds) {
      if (!ped.alive || ped.dead > 0) continue;
      if (Math.hypot(ped.x - car.x, ped.y - car.y) < car.wid * 0.7 + 5) {
        runOver(G, ped, speed);
        if (speed > 130) {
          reportCrime(G, 'runOver');
          G.shake = Math.max(G.shake, 0.2);
          G.audio.play('hit');
        }
      }
    }
    // The courier on foot is a hazard too, but not a victim unless the car is fast.
    if (!p.inCar && p.alive && Math.hypot(p.x - car.x, p.y - car.y) < car.wid * 0.7 + 6) {
      if (speed > 160) {
        hurtPlayer(G, speed * 0.02);
        G.effects.blood(G, p.x, p.y);
      } else {
        // Push the courier aside.
        const a = Math.atan2(p.y - car.y, p.x - car.x);
        p.x += Math.cos(a) * 14;
        p.y += Math.sin(a) * 14;
      }
    }
  }
}

// --- One fixed step --------------------------------------------------------------------

function step(G, dt) {
  G.time += dt;
  if (G.phase !== 'play') return;

  // Driving or on foot.
  if (G.player.inCar) {
    drivePlayerCar(G, dt);
    if (G.input.pressed('interact')) tryExitCar(G);
  } else {
    updatePlayer(G, dt);
    if (G.input.pressed('interact')) {
      if (!tryEnterCar(G)) tryStartMission(G);
    }
  }

  // Traffic, crowd, police and missions.
  for (const car of G.cars) if (car.driver === 'traffic') stepTrafficCar(G, car, dt);
  keepTraffic(G);
  updatePeds(G, dt);
  updatePolice(G, dt);
  updateMission(G, dt);
  updateCombat(G, dt);

  carVsCar(G, dt);
  carVsPeds(G, dt);

  // Pickups sprinkled around: a medic bag at the hospital lot, ammo at the docks.
  if (Math.random() < dt * 0.05) {
    const c = G.world.cell;
    const which = Math.random() < 0.5 ? 'health' : (Math.random() < 0.6 ? 'ammo' : 'cash');
    const x = (Math.random() * (G.world.grid - 2) + 1) * c;
    const y = (Math.random() * (G.world.grid - 2) + 1) * c;
    G.combat && spawnPickupSafe(G, which, x, y);
  }

  // Death and bust end the run.
  if (!G.player.alive) gameOver(G, 'wasted');
  if (G.mission.phase === 'failed') G.phase = 'failed';
  if (G.mission.phase === 'complete') G.phase = 'complete';

  // Audio beds follow the action.
  const speedNorm = G.player.inCar ? Math.min(1, Math.abs(G.player.inCar.speed) / 500) : 0;
  G.audio.engineHum(G.player.inCar ? 0.4 + speedNorm * 0.6 : 0, speedNorm);
  const sirenLevel = G.wanted.stars >= 1 ? Math.min(1, G.wanted.stars / 5) : 0;
  G.audio.sirenHum(sirenLevel);

  G.input.clearEdges();
  G.input.takeMousePress();
}

function spawnPickupSafe(G, kind, x, y) {
  if (G.world.isWater(x, y) || G.world.collideCircle(x, y, 8).moved) return;
  G.pickups.push({ kind, x, y, seed: Math.random() * 7, life: 40 });
}

// --- Mission start at a marker ---------------------------------------------------------

function tryStartMission(G) {
  const m = G.mission;
  if (m.index >= 0 || m.phase === 'run') return;
  const n = nextMission(G);
  if (n < 0) return;
  // The next job's start marker sits at its start spot; step onto it to begin.
  const startSpot = startSpotFor(G, n);
  if (Math.hypot(startSpot.x - G.player.x, startSpot.y - G.player.y) < 60) {
    startMission(G, n);
    G.audio.play('mission');
  }
}

function startSpotFor(G, index) {
  const c = G.world.cell;
  const map = {
    0: { x: 4 * c, y: 4 * c },
    1: { x: 2 * c, y: 5 * c },
    2: { x: 2 * c, y: 2 * c },
    3: { x: 6 * c, y: 4 * c },
    4: { x: 2 * c, y: 1 * c },
    5: { x: 6 * c, y: 4 * c },
  };
  return map[index] || { x: 4 * c, y: 4 * c };
}

function gameOver(G, reason) {
  if (G.phase === 'over') return;
  G.phase = 'over';
  G.overReason = reason;
  G.audio.stopLoops();
  G.audio.play('fail');
}

// --- Frame and loop --------------------------------------------------------------------

function runGame(G) {
  const input = createInput(canvas);
  const renderer = createRenderer(canvas);
  const hud = createHud();
  const audio = createAudio();
  G.input = input;
  G.renderer = renderer;
  G.hud = hud;
  G.audio = audio;
  G.save = loadSave();
  G.muted = G.save.muted;
  audio.setMuted(G.muted);

  let last = performance.now();
  let accumulator = 0;

  function startNew() {
    resetState(G, true);
    G.save = emptySave();
    G.phase = 'play';
    audio.play('click');
  }
  function startContinue() {
    resetState(G, true);
    G.save = loadSave();
    G.cash = G.save.cash;
    G.phase = 'play';
    audio.play('click');
    // Restart the first mission not yet done, so Continue drops into the story.
    if (G.save.missions[0]) {
      // Continue straight into the next unplayed job at its marker.
    }
  }

  function handleInput() {
    if (G.phase === 'title') {
      if (input.pressed('advance')) startNew();
    } else if (G.phase === 'play') {
      if (input.pressed('pause')) {
        G.phase = 'paused';
        audio.play('click');
      }
      // Dialogue advancing.
      const m = G.mission;
      if (m.phase === 'intro' || m.phase === 'outro') {
        if (input.pressed('advance') || input.pressed('interact')) {
          advanceDialogue(G);
          if (G.mission.phase === 'complete') G.phase = 'complete';
        }
      }
    } else if (G.phase === 'paused') {
      if (input.pressed('pause')) {
        G.phase = 'play';
        audio.play('click');
      } else if (input.pressed('interact')) {
        save(G);
        audio.play('pickup');
      } else if (input.pressed('punch')) {
        G.phase = 'title';
      }
    } else if (G.phase === 'over') {
      if (input.pressed('advance')) {
        G.phase = 'title';
        audio.play('click');
      }
    } else if (G.phase === 'complete' || G.phase === 'failed') {
      if (input.pressed('advance')) {
        if (G.phase === 'failed') {
          // Retry the mission from its intro.
          retryMission(G);
          G.phase = 'play';
          audio.play('mission');
        } else {
          abandonMission(G);
          G.phase = 'play';
          audio.play('click');
        }
      }
    }
    // Mute works anywhere.
    if (input.pressed('mute')) {
      G.muted = !G.muted;
      audio.setMuted(G.muted);
      G.save.muted = G.muted;
      save(G);
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dtReal = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    accumulator += dtReal;
    // A paused or menu game still repaints; only the simulation waits.
    renderer.updateCamera(G, dtReal);
    while (accumulator >= STEP) {
      handleInput();
      step(G, STEP);
      accumulator -= STEP;
    }
    renderer.draw(G);
    drawHudFrame(G);
  }

  function drawHudFrame(G) {
    const hudCtx = G.context;
    // HUD only over a live run.
    if (G.phase === 'play' || G.phase === 'complete' || G.phase === 'failed') {
      hud.draw(G);
      hud.drawDialogue(G);
      drawInteractPrompt(G);
    }
    if (G.phase === 'title') drawTitle(G);
    else if (G.phase === 'paused') {
      hud.draw(G);
      drawPause(G);
    } else if (G.phase === 'over') drawGameOver(G, G.overReason);
    else if (G.phase === 'complete') drawMissionComplete(G);
    else if (G.phase === 'failed') drawFailed(G);
  }

  function drawInteractPrompt(G) {
    const car = G.vehicles.tryEnterCar ? nearestPromptCar(G) : null;
    if (G.player.inCar) {
      prompt(G, 'E - exit car');
    } else if (car) {
      prompt(G, 'E - take car');
    } else {
      // Near a mission start?
      const n = nextMission(G);
      if (n >= 0 && G.mission.index < 0) {
        const s = startSpotFor(G, n);
        if (Math.hypot(s.x - G.player.x, s.y - G.player.y) < 60) prompt(G, 'E - start ' + def(n).title);
      }
    }
  }

  function nearestPromptCar(G) {
    let best = null;
    let bestD = 60;
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

  function prompt(G, text) {
    G.context.textAlign = 'center';
    G.context.font = '700 16px system-ui, sans-serif';
    const w = G.context.measureText(text).width + 30;
    G.context.fillStyle = 'rgba(10,14,20,0.7)';
    G.context.fillRect(VIEW.width / 2 - w / 2, 158, w, 30);
    G.context.fillStyle = '#f3f5f8';
    G.context.fillText(text, VIEW.width / 2, 178);
  }

  // Leaving the tab pauses a running game.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && G.phase === 'play') {
      G.phase = 'paused';
    }
  });
  // First real gesture unlocks the audio context.
  window.addEventListener('pointerdown', () => audio.unlock(), { once: false });
  window.addEventListener('keydown', () => audio.unlock(), { once: false });

  requestAnimationFrame(frame);
}

function drawFailed(G) {
  G.context.fillStyle = 'rgba(10,10,14,0.66)';
  G.context.fillRect(0, 0, VIEW.width, VIEW.height);
  G.context.fillStyle = '#e2574b';
  G.context.textAlign = 'center';
  G.context.font = '800 40px system-ui, sans-serif';
  G.context.fillText('MISSION FAILED', VIEW.width / 2, VIEW.height / 2 - 40);
  G.context.fillStyle = '#f3f5f8';
  G.context.font = '400 18px system-ui, sans-serif';
  G.context.fillText(G.mission.failReason || 'The job went wrong.', VIEW.width / 2, VIEW.height / 2 + 4);
  G.context.fillStyle = '#a9b2bf';
  G.context.font = '400 16px system-ui, sans-serif';
  G.context.fillText('Press Enter to retry', VIEW.width / 2, VIEW.height / 2 + 48);
}

// --- Shot mode and boot ----------------------------------------------------------------

function runShot(name, seed) {
  const G = createGame();
  G.phase = 'play';
  const renderer = createRenderer(canvas);
  const hud = createHud();
  const audio = createAudio();
  G.renderer = renderer;
  G.hud = hud;
  G.audio = audio;
  G.save = emptySave();
  G.input = createInput(canvas);
  stageShot(G, name);
  let painted = 0;
  function paint() {
    renderer.updateCamera(G, 1 / 60);
    renderer.draw(G);
    if (name === 'start') {
      // The title screen is just the world under the title card, exactly like free play.
      drawTitle(G);
    } else {
      hud.draw(G);
      hud.drawDialogue(G);
    }
    painted += 1;
    if (painted < 3) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

const G = createGame();
if (shot) runShot(shot, seed);
else runGame(G);
