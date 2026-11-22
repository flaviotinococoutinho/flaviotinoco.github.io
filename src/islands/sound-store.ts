/**
 * The reader's own mix of the room's sound in storage (MIX_STORAGE_KEY, canonical JSON from the codec of
 * src/core/chrome/sound.ts) — shared by the mixer of <ft-preferences>, which writes it, and <ft-room-sound>,
 * which plays it. Whether it plays is the preference `sound` (custom), kept with the other preferences.
 */
import { MIX_STORAGE_KEY, decodeMix, encodeMix, type Mix } from '../core/chrome/sound.ts';

export const readMix = (): Mix | null => {
  try {
    return decodeMix(window.localStorage.getItem(MIX_STORAGE_KEY));
  } catch {
    return null; // storage blocked: the custom choice plays the quiet room
  }
};

/** Stores the mix, or forgets it (null). */
export const writeMix = (mix: Mix | null): void => {
  try {
    if (mix === null) window.localStorage.removeItem(MIX_STORAGE_KEY);
    else window.localStorage.setItem(MIX_STORAGE_KEY, encodeMix(mix));
  } catch {
    // Not persisted: the fader still moves the sound of this page.
  }
};
