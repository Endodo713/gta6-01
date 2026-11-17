// Keyboard and pointer. Held keys give a steering axis; one-shot presses (interact, punch,
// reload, pause, mute) are queued as edge flags and consumed once per frame, so a press
// between two updates is neither lost nor counted twice.

import { KEYS, VIEW } from './config.js';

// Keys that must never let the page scroll or the browser take over.
const GAME_CODES = new Set(Object.values(KEYS).flat());

export function createInput(canvas) {
  const held = new Set();
  const edges = new Set();
  const mouse = { x: VIEW.width * 0.7, y: VIEW.height * 0.4, down: false, pressed: false };

  window.addEventListener('keydown', (event) => {
    if (!GAME_CODES.has(event.code)) return;
    if (!held.has(event.code)) edges.add(event.code);
    held.add(event.code);
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    held.clear();
    mouse.down = false;
  });

  function readMouse(event) {
    const rect = canvas.getBoundingClientRect();
    const width = rect.width || 1;
    const height = rect.height || 1;
    mouse.x = ((event.clientX - rect.left) / width) * VIEW.width;
    mouse.y = ((event.clientY - rect.top) / height) * VIEW.height;
  }

  window.addEventListener('pointermove', (event) => readMouse(event));
  window.addEventListener('pointerdown', (event) => {
    readMouse(event);
    mouse.down = true;
    mouse.pressed = true;
  });
  window.addEventListener('pointerup', () => {
    mouse.down = false;
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  function anyDown(list) {
    for (let i = 0; i < list.length; i += 1) if (held.has(list[i])) return true;
    return false;
  }

  return {
    mouse,
    held: anyDown,
    /** True once, on the frame after a bound key goes down. */
    pressed: function (name) {
      const list = KEYS[name];
      for (let i = 0; i < list.length; i += 1) {
        if (edges.has(list[i])) return true;
      }
      return false;
    },
    takeMousePress: function () {
      const wasPressed = mouse.pressed;
      mouse.pressed = false;
      return wasPressed;
    },
    clearEdges: function () {
      edges.clear();
    },
  };
}
