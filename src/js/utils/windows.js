import ZONES from "../data/weather.json" with { type: "json" }
import * as forecast from "./forecast.js"

// forecast.js with each zone's weather looked up in weather.json

export { periodStart, WEATHER_PERIOD, weatherAt } from "./forecast.js"

/** @typedef {import("./forecast.js").Timed} Timed */

/**
 * @param {Timed} entry
 * @returns {import("./forecast.js").Zone | undefined} Its zone's weather, when it waits for some
 */
export const zoneOf = (entry) => (entry.weather || entry.previousWeather) ? ZONES.find((z) => z.name === entry.zone) : undefined

/**
 * See forecast.windowsBetween.
 * @param {Timed} entry
 * @param {number} from
 * @param {number} to
 * @returns {{ start: number, end: number }[]}
 */
export const windowsBetween = (entry, from, to) => forecast.windowsBetween(entry, from, to, zoneOf(entry))

/**
 * See forecast.nextWeatherWindow.
 * @param {Timed} entry
 * @param {number} now
 * @returns {import("./listing.js").Window}
 */
export const nextWeatherWindow = (entry, now) => forecast.nextWeatherWindow(entry, now, zoneOf(entry))

/**
 * What an alarm keeps to work out its windows on any page.
 * @param {Timed} entry
 * @returns {object} Its times and weather, and its zone's odds when it waits for weather
 */
export const alarmTiming = (entry) => ({
  zone: entry.zone, times: entry.times, weather: entry.weather, previousWeather: entry.previousWeather, rates: zoneOf(entry)?.weather
})

/** @returns {(entry: Timed, now: number) => import("./listing.js").Window} nextWeatherWindow, cached per entry */
export const cachedWeatherWindows = () => forecast.cachedWindows(nextWeatherWindow)

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
