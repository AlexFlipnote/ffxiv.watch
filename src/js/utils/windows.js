import ZONES from "../data/weather.json"
import { ET_DAY_EARTH_MS, ET_MINUTE_EARTH_MS } from "./eorzea.js"

const HORIZON = 30 * 24 * 60 * 60 * 1000

/** One weather period (8 ET hours) in Earth ms. */
const WEATHER_PERIOD = 8 * 175 * 1000

/**
 * @param {number} ms
 * @returns {number} Start of the weather period containing `ms`
 */
const periodStart = (ms) => Math.floor(ms / WEATHER_PERIOD) * WEATHER_PERIOD

/**
 * The game's roll for a weather period, in unsigned 32-bit math like the game.
 * @param {number} ms Start of the period
 * @returns {number} 0-99
 */
function roll(ms) {
  const seconds = Math.floor(ms / 1000)
  const bell = Math.floor(seconds / 175)
  const increment = (bell - (bell % 8) + 8) % 24
  const days = Math.floor(seconds / 4200) >>> 0

  const base = (days * 100 + increment) >>> 0
  const step1 = ((base << 11) ^ base) >>> 0
  const step2 = ((step1 >>> 8) ^ step1) >>> 0
  return step2 % 100
}

/**
 * @param {{ weather: [string, number][] }} zone [name, chance] pairs, rolled in order
 * @param {number} ms
 * @returns {string} The weather at `ms`
 */
function weatherAt(zone, ms) {
  let chance = roll(periodStart(ms))
  for (const [name, rate] of zone.weather) {
    if (chance < rate) return name
    chance -= rate
  }
  // A few zones' rates add up to less than 100, the last weather covers the rest
  return zone.weather.at(-1)[0]
}

/**
 * A vista or a fish: when it can be logged or caught.
 * @typedef {object} Timed
 * @property {string} zone
 * @property {[number, number][]} [times] [start, duration] in ET minutes, missing when any time works
 * @property {string[]} [weather] Weather it needs, missing when any works
 * @property {string[]} [previousWeather] Weather the period before has to have had, missing when any works
 */

/**
 * The parts of a weather period that fall inside the time windows.
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
 * The window it's up in now, or else its next one. Walks the weather periods ahead, joining a window that carries on
 * into the next period.
 * @param {Timed} entry
 * @param {number} now
 * @returns {import("./listing.js").Window} null when nothing comes up in the next 30 days
 */
export function nextWeatherWindow(entry, now) {
  if (!entry.times && !entry.weather && !entry.previousWeather) return { always: true }

  const zone = (entry.weather || entry.previousWeather) && ZONES.find((z) => z.name === entry.zone)
  let found = null

  for (let start = periodStart(now); start < now + HORIZON; start += WEATHER_PERIOD) {
    const weatherOk = !zone
      || ((!entry.weather || entry.weather.includes(weatherAt(zone, start)))
        && (!entry.previousWeather || entry.previousWeather.includes(weatherAt(zone, start - WEATHER_PERIOD))))
    const segments = weatherOk ? timeSegments(entry.times, start, start + WEATHER_PERIOD) : []

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
 * nextWeatherWindow with a cache per entry, since it walks the forecast. A window is only looked up again once it's
 * over (or a minute later when nothing came up). `open` is worked out fresh each call, as a cached window opens later on.
 * @returns {(entry: Timed, now: number) => import("./listing.js").Window}
 */
export function cachedWeatherWindows() {
  const cache = new Map()

  return (entry, now) => {
    let cached = cache.get(entry)
    if (!cached || now >= cached.until) {
      const window = nextWeatherWindow(entry, now)
      cached = { window, until: window?.always ? Infinity : window?.end ?? now + 60 * 1000 }
      cache.set(entry, cached)
    }

    const { window } = cached
    return window && !window.always ? { ...window, open: window.start <= now } : window
  }
}

/**
 * @param {Timed} entry
 * @returns {import("./detail.js").WindowSource} Its windows for a timer on its own page
 */
export function weatherSource(entry) {
  const current = cachedWeatherWindows()
  return {
    current: (now) => current(entry, now),
    after: (from) => nextWeatherWindow(entry, from)
  }
}
