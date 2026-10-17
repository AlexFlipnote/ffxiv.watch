import { fishUrl } from "../render/fishing.js"
import { readData, readExpansions, slug, weatherUrl } from "../render/html.js"
import { ogZone } from "../render/og.js"
import { vistaNumber, vistaUrl } from "../render/sightseeing.js"
import { toEorzea } from "../js/utils/eorzea.js"
import { mapPercent } from "../js/utils/map.js"
import { periodStart, WEATHER_PERIOD, weatherAt } from "../js/utils/windows.js"

export const sources = ["js/data/weather.json"]

// Rows in a zone's coming weather
const SHOWN = 12
const ICONS = readData("weather-icons.json")
// Zone -> its map in src/images/maps/, the one the gathering and fishing pages use, and its aetherytes
const MAPS = readData("weather-maps.json")
// Zone -> its loading screen and name, for its link preview
const ART = readData("weather-art.json")

/**
 * @param {string} weather
 * @returns {{ weather: string, icon: number }} With the game's icon for it
 */
const label = (weather) => ({ weather, icon: ICONS[weather] })

/**
 * The zones by expansion, then housing and field operations, as in weather.json. A first visit shows the latest
 * expansion, like the other lists, the rest are hidden by the CSS until the script takes over (all of them show without
 * it)
 * @param {object[]} zones
 * @returns {object[]}
 */
function groupsOf(zones) {
  const groups = Map.groupBy(zones, (z) => z.group)
  const expansions = [...groups.keys()].filter((g) => !["Housing", "Field Operations"].includes(g))
  const selected = slug(expansions.at(-1))

  return [...groups].map(([name, list]) => ({
    name,
    slug: slug(name),
    class: slug(name) === selected ? "weather-group weather-group-first" : "weather-group",
    selected: slug(name) === selected,
    zones: list.map((z) => ({ name: z.name, url: weatherUrl(z.name) }))
  }))
}

/**
 * The fish and vistas in each zone that wait on a weather, by zone.
 * @returns {Map<string, { weather: string[], previous?: string[], link: { url: string, text: string }, file: string }[]>}
 * previous is the weather a fish needs before it, file is the data it's from, relative to src/
 */
function waitingOnWeather() {
  const fish = readExpansions("fishing").flatMap((e) => e.entries.filter((f) => f.weather).map((f) => ({
    zone: f.zone,
    weather: f.weather,
    previous: f.previousWeather,
    link: { url: fishUrl(f), text: f.name },
    file: `js/data/fishing/${e.file}.json`
  })))
  const vistas = readExpansions("sightseeing").flatMap((e) => e.entries.filter((v) => v.weather).map((v) => ({
    zone: v.zone,
    weather: v.weather,
    link: { url: vistaUrl(v), text: `${vistaNumber(v)} ${v.name}` },
    file: `js/data/sightseeing/${e.file}.json`
  })))
  return Map.groupBy([...fish, ...vistas], (entry) => entry.zone)
}

/**
 * What one weather is enough for, then what waits on the weather changing, each change its own row. A weather before
 * is said once for every fish waiting on it, rather than after each of them.
 * @param {object} zone
 * @param {object[]} waiting From waitingOnWeather, its own
 * @returns {{ steady: object[], changes: object[] } | false} Each weather and change, the most likely weather first
 */
function weatherNeeds(zone, waiting) {
  if (!waiting.length) return false
  const order = [...zone.weather].sort((a, b) => b[1] - a[1]).map(([w]) => w)
  const steady = waiting.filter((entry) => !entry.previous)
  const changes = [...Map.groupBy(waiting.filter((entry) => entry.previous), (entry) => `${entry.previous} > ${entry.weather}`).values()]
    .sort((a, b) => order.indexOf(a[0].weather[0]) - order.indexOf(b[0].weather[0]))

  return {
    steady: order
      .map((w) => ({ ...label(w), links: steady.filter((entry) => entry.weather.includes(w)).map((entry) => entry.link) }))
      .filter((row) => row.links.length),
    changes: changes.map((list) => ({
      previous: list[0].previous.map(label),
      weather: list[0].weather.map(label),
      links: list.map((entry) => entry.link)
    }))
  }
}

/**
 * The zone's map with its aetherytes, no spot marked: the weather is the same all over it. Cut to the height next to
 * it on a computer, around its main aetheryte (focus, how far down the map it is). js/weather-zone.js opens it in the
 * map dialog, with what data holds.
 * @param {object} zone
 * @returns {object | false}
 */
function zoneMap(zone) {
  const map = MAPS[zone.name]
  if (!map) return false
  const at = (a) => `left: ${mapPercent(map, a.x).toFixed(2)}%; top: ${mapPercent(map, a.y).toFixed(2)}%`
  return {
    image: map.image,
    focus: (map.aetherytes[0] ? mapPercent(map, map.aetherytes[0].y) / 100 : .5).toFixed(3),
    data: JSON.stringify({ zone: zone.name, map: { image: map.image, scale: map.scale }, aetherytes: map.aetherytes }),
    aetherytes: map.aetherytes.map((a) => ({ name: a.name, style: at(a) }))
  }
}

/**
 * The coming weather as of the build, hidden until js/weather-zone.js writes the current rows in their place.
 * @param {object} zone
 * @returns {object[]}
 */
function periodRows(zone) {
  const start = periodStart(Date.now())
  return Array.from({ length: SHOWN }, (_, i) => {
    const at = start + i * WEATHER_PERIOD
    return { hour: String(toEorzea(at).hours).padStart(2, "0"), ...label(weatherAt(zone, at)), in: i ? "00:00:00" : "Now" }
  })
}

/**
 * The weather list, and a page per zone, see weather/[weather.zones.slug].html.
 */
export default () => {
  const zones = readData("weather.json")
  const waitingIn = waitingOnWeather()
  const pagerTo = (zone) => zone && { url: weatherUrl(zone.name), text: zone.name }

  return {
    groups: groupsOf(zones),
    zones: zones.map((zone, i) => {
      const waiting = waitingIn.get(zone.name) ?? []
      const chances = [...zone.weather].sort((a, b) => b[1] - a[1])
      return {
        slug: slug(zone.name),
        name: zone.name,
        group: zone.group,
        title: `${zone.name} Weather Forecast: FFXIV`,
        ...ogZone(zone.name, ART[zone.name]),
        description: `FFXIV weather forecast for ${zone.name}: the weather now, when it changes, and when the weather you're after comes up next, in your local time. ${chances.map(([w, rate]) => `${w} ${rate}%`).join(", ")}.`,
        data: JSON.stringify(zone),
        chances: chances.map(([w, rate]) => ({ ...label(w), rate })),
        weathers: zone.weather.map(([w]) => w),
        map: zoneMap(zone),
        periods: periodRows(zone),
        needs: weatherNeeds(zone, waiting),
        pager: { label: "Previous and next zone", prev: pagerTo(zones[i - 1]), next: pagerTo(zones[i + 1]) },
        sources: [...sources, "js/data/weather-maps.json", "js/data/weather-art.json", ...new Set(waiting.map((entry) => entry.file))]
      }
    })
  }
}
