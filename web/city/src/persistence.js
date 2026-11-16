// Saving and loading the city in the browser's local storage.

import { SAVE_KEY, SAVE_VERSION } from './config.js';

const store = () => { try { return globalThis.localStorage || null; } catch { return null; } };

export function saveGame(game, storage = store()) {
  if (!storage) return false;
  try {
    storage.setItem(SAVE_KEY, JSON.stringify({ version: SAVE_VERSION, savedAt: Date.now(), ...game.serialize() }));
    return true;
  } catch { return false; } // storage full or blocked
}

// Returns saved data, or null when there is none or it cannot be read.
export function loadSave(storage = store()) {
  if (!storage) return null;
  try {
    const data = JSON.parse(storage.getItem(SAVE_KEY));
    if (!data || data.version !== SAVE_VERSION || !Array.isArray(data.buildings)) return null;
    return data;
  } catch { return null; }
}

export function clearSave(storage = store()) {
  try { storage?.removeItem(SAVE_KEY); } catch { /* nothing to clear */ }
}
