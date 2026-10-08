import { ET_MINUTE_EARTH_MS } from "./eorzea.js"

// Unix time 0 is also an ET midnight
const ET_DAY_EARTH_MS = 24 * 60 * ET_MINUTE_EARTH_MS

/**
 * The window a node is up in now, or else its next one. Checks yesterday too, for a window running past midnight.
 * @param {{ times: [number, number][] }} node `times` are [start, duration] in ET minutes, the same every ET day
 * @param {number} now
 * @returns {import("./listing.js").Window}
 */
export function nextWindow(node, now) {
  const today = Math.floor(now / ET_DAY_EARTH_MS) * ET_DAY_EARTH_MS
  let best = null

  for (const day of [today - ET_DAY_EARTH_MS, today, today + ET_DAY_EARTH_MS]) {
    for (const [start, duration] of node.times) {
      const from = day + start * ET_MINUTE_EARTH_MS
      const to = from + duration * ET_MINUTE_EARTH_MS
      if (to > now && (!best || from < best.start)) best = { start: from, end: to }
    }
  }

  return { ...best, open: best.start <= now }
}
