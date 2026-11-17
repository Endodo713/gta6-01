// Solmar City: procedural city generation and world queries. One clear job per function.
// The city is a square grid of blocks between roads; the outermost road ring sits inside a
// waterfront strip that is harbour to the north and east, beach to the south, with the sea
// beyond the land. Everything here is pure data: no drawing and no browser globals.

import { DISTRICTS, WORLD } from './config.js';
import { pick, randInt, randRange, jitter } from './random.js';

export function createWorld(random) {
  const size = WORLD.size;
  const cell = WORLD.cell;
  const grid = WORLD.grid;
  const roadHalf = WORLD.roadHalf;
  const laneHalf = WORLD.laneHalf;
  const land = WORLD.land;

  // Road centre-lines are at k*cell for k in 1..grid-1: the ring is well inside the land.
  const centres = [];
  for (let k = 1; k < grid; k += 1) centres.push(k * cell);

  // Which district a block belongs to, by its cell column and row.
  function districtAtCell(i, j) {
    if (j <= 1 || i >= 6) return 'harbor';
    if (j >= 6) return 'beach';
    if (i <= 2 && j <= 2) return 'oldtown';
    if (i >= 3 && i <= 5 && j >= 3 && j <= 5) return 'downtown';
    return 'suburbs';
  }

  function districtAt(x, y) {
    const i = Math.floor(x / cell);
    const j = Math.floor(y / cell);
    return districtAtCell(Math.min(grid - 1, Math.max(0, i)), Math.min(grid - 1, Math.max(0, j)));
  }

  // --- Buildings and trees -------------------------------------------------------------
  const buildings = [];
  const trees = [];

  const TREE_COLORS = ['#5c7d42', '#6a8c4b', '#4f6f3c', '#73934f'];

  function addBuilding(x, y, w, h, height, color, type) {
    buildings.push({ x, y, w, h, height, color, type, cx: x + w / 2, cy: y + h / 2 });
  }

  function addTree(x, y, r) {
    trees.push({ x, y, r, color: pick(random, TREE_COLORS) });
  }

  // Fill one block with lots, placing a building on some and a tree on others.
  function buildBlock(i, j) {
    const district = districtAtCell(i, j);
    const conf = DISTRICTS[district];
    const x0 = i * cell + roadHalf + 7;
    const y0 = j * cell + roadHalf + 7;
    const x1 = (i + 1) * cell - roadHalf - 7;
    const y1 = (j + 1) * cell - roadHalf - 7;
    const bx = x1 - x0;
    const by = y1 - y0;

    // Downtown is dense towers; harbour holds long warehouses; the rest are modest lots.
    let lots;
    if (district === 'downtown') lots = 3;
    else if (district === 'harbor') lots = 2;
    else lots = 2;

    const gap = 9;
    const lw = (bx - gap * (lots + 1)) / lots;
    const lh = (by - gap * (lots + 1)) / lots;

    for (let a = 0; a < lots; a += 1) {
      for (let b = 0; b < lots; b += 1) {
        const lx = x0 + gap + a * (lw + gap);
        const ly = y0 + gap + b * (lh + gap);
        if (random() > conf.density) {
          if (random() < conf.tree) addTree(lx + lw / 2 + jitter(random, 8), ly + lh / 2 + jitter(random, 8), randRange(random, 10, 17));
          continue;
        }
        const margin = randRange(random, 3, 8);
        const bw = lw - margin * 2;
        const bh = lh - margin * 2;
        if (bw < 14 || bh < 14) continue;
        const bx2 = lx + margin;
        const by2 = ly + margin;
        let height;
        let type = 'building';
        if (district === 'downtown') {
          height = randRange(random, 38, 92);
          type = random() < 0.35 ? 'tower' : 'building';
        } else if (district === 'harbor') {
          height = randRange(random, 20, 36);
          type = 'warehouse';
        } else if (district === 'oldtown') {
          height = randRange(random, 16, 30);
          type = 'old';
        } else if (district === 'beach') {
          height = randRange(random, 12, 22);
          type = 'hut';
        } else {
          height = randRange(random, 13, 24);
          type = 'house';
        }
        addBuilding(bx2, by2, bw, bh, height, pick(random, conf.roofs), type);
        if (random() < conf.tree) addTree(lx + lw / 2 + jitter(random, 10), ly + lh / 2 + jitter(random, 10), randRange(random, 9, 16));
      }
    }
  }

  for (let i = 1; i < grid - 1; i += 1) {
    for (let j = 1; j < grid - 1; j += 1) buildBlock(i, j);
  }

  // --- Waterfront props ----------------------------------------------------------------
  const props = [];
  // Harbour to the north and east: piers, cranes, containers and mooring posts.
  for (let k = 1; k < grid; k += 1) {
    if (random() < 0.6) {
      props.push({ x: k * cell - 22, y: land.y0 + 8, w: 44, h: 40, type: 'crane' });
    }
  }
  for (let k = 1; k < grid; k += 1) {
    for (let n = 0; n < 2; n += 1) {
      if (random() < 0.45) {
        props.push({ x: land.x1 - 30 + jitter(random, 8), y: (k - 1) * cell + 40 + n * 150 + jitter(random, 30), w: 44, h: 26, type: 'container' });
      }
    }
  }
  // Boardwalk and palm trees along the beach.
  for (let k = 0; k < grid; k += 1) {
    for (let n = 0; n < 2; n += 1) {
      if (random() < 0.7) {
        addTree((k + 0.5) * cell + jitter(random, 90), WORLD.beachY - 6 + n * 46, randRange(random, 9, 14));
      }
    }
  }

  // --- Collision -----------------------------------------------------------------------
  // A coarse uniform grid over the blocks: a moving circle only checks the few cells it
  // touches, so the whole city is cheap to collide against every frame.
  const GRID = 160;
  const cellsX = Math.ceil(size / GRID);
  const bucket = new Array(cellsX * cellsX);
  function bucketIndex(x, y) {
    const cx = Math.min(cellsX - 1, Math.max(0, Math.floor(x / GRID)));
    const cy = Math.min(cellsX - 1, Math.max(0, Math.floor(y / GRID)));
    return cy * cellsX + cx;
  }
  for (let index = 0; index < bucket.length; index += 1) bucket[index] = [];
  for (let index = 0; index < buildings.length; index += 1) {
    const b = buildings[index];
    const cx0 = Math.max(0, Math.floor((b.x - 1) / GRID));
    const cy0 = Math.max(0, Math.floor((b.y - 1) / GRID));
    const cx1 = Math.min(cellsX - 1, Math.floor((b.x + b.w + 1) / GRID));
    const cy1 = Math.min(cellsX - 1, Math.floor((b.y + b.h + 1) / GRID));
    for (let cy = cy0; cy <= cy1; cy += 1) {
      for (let cx = cx0; cx <= cx1; cx += 1) bucket[cy * cellsX + cx].push(index);
    }
  }

  /** Push a circle at (x, y) out of every building it overlaps; returns corrected x, y. */
  function collideCircle(x, y, radius) {
    const cx = Math.min(cellsX - 1, Math.max(0, Math.floor(x / GRID)));
    const cy = Math.min(cellsX - 1, Math.max(0, Math.floor(y / GRID)));
    let moved = false;
    for (let gy = cy - 1; gy <= cy + 1; gy += 1) {
      for (let gx = cx - 1; gx <= cx + 1; gx += 1) {
        if (gx < 0 || gy < 0 || gx >= cellsX || gy >= cellsX) continue;
        const list = bucket[gy * cellsX + gx];
        for (let n = 0; n < list.length; n += 1) {
          const b = buildings[list[n]];
          const nx = Math.max(b.x, Math.min(x, b.x + b.w));
          const ny = Math.max(b.y, Math.min(y, b.y + b.h));
          const dx = x - nx;
          const dy = y - ny;
          const d2 = dx * dx + dy * dy;
          if (d2 < radius * radius) {
            const d = Math.sqrt(d2) || 0.001;
            const push = (radius - d) / d;
            x += dx * push;
            y += dy * push;
            moved = true;
          }
        }
      }
    }
    return { x, y, moved };
  }

  // --- Queries -------------------------------------------------------------------------
  function roadIndex(coord) {
    // Nearest road centre-line index (1..grid-1) to a world coordinate, or -1 off the grid.
    const nearest = Math.round(coord / cell);
    if (nearest < 1 || nearest > grid - 1) return -1;
    return nearest;
  }

  /** True when the point is on the asphalt of a road (within its half width of a centre-line). */
  function isRoad(x, y) {
    if (isWater(x, y)) return false;
    const kx = roadIndex(x);
    if (kx >= 0 && Math.abs(x - kx * cell) <= roadHalf) return true;
    const ky = roadIndex(y);
    if (ky >= 0 && Math.abs(y - ky * cell) <= roadHalf) return true;
    return false;
  }

  /** True when the point is out on the sea or the bay, off the land rectangle. */
  function isWater(x, y) {
    return x < land.x0 || x > land.x1 || y < land.y0 || y > land.y1;
  }

  /** True on the sand strip between the last row of blocks and the sea. */
  function isBeach(x, y) {
    return !isWater(x, y) && y >= WORLD.beachY;
  }

  /** A lane centre on a road, offset to the right-hand side of travel. dir is [dx, dy]. */
  function lanePoint(ix, iy, dir) {
    const x = ix * cell;
    const y = iy * cell;
    if (dir[0] !== 0) return { x: x + dir[0] * laneHalf * 0.5, y: y + (dir[0] > 0 ? laneHalf : -laneHalf) * 0.5 };
    return { x: x + (dir[1] > 0 ? -laneHalf : laneHalf) * 0.5, y: y + dir[1] * laneHalf * 0.5 };
  }

  // Traffic lights: a global cycle split between the two axes, desynchronised per
  // intersection so the city never changes all at once. Returns true for green.
  function trafficLight(ix, iy, axis, time) {
    const period = 15;
    const offset = ((ix + iy) * 1.9) % period;
    const t = (((time + offset) % period) + period) % period;
    if (axis === 'ns') return t < 6 || t >= 13;
    return t >= 7.5 && t < 12.5;
  }

  /** The centre of a city block (not a road), for spawns, markers and pickups. */
  function blockCenter(i, j) {
    return { x: (i + 0.5) * cell, y: (j + 0.5) * cell };
  }

  // A few guaranteed open spots: a plaza in downtown, a pier by the harbour, the
  // boardwalk on the beach and the old town square.
  const plaza = blockCenter(4, 4);
  const pier = { x: land.x0 + 90, y: 2 * cell };
  const boardwalk = { x: 4 * cell, y: WORLD.beachY - 40 };
  const square = blockCenter(2, 2);

  return {
    size,
    cell,
    grid,
    roadHalf,
    laneHalf,
    land,
    beachY: WORLD.beachY,
    centres,
    buildings,
    trees,
    props,
    plaza,
    pier,
    boardwalk,
    square,
    isRoad,
    isWater,
    isBeach,
    districtAt,
    districtAtCell,
    roadIndex,
    lanePoint,
    trafficLight,
    blockCenter,
    collideCircle,
  };
}
