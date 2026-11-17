export const VIEW = { width: 1280, height: 720 };
export const STEP = 1 / 60;
export const FONT = 'system-ui, -apple-system, Segoe UI, sans-serif';

export const WORLD = {
  size: 3000,
  grid: 8,
  cell: 375,
  roadHalf: 54,
  laneHalf: 27,
  land: { x0: 108, y0: 128, x1: 2872, y1: 2872 },
  beachY: 2736,
};

export const PLAYER = {
  radius: 11,
  walk: 134,
  sprint: 226,
  health: 100,
  punchRange: 32,
  punchDamage: 26,
  punchCooldown: 0.42,
  invuln: 0.9,
};

export const GUN = {
  mag: 12,
  reserve: 36,
  fireRate: 0.185,
  reload: 1.15,
  bulletSpeed: 960,
  bulletLife: 0.62,
  damage: 14,
  spread: 0.03,
};

export const CAR = {
  accel: 352,
  reverseAccel: 210,
  maxSpeed: 566,
  maxReverse: 192,
  brake: 640,
  drag: 0.72,
  grip: 7.4,
  handbrakeGrip: 2.1,
  turnRate: 2.1,
  health: 132,
  ramDamage: 22,
};

export const WANTED = {
  thresholds: [0, 0.6, 1.9, 3.5, 5.4, 7.6],
  crimes: {
    steal: 1.0,
    shoot: 2.0,
    runOver: 1.8,
    fire: 2.4,
    punch: 0.7,
    hitCar: 0.7,
    cop: 1.4,
  },
  coolDown: 3.4,
  decay: 0.4,
  hiddenDecay: 1.5,
  arrestTime: 1.35,
};

export const TRAFFIC = { count: 26, topSpeed: 258, stopGap: 74, spawnRange: 1150 };
export const Peds = { count: 34, walk: 62, panic: 206, range: 1150 };
export const POLICE = { maxCars: 5, maxCops: 6, speed: 452, bulletSpeed: 780, fireRate: 0.85, damage: 9 };
export const PICKUP = { health: 34, ammo: 12, cash: [20, 45, 90], life: 40 };
export const CAMERA = { zoomFoot: 1.0, zoomDrive: 0.8, speed: 5.2, lookAhead: 130 };
export const MINIMAP = { size: 178, radius: 89 };

export const DISTRICTS = {
  downtown:  { name: 'Downtown',  roofs: ['#7f95a8', '#93a9ba', '#6d8496', '#a4b6c6', '#8894a0'], density: 1.0, tree: 0.14 },
  oldtown:   { name: 'Old Town',  roofs: ['#b08260', '#c49a72', '#9c7357', '#caa583', '#a97c5c'], density: 0.72, tree: 0.22 },
  suburbs:   { name: 'Suburbs',   roofs: ['#c0a184', '#9db3c0', '#c2b39a', '#a3b6a6', '#d0b493'], density: 0.58, tree: 0.4 },
  harbor:    { name: 'Harbor',    roofs: ['#8d8a7c', '#a09a8b', '#7d7a6e', '#96907f', '#8a8f86'], density: 0.7, tree: 0.08 },
  beach:     { name: 'Solmar Beach', roofs: ['#c8b48c', '#b5c0a8', '#cfc0a0', '#a9bcae', '#d8c9a8'], density: 0.42, tree: 0.34 },
};

export const PALETTE = {
  backdrop: '#12161c',
  water: '#1d6c8c',
  waterDeep: '#12556f',
  waterLight: '#2f93b4',
  sand: '#dcc791',
  sandWet: '#c8b07a',
  grass: '#6f9153',
  grassDark: '#5b7d45',
  asphalt: '#3d4149',
  asphaltEdge: '#555b64',
  lane: '#d9d4ba',
  crosswalk: '#cfcaa9',
  sidewalk: '#96938c',
  shadow: 'rgba(44,28,14,0.34)',
  carShadow: 'rgba(44,28,14,0.3)',
  headlight: 'rgba(255,236,170,0.34)',
  panel: 'rgba(14,18,24,0.74)',
  panelEdge: 'rgba(255,255,255,0.16)',
  text: '#f3f5f8',
  muted: '#a9b2bf',
  accent: '#f0b23c',
  accentDark: '#c78a1e',
  health: '#7fd97a',
  healthLow: '#e2574b',
  star: '#ffd158',
  starDim: 'rgba(255,209,88,0.22)',
  police: '#1f3a6b',
  policeLight: '#e2574b',
  policeBlue: '#4f8fe2',
  bullet: '#ffe9a8',
};

export const SAVE_KEY = 'solmar-city.save.v1';

export const KEYS = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  interact: ['KeyE'],
  punch: ['KeyF', 'KeyJ'],
  reload: ['KeyR'],
  handbrake: ['Space'],
  pause: ['Escape', 'KeyP'],
  mute: ['KeyM'],
  advance: ['Enter', 'Space'],
};

export const SCENE = {
  title: 'title',
  play: 'play',
  paused: 'paused',
  over: 'over',
  mission: 'mission',
  fail: 'fail',
};
