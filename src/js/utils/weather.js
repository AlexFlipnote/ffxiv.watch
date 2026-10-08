import ZONES from "../data/weather.json"

export { ZONES }

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
 * @param {{ weather: [string, number][] }} zone [name, chance] pairs, rolled in order
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
 * @param {{ weather: [string, number][] }} zone
 * @returns {string[]} Each weather the zone can have, once
 */
export const weatherNames = (zone) => [...new Set(zone.weather.map(([name]) => name))]

/**
 * Weather periods from the one containing `from` onwards.
 * @param {{ weather: [string, number][] }} zone
 * @param {number} from
 * @param {{ filter?: (period: object) => boolean, limit?: number, horizon?: number }} [options]
 * @returns {{ start: number, end: number, weather: string, previous: string }[]}
 */
export function forecast(zone, from, { filter = () => true, limit = 10, horizon = 30 * 24 * 60 * 60 * 1000 } = {}) {
  const periods = []
  let start = periodStart(from)
  let previous = weatherAt(zone, start - WEATHER_PERIOD)

  while (periods.length < limit && start < from + horizon) {
    const period = { start, end: start + WEATHER_PERIOD, weather: weatherAt(zone, start), previous }
    if (filter(period)) periods.push(period)
    previous = period.weather
    start += WEATHER_PERIOD
  }
  return periods
}
