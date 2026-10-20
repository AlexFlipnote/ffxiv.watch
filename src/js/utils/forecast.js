import { ET_DAY_EARTH_MS, ET_MINUTE_EARTH_MS } from "./eorzea.js"

// When a fish or vista is up, from the weather odds it's given, see windows.js, and when its alarm rings

const HORIZON = 30 * 24 * 60 * 60 * 1000

/** One weather period (8 ET hours) in Earth ms. */
export const WEATHER_PERIOD = 8 * 175 * 1000

/**
 * @param {number} ms
 * @returns {number} Start of the weather period containing `ms`
 */
export const periodStart = (ms) => Math.floor(ms / WEATHER_PERIOD) * WEATHER_PERIOD

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
 * @typedef {{ weather: [string, number][] }} Zone [name, chance] pairs, rolled in order
 */

/**
 * @param {Zone} zone
 * @param {number} ms
 * @returns {string} The weather at `ms`
 */
export function weatherAt(zone, ms) {
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
 * @param {Timed} entry
 * @param {Zone} [zone] Its zone's weather, needed when it waits for some
 * @returns {(start: number) => [number, number][]} The parts of the weather period starting at `start` it's up in
 */
function periodSegments(entry, zone) {
  const needsWeather = entry.weather || entry.previousWeather

  return (start) => {
    const weatherOk = !needsWeather
      || ((!entry.weather || entry.weather.includes(weatherAt(zone, start)))
        && (!entry.previousWeather || entry.previousWeather.includes(weatherAt(zone, start - WEATHER_PERIOD))))
    return weatherOk ? timeSegments(entry.times, start, start + WEATHER_PERIOD) : []
  }
}

/**
 * Every window that starts between two times, for the build to work out how often it's up.
 * @param {Timed} entry Up only at some times or in some weather
 * @param {number} from
 * @param {number} to
 * @param {Zone} [zone] See periodSegments
 * @returns {{ start: number, end: number }[]} Joined where one carries on into the next period, the last can run past `to`
 */
export function windowsBetween(entry, from, to, zone) {
  const segmentsIn = periodSegments(entry, zone)
  const windows = []
  for (let start = periodStart(from); ; start += WEATHER_PERIOD) {
    const segments = segmentsIn(start)
    // Past the end, only to finish the window that's still open, for up to 30 days
    if (start >= to && (windows.at(-1)?.end !== start || start >= to + HORIZON)) return windows.filter((w) => w.start >= from)
    for (const [s, e] of segments) {
      if (windows.at(-1)?.end === s) windows.at(-1).end = e
      else if (s < to) windows.push({ start: s, end: e })
    }
  }
}

/**
 * The window it's up in now, or else its next one. Walks the weather periods ahead, joining a window that carries on
 * into the next period.
 * @param {Timed} entry
 * @param {number} now
 * @param {Zone} [zone] See periodSegments
 * @returns {import("./listing.js").Window} null when nothing comes up in the next 30 days
 */
export function nextWeatherWindow(entry, now, zone) {
  if (!entry.times && !entry.weather && !entry.previousWeather) return { always: true }

  const segmentsIn = periodSegments(entry, zone)

  /**
   * The walk starts at this period, so a window that's open may have opened in the ones before, walked back for its
   * start: 22:00 for one up 22:00 to 01:00, not the 00:00 this period starts at.
   * @param {{ start: number, end: number }} found
   * @returns {import("./listing.js").Window}
   */
  const finish = (found) => {
    if (found.start > now) return { ...found, open: false }
    let start = found.start
    for (let period = periodStart(start) - WEATHER_PERIOD; start === period + WEATHER_PERIOD && period > now - HORIZON; period -= WEATHER_PERIOD) {
      const last = segmentsIn(period).at(-1)
      if (last?.[1] !== start) break
      start = last[0]
    }
    return { ...found, start, open: true }
  }

  let found = null
  for (let start = periodStart(now); start < now + HORIZON; start += WEATHER_PERIOD) {
    for (const [s, e] of segmentsIn(start)) {
      if (e <= now) continue
      if (!found) found = { start: s, end: e }
      else if (s <= found.end) found.end = Math.max(found.end, e)
      else return finish(found)
    }

    if (found && found.end < start + WEATHER_PERIOD) return finish(found)
  }

  return found && finish(found)
}

// How late a ring can still be, a hidden tab's timers run up to a minute late
const GRACE = 90 * 1000

/**
 * @param {import("./alarmBells.js").Alarm} alarm
 * @param {number} now
 * @returns {import("./listing.js").Window} Its window now or next, from its own times and weather odds
 */
export const alarmWindow = (alarm, now) => nextWeatherWindow(alarm, now, alarm.rates && { weather: alarm.rates })

/**
 * Which alarms ring now, and when to look again.
 * @param {import("./alarmBells.js").Alarm[]} alarms
 * @param {number} now
 * @param {number} lead Earth ms before a window they ring
 * @returns {{ due: [object, { start: number, end: number }][], next: number }} `next` is Infinity when nothing's coming
 */
export function alarmsDue(alarms, now, lead) {
  const due = []
  let next = Infinity
  for (const alarm of alarms) {
    let w = alarmWindow(alarm, now)
    if (!w || w.always) continue
    // One that just opened still rings, unless it has
    if (w.open && (alarm.rung === w.start || now - w.start > GRACE)) w = alarmWindow(alarm, w.end)
    if (!w) continue
    if (w.start - lead > now) next = Math.min(next, w.start - lead)
    else if (alarm.rung !== w.start) due.push([alarm, w])
    // Rung, looks again once it opens
    else next = Math.min(next, w.start)
  }
  return { due, next }
}

/**
 * A window finder with a cache per entry, looked up again once the window is over, or a minute later when none came up.
 * @param {(entry: object, now: number) => import("./listing.js").Window} find
 * @returns {(entry: object, now: number) => import("./listing.js").Window}
 */
export function cachedWindows(find) {
  // Weak, the alarms are read back as new objects on every change
  const cache = new WeakMap()

  return (entry, now) => {
    let cached = cache.get(entry)
    if (!cached || now >= cached.until) {
      const window = find(entry, now)
      cached = { window, until: window?.always ? Infinity : window?.end ?? now + 60 * 1000 }
      cache.set(entry, cached)
    }

    const { window } = cached
    return window && !window.always ? { ...window, open: window.start <= now } : window
  }
}
