// localStorage save: which missions are done, how much cash the courier has, and the
// best cash ever made. Nothing here throws: storage is refused in private windows and
// in a sandboxed frame, and the game just keeps playing without a save then.

import { SAVE_KEY } from './config.js';

export function emptySave() {
  return { missions: [false, false, false, false, false, false], cash: 0, best: 0, muted: false };
}

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return emptySave();
    const parsed = JSON.parse(raw);
    const base = emptySave();
    if (!parsed || typeof parsed !== 'object') return base;
    if (Array.isArray(parsed.missions)) {
      for (let i = 0; i < base.missions.length; i += 1) {
        base.missions[i] = parsed.missions[i] === true;
      }
    }
    base.cash = Number(parsed.cash) || 0;
    base.best = Number(parsed.best) || 0;
    base.muted = parsed.muted === true;
    return base;
  } catch {
    return emptySave();
  }
}

export function storeSave(data) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Nothing to do: the save was already unavailable.
  }
}

export function hasProgress(save) {
  if (!save) return false;
  if (save.cash > 0) return true;
  for (let i = 0; i < save.missions.length; i += 1) if (save.missions[i]) return true;
  return false;
}
