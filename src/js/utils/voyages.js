import DATA from "../data/ocean-fishing.json" with { type: "json" }

/** Voyages leave every 2 hours, on even hours UTC. */
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

/** Boarding is open for the first 15 minutes of a voyage's 2 hours. */
export const BOARDING = 15 * 60 * 1000

/** The schedule repeats after this long, 12 days. */
export const CYCLE = DATA.schedule.length * VOYAGE

/**
 * @typedef {object} OceanStop Where an ocean fish bites
 * @property {string} stop
 * @property {string} [time] The time of day it needs there, "Day", "Sunset", "Night"
 */

/**
 * @param {OceanStop} ocean
 * @param {number} time Any time in the voyage's 2 hours
 * @returns {boolean} Whether either route's voyage then gets to the stop, at its time of day when it needs one
 */
const reaches = (ocean, time) => ["indigo", "ruby"].some((route) =>
  voyageAt(route, time).stops.some((s) => s.place === ocean.stop && (!ocean.time || s.time === ocean.time)))

/**
 * The next voyage to the stop, as the window its boarding is open in. Every stop comes up within the 12-day schedule.
 * @param {OceanStop} ocean
 * @param {number} from
 * @returns {import("./listing.js").Window} The one boarding at `from`, or the next
 */
export function nextVoyageTo(ocean, from) {
  for (let start = Math.floor(from / VOYAGE) * VOYAGE; start <= from + CYCLE; start += VOYAGE) {
    if (start + BOARDING > from && reaches(ocean, start)) return { start, end: start + BOARDING, open: start <= from }
  }
  return null
}

/**
 * @param {{ ocean: OceanStop }} data An ocean fish's timer's data-window
 * @returns {import("./detail.js").WindowSource} The voyages to its stop, for the timer on its page
 */
export function voyageSource({ ocean }) {
  let next = null
  return {
    current: (now) => {
      if (!next || next.end <= now) next = nextVoyageTo(ocean, now)
      return next && { ...next, open: next.start <= now }
    },
    after: (from) => nextVoyageTo(ocean, from)
  }
}
