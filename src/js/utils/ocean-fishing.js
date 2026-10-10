import DATA from "../data/ocean-fishing.json" with { type: "json" }

export const VOYAGE = 2 * 60 * 60 * 1000
// Voyages leave every 2 hours from Unix time 0, which was this far into the schedule
const OFFSET = 88

/**
 * @typedef {object} Voyage
 * @property {number} start When boarding opens, ms
 * @property {string} destination
 * @property {{ place: string, time: string }[]} stops In order, with the time of day at each: "Day", "Sunset", "Night"
 */

/**
 * @param {"indigo" | "ruby"} route Indigo leaves from Limsa Lominsa, Ruby from Kugane
 * @param {number} time Any time in the voyage's 2 hours
 * @returns {Voyage}
 */
export function voyageAt(route, time) {
  const n = Math.floor(time / VOYAGE)
  const id = DATA.schedule[(n + OFFSET) % DATA.schedule.length][route]
  return { start: n * VOYAGE, ...DATA.routes[id] }
}
