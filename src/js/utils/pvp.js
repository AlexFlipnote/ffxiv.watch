// The PvP map rotations. Neither is in the game's data, the orders and when they line up are from PvP Calendar
// (https://pvpc.nbb.fan/)

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

/** Frontline's daily challenge, a map a day from the daily reset (15:00 UTC), round in this order. */
export const FRONTLINE = [
  "Seal Rock (Seize)",
  "Fields of Glory (Shatter)",
  "Onsal Hakair (Danshig Naadam)",
  "Worqor Chirteh (Triumph)",
  "Seal Rock (Seize)",
  "Borderland Ruins (Secure)",
  "Onsal Hakair (Danshig Naadam)",
  "Worqor Chirteh (Triumph)"
]
// A daily reset that had FRONTLINE[0]: 30 Sep 2026, 15:00 UTC
const FRONTLINE_START = Date.UTC(2026, 8, 30, 15)

/** Crystalline Conflict's map, a new one every hour on the hour, round in this order. */
export const CRYSTALLINE_CONFLICT = [
  "The Palaistra",
  "The Volcanic Heart",
  "The Bayside Battleground",
  "Cloud Nine",
  "The Clockwork Castletown",
  "Archeia Harmonias",
  "The Red Sands"
]
// An hour that had CRYSTALLINE_CONFLICT[0]: 11 Oct 2026, 19:00 UTC
const CRYSTALLINE_CONFLICT_START = Date.UTC(2026, 9, 11, 19)

/**
 * @param {string[]} maps
 * @param {number} start When maps[0] came up
 * @param {number} every How long each lasts
 * @param {number} time
 * @returns {{ map: string, start: number, end: number }} The map on at `time`, and when it came up and goes
 */
function rotation(maps, start, every, time) {
  const n = Math.floor((time - start) / every)
  const from = start + n * every
  return { map: maps[((n % maps.length) + maps.length) % maps.length], start: from, end: from + every }
}

/** @param {number} time */
export const frontlineAt = (time) => rotation(FRONTLINE, FRONTLINE_START, DAY, time)

/** @param {number} time */
export const crystallineConflictAt = (time) => rotation(CRYSTALLINE_CONFLICT, CRYSTALLINE_CONFLICT_START, HOUR, time)
