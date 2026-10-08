import { ET_MINUTE_EARTH_MS } from "./eorzea.js"
import { WEATHER_PERIOD, ZONES, periodStart, weatherAt } from "./weather.js"

const ET_DAY_EARTH_MS = 24 * 60 * ET_MINUTE_EARTH_MS
const HORIZON = 30 * 24 * 60 * 60 * 1000

/**
 * @typedef {object} Vista
 * @property {string} zone
 * @property {[number, number][]} [times] [start, duration] in ET minutes, missing when any time works
 * @property {string[]} [weather] Weather it needs, missing when any works
 */

/**
 * The parts of a weather period that fall inside the vista's time windows.
 * @param {[number, number][] | undefined} times
 * @param {number} from Period start
 * @param {number} to Period end
 * @returns {[number, number][]} [start, end] in Earth ms, sorted
 */
function timeSegments(times, from, to) {
  if (!times) return [[from, to]]

  // A period sits inside one ET day, but a window can run in from the day before (18:00 to 05:00)
  const day = Math.floor(from / ET_DAY_EARTH_MS) * ET_DAY_EARTH_MS
  const segments = []
  for (const d of [day - ET_DAY_EARTH_MS, day]) {
    for (const [start, duration] of times) {
      const s = Math.max(from, d + start * ET_MINUTE_EARTH_MS)
      const e = Math.min(to, d + (start + duration) * ET_MINUTE_EARTH_MS)
      if (s < e) segments.push([s, e])
    }
  }
  return segments.sort((a, b) => a[0] - b[0])
}

/**
 * The window a vista can be logged in now, or else its next one. Walks the weather periods ahead,
 * joining a window that carries on into the next period.
 * @param {Vista} vista
 * @param {number} now
 * @returns {import("./listing.js").Window} null when nothing comes up in the next 30 days
 */
export function nextVistaWindow(vista, now) {
  if (!vista.times && !vista.weather) return { always: true }

  const zone = vista.weather && ZONES.find((z) => z.name === vista.zone)
  let found = null

  for (let start = periodStart(now); start < now + HORIZON; start += WEATHER_PERIOD) {
    const weatherOk = !zone || vista.weather.includes(weatherAt(zone, start))
    const segments = weatherOk ? timeSegments(vista.times, start, start + WEATHER_PERIOD) : []

    for (const [s, e] of segments) {
      if (e <= now) continue
      if (!found) found = { start: s, end: e }
      else if (s <= found.end) found.end = Math.max(found.end, e)
      else return { ...found, open: found.start <= now }
    }

    if (found && found.end < start + WEATHER_PERIOD) return { ...found, open: found.start <= now }
  }

  return found ? { ...found, open: found.start <= now } : null
}

/**
 * nextVistaWindow with a cache per vista, since it walks the forecast. A window is only looked up again once it's over
 * (or a minute later when nothing came up). `open` is worked out fresh each call, as a cached window opens later on.
 * @returns {(vista: Vista, now: number) => import("./listing.js").Window}
 */
export function cachedVistaWindows() {
  const cache = new Map()

  return (vista, now) => {
    let cached = cache.get(vista)
    if (!cached || now >= cached.until) {
      const window = nextVistaWindow(vista, now)
      cached = { window, until: window?.always ? Infinity : window?.end ?? now + 60 * 1000 }
      cache.set(vista, cached)
    }

    const { window } = cached
    return window && !window.always ? { ...window, open: window.start <= now } : window
  }
}
