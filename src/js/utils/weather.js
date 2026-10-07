// Eorzean weather: fully deterministic, so any zone can be forecast as far ahead as you like.
// Weather changes every 8 Eorzean hours (ET 00:00, 08:00 and 16:00), which is 23 minutes 20 seconds of Earth time.
// Each change rolls a number from 0-99 out of the time, the zone's weather rates decide what that roll means.
import ZONES from "../data/weather.json"

export { ZONES }

export const WEATHER_PERIOD = 8 * 175 * 1000

export const periodStart = (ms) => Math.floor(ms / WEATHER_PERIOD) * WEATHER_PERIOD

// The game's roll for the weather period starting at `ms`, done in unsigned 32-bit like the game
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

export function weatherAt(zone, ms) {
  let chance = roll(periodStart(ms))
  for (const [name, rate] of zone.weather) {
    if (chance < rate) return name
    chance -= rate
  }
  // A few zones' rates add up to less than 100, the last weather covers the rest
  return zone.weather.at(-1)[0]
}

export const weatherNames = (zone) => [...new Set(zone.weather.map(([name]) => name))]

/** Weather periods from the one containing `from` onwards, as { start, end, weather, previous }. */
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
