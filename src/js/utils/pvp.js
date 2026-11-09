import ROTATIONS from "../data/pvp.json" with { type: "json" }

// The PvP map rotations, as the duty finder opens them, from the game's data: see scripts/build/pvp.js

/** Frontline's daily challenge, a map a day from the daily reset (15:00 UTC), round in this order. */
export const FRONTLINE = ROTATIONS.frontline.maps

/** Crystalline Conflict's map, a new one every hour on the hour, round in this order. */
export const CRYSTALLINE_CONFLICT = ROTATIONS.crystallineConflict.maps

/**
 * @param {{ maps: string[], start: number, every: number }} rotation When maps[0] came up, and how long each lasts
 * @param {number} time
 * @returns {{ map: string, start: number, end: number }} The map on at `time`, and when it came up and goes
 */
function mapAt({ maps, start, every }, time) {
  const n = Math.floor((time - start) / every)
  const from = start + n * every
  return { map: maps[((n % maps.length) + maps.length) % maps.length], start: from, end: from + every }
}

/** @param {number} time */
export const frontlineAt = (time) => mapAt(ROTATIONS.frontline, time)

/** @param {number} time */
export const crystallineConflictAt = (time) => mapAt(ROTATIONS.crystallineConflict, time)
