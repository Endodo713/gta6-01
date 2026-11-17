// The six missions and the story: Mara Kade's jobs for Dario Venn and the Gull Crew, each
// with an intro and outro dialogue, a sequence of objectives with a marker and a HUD line,
// a cash reward and a save. Missions unlock in order and are retried on failure.

// Landmarks sit on road crossings or open plazas so a marker is never inside a building.
function spots(G) {
  const c = G.world.cell;
  return {
    plaza: { x: 4 * c, y: 4 * c },                         // downtown crossing
    oldSquare: { x: 2 * c, y: 2 * c },                     // old town crossing
    harborPier: { x: 2 * c, y: 1 * c },                    // north harbour
    boardwalk: { x: 4 * c, y: 7 * c },                     // south road above the sand
    hideout: { x: 6 * c, y: 1 * c },                       // east harbour safehouse
    suburbs: { x: 2 * c, y: 5 * c },                       // south-west suburbs
    garage: { x: 5 * c, y: 3 * c },                        // downtown lockup
    docks: { x: 6 * c, y: 4 * c },                         // east container docks
    beach: { x: 5 * c, y: G.world.beachY - 40 },           // on the sand
  };
}

export const MISSIONS = [
  {
    id: 'first-run',
    title: 'First Run',
    reward: 250,
    start: 'plaza',
    intro: [
      'Dario Venn: \"Mara. I need a package gone before sundown.\"',
      'Mara: \"Three drops across the city? That is a lot of miles.\"',
      'Dario: \"That is why you get the good rates. Move.\"',
    ],
    outro: [
      'Mara: \"Delivered. All three.\"',
      'Dario: \"Clean. You are quick, courier. I have more work.\"',
    ],
  },
  {
    id: 'ride-or-die',
    title: 'Ride or Die',
    reward: 320,
    start: 'suburbs',
    intro: [
      'Dario: \"The Gull Crew is putting together a team. Pick up Rook.\"',
      'Rook: \"You the courier? Good. Get us to the hideout without the cops.\"',
    ],
    outro: [
      'Rook: \"Nice driving. Dario was right about you.\"',
      'Mara: \"I did not sign up for a crew. I do one job at a time.\"',
    ],
  },
  {
    id: 'getaway-wheels',
    title: 'Getaway Wheels',
    reward: 380,
    start: 'oldSquare',
    intro: [
      'Dario: \"The Vault job needs a clean car. A fast one. Take it.\"',
      'Mara: \"You want me to just... take a car off the street?\"',
      'Dario: \"I want it in the garage before the plates get flagged.\"',
    ],
    outro: [
      'Mara: \"Car is in the lockup.\"',
      'Dario: \"You are already more useful than my last driver.\"',
    ],
  },
  {
    id: 'clean-slate',
    title: 'Clean Slate',
    reward: 420,
    start: 'docks',
    intro: [
      'Dario: \"You are too hot. Three stars will get the whole city on you.\"',
      'Mara: \"And you want me to... pull attention?\"',
      'Dario: \"Draw them, then lose them. Prove you can vanish.\"',
    ],
    outro: [
      'Rook: \"Cops went right past. Where did you learn to disappear?\"',
      'Mara: \"Couriers know every back alley in this city.\"',
    ],
  },
  {
    id: 'harbor-vault-setup',
    title: 'Harbor Vault Setup',
    reward: 600,
    start: 'harborPier',
    intro: [
      'Rook: \"The Vault money moves in an armoured van tonight. We grab it.\"',
      'Mara: \"That is not a pickup. That is a heist.\"',
      'Rook: \"That is why we pay you like it is one.\"',
    ],
    outro: [
      'Rook: \"Van is in the dock. Tomorrow we crack it.\"',
      'Mara: \"And then I am done with the Gull Crew.\"',
    ],
  },
  {
    id: 'harbor-vault',
    title: 'Harbor Vault',
    reward: 1000,
    start: 'docks',
    intro: [
      'Rook: \"The Vault is open. Take the take and run for the beach.\"',
      'Mara: \"Every cop in Solmar will be on us.\"',
      'Rook: \"Then drive like it.\"',
    ],
    outro: [
      'Mara: \"On the water. The crew made it.\"',
      'Rook: \"You did it, courier. Welcome to the Gull Crew. For real this time.\"',
    ],
  },
];

export function def(index) {
  return MISSIONS[index] || null;
}

// --- Mission runtime -------------------------------------------------------------------
function legs(G, index) {
  const s = spots(G);
  const all = {
    0: [
      { type: 'go', point: s.harborPier, label: 'Drop 1 of 3 - north pier', timer: 95 },
      { type: 'go', point: s.oldSquare, label: 'Drop 2 of 3 - old town' },
      { type: 'go', point: s.boardwalk, label: 'Drop 3 of 3 - beach boardwalk' },
    ],
    1: [
      { type: 'go', point: s.suburbs, label: 'Pick up Rook in the suburbs' },
      { type: 'go', point: s.hideout, label: 'Drive Rook to the hideout' },
    ],
    2: [
      { type: 'take', point: s.oldSquare, label: 'Take the marked sports car', takeKind: 'sport' },
      { type: 'go', point: s.garage, label: 'Deliver it to the downtown lockup' },
    ],
    3: [
      { type: 'heat', label: 'Draw the heat - get to three stars' },
      { type: 'go', point: s.hideout, label: 'Lose the cops at the hideout' },
    ],
    4: [
      { type: 'take', point: s.docks, label: 'Grab the loot van at the docks', van: true },
      { type: 'go', point: s.hideout, label: 'Drive the van to the dock hideout' },
    ],
    5: [
      { type: 'survive', seconds: 55, label: 'Survive the chase - every cop in the city' },
      { type: 'go', point: s.beach, label: 'Escape to the beach boat' },
    ],
  };
  return all[index] || [];
}

/** The world position of the current objective marker, or null. */
export function currentMarker(G) {
  const m = G.mission;
  if (!m || m.index < 0 || m.phase !== 'run') return null;
  const leg = m.legs[m.stage];
  return leg ? leg.point || null : null;
}

/** The next mission the courier can take, or -1 when all are done. */
export function nextMission(G) {
  for (let i = 0; i < MISSIONS.length; i += 1) {
    if (!G.save.missions[i]) return i;
  }
  return -1;
}

export function startMission(G, index) {
  const m = G.mission;
  m.index = index;
  m.stage = 0;
  m.phase = 'intro';
  m.line = 0;
  m.legs = legs(G, index);
  m.timer = 0;
  m.data = {};
  m.cashEarned = 0;
  m.marker = null;
  m.objective = '';
  // Mission 2 and 5 hand the player a car at the start point.
  if (index === 2) {
    const s = spots(G);
    G.mission.data.car = G.vehicles.makeCar('sport', s.oldSquare.x + 30, s.oldSquare.y, 0, null);
    G.cars.push(G.mission.data.car);
  } else if (index === 4) {
    const s = spots(G);
    G.mission.data.car = G.vehicles.makeCar('van', s.docks.x - 30, s.docks.y, Math.PI / 2, null);
    G.cars.push(G.mission.data.car);
  }
}

/** Advance the current dialogue; returns true when the screen should move on. */
export function advanceDialogue(G) {
  const m = G.mission;
  if (!m || (m.phase !== 'intro' && m.phase !== 'outro')) return true;
  const lines = m.phase === 'intro' ? MISSIONS[m.index].intro : MISSIONS[m.index].outro;
  m.line += 1;
  if (m.line >= lines.length) {
    m.line = 0;
    if (m.phase === 'intro') {
      m.phase = 'run';
      onLegStart(G);
    } else {
      finishMission(G);
    }
    return true;
  }
  return false;
}

function onLegStart(G) {
  const m = G.mission;
  const leg = m.legs[m.stage];
  m.marker = leg.point || null;
  m.objective = leg.label;
  if (leg.timer) m.timer = leg.timer;
  if (leg.type === 'heat') m.marker = null;
  if (leg.type === 'survive') {
    m.timer = leg.seconds;
    G.wanted.heat = Math.max(G.wanted.heat, 6.2);
  }
}

function finishMission(G) {
  const m = G.mission;
  const d = MISSIONS[m.index];
  G.save.missions[m.index] = true;
  G.cash += d.reward;
  G.save.cash = G.cash;
  G.save.best = Math.max(G.save.best, G.cash);
  G.storeSave();
  m.phase = 'complete';
  m.marker = null;
  m.objective = '';
  G.audio.play('jingle');
}

export function failMission(G, reason) {
  const m = G.mission;
  m.phase = 'failed';
  m.failReason = reason || 'The mission went wrong.';
  m.marker = null;
  G.audio.play('fail');
}

/** Re-run the current mission from its intro, restoring the courier. */
export function retryMission(G) {
  const index = G.mission.index;
  startMission(G, index);
}

/** Abandon the mission and return to free play; the courier can retry it later. */
export function abandonMission(G) {
  const m = G.mission;
  m.phase = 'idle';
  m.marker = null;
  m.objective = '';
  m.index = -1;
  G.wanted.heat = Math.max(0, G.wanted.heat - 1.5);
}

export function updateMission(G, dt) {
  const m = G.mission;
  if (!m || m.phase !== 'run') return;
  if (m.timer > 0) {
    m.timer -= dt;
    if (m.timer <= 0) {
      failMission(G, 'Out of time.');
      return;
    }
  }
  const leg = m.legs[m.stage];
  if (!leg) return;
  const near = distTo(G, leg.point) < 46;

  if (leg.type === 'go') {
    if (near) reachLeg(G);
  } else if (leg.type === 'take') {
    const car = G.player.inCar;
    if (!car) return;
    if (leg.van) {
      if (near && car.kind === 'van') reachLeg(G);
    } else if (leg.takeKind) {
      if (near && car.kind === leg.takeKind) reachLeg(G);
    } else if (near) {
      reachLeg(G);
    }
  } else if (leg.type === 'heat') {
    if (G.wanted.stars >= 3) reachLeg(G);
  } else if (leg.type === 'survive') {
    if (m.timer <= 0) reachLeg(G);
  }
}

function reachLeg(G) {
  const m = G.mission;
  m.stage += 1;
  m.timer = 0;
  if (m.stage >= m.legs.length) {
    m.phase = 'outro';
    m.line = 0;
    m.objective = '';
    m.marker = null;
  } else {
    onLegStart(G);
  }
}

function distTo(G, point) {
  if (!point) return 99999;
  return Math.hypot(point.x - G.player.x, point.y - G.player.y);
}

export function createMissionState() {
  return {
    index: -1,
    phase: 'idle',
    stage: 0,
    legs: [],
    marker: null,
    objective: '',
    timer: 0,
    line: 0,
    data: {},
    cashEarned: 0,
    failReason: '',
  };
}
