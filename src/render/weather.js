import { facts, html, pager, readData, readExpansions, slug, weatherUrl } from "./html.js"
import { fishUrl } from "./fishing.js"
import { ogZone } from "./og.js"
import { vistaNumber, vistaUrl } from "./sightseeing.js"
import { toEorzea } from "../js/utils/eorzea.js"
import { mapPercent } from "../js/utils/map.js"
import { periodStart, WEATHER_PERIOD, weatherAt } from "../js/utils/windows.js"

// Now and the periods after it. A phone shows the first four, see _weather.scss
const PERIODS = 6
// The coming weather on a zone's page, js/weather-zone.js lists as many as the build's rows
const SHOWN = 12
const DATA_SOURCES = ["js/data/weather.json"]
const ICONS = readData("weather-icons.json")
// Zone -> its map in src/images/maps/, the one the gathering and fishing pages use, and its aetherytes
const MAPS = readData("weather-maps.json")
// Zone -> its loading screen and name, for its link preview
const ART = readData("weather-art.json")

/**
 * @param {{ name: string }} zone
 * @returns {string} "/weather/middle-la-noscea/"
 */
const zoneUrl = (zone) => weatherUrl(zone.name)

/**
 * @param {string} weather
 * @param {number} [size] In px
 * @returns {import("./html.js").Html} The game's icon for it
 */
const weatherIcon = (weather, size = 24) => html`<img class="weather-icon" src="/images/game/${ICONS[weather]}.webp" alt="" width="${size}" height="${size}">`

/**
 * A row per zone, its forecast left empty for js/weather.js to fill in: it changes every 23 minutes.
 * @param {{ name: string }} zone
 * @returns {import("./html.js").Html}
 */
const zoneRow = (zone) => html`
    <div class="weather-row" data-zone="${zone.name}">
      <a class="weather-zone" href="${zoneUrl(zone)}">${zone.name}</a>${Array.from({ length: PERIODS }, () => html`<span class="weather-cell"></span>`)}
    </div>`

/**
 * The periods' times, over the columns of every group.
 * @returns {import("./html.js").Html}
 */
const periodHead = () => html`
  <div class="weather-head-sentinel" id="weather-head-sentinel"></div>
  <div class="weather-head" id="weather-head">
    <span class="weather-head-zone">Zone</span>
    <span class="weather-period"><strong>Now</strong><span class="weather-period-sub" id="weather-change"></span></span>${Array.from({ length: PERIODS - 1 }, () => html`
    <span class="weather-period"><time></time><span class="weather-period-sub"></span></span>`)}
  </div>`

/**
 * @returns {{ head: import("./html.js").Html, groups: import("./html.js").Html, regionOptions: import("./html.js").Html, sources: string[] }}
 * The zones by expansion, then housing and field operations, as in weather.json. A first visit shows the latest
 * expansion, like the other lists, the rest are hidden by the CSS until the script takes over (all of them show
 * without it)
 */
export function weatherPage() {
  const zones = readData("weather.json")
  const groups = Map.groupBy(zones, (z) => z.group)
  const expansions = [...groups.keys()].filter((g) => !["Housing", "Field Operations"].includes(g))
  const selected = slug(expansions.at(-1))

  return {
    head: periodHead(),
    groups: html`${[...groups].map(([group, list]) => html`
<section class="${`weather-group${slug(group) === selected ? " weather-group-first" : ""}`}" data-group="${slug(group)}">
  <h2 class="weather-group-title"><span class="group-tab">${group}</span></h2>
  <div class="weather-zones">${list.map(zoneRow)}
  </div>
</section>`)}`,
    regionOptions: html`<option value="">All</option>${[...groups.keys()].map((g) => html`<option value="${slug(g)}"${slug(g) === selected && html` selected`}>${g}</option>`)}`,
    sources: DATA_SOURCES
  }
}

/**
 * Its chance of each weather, most likely first, as the sentence search results show.
 * @param {{ name: string, weather: [string, number][] }} zone
 * @returns {string} "Fair Skies 40%, Clear Skies 20%, ..."
 */
const chanceText = (zone) => [...zone.weather].sort((a, b) => b[1] - a[1]).map(([w, rate]) => `${w} ${rate}%`).join(", ")

/**
 * The finder's dropdowns: the weather before, the weather, and the ET hour the period starts at.
 * @param {object} zone
 * @returns {import("./html.js").Html}
 */
function finderFilters(zone) {
  const options = html`<option value="">Any</option>${zone.weather.map(([w]) => html`<option>${w}</option>`)}`
  return html`
    <div class="weather-filters">
      <label>From <select class="select" id="weather-from">${options}</select></label>
      <label>To <select class="select" id="weather-to">${options}</select></label>
      <label>At (ET) <select class="select" id="weather-at"><option value="">Any</option><option value="0">00:00</option><option value="8">08:00</option><option value="16">16:00</option></select></label>
    </div>`
}

/**
 * The zone's map with its aetherytes, no spot marked: the weather is the same all over it. Cut to the height next to
 * it on a computer, around its main aetheryte (--focus, how far down the map it is). js/weather-zone.js opens it in the
 * map dialog, with what data-map holds.
 * @param {object} zone
 * @returns {import("./html.js").Html | undefined}
 */
function zoneMap(zone) {
  const map = MAPS[zone.name]
  if (!map) return
  const at = (a) => `left: ${mapPercent(map, a.x).toFixed(2)}%; top: ${mapPercent(map, a.y).toFixed(2)}%`
  const focus = map.aetherytes[0] ? mapPercent(map, map.aetherytes[0].y) / 100 : .5
  const data = JSON.stringify({ zone: zone.name, map: { image: map.image, scale: map.scale }, aetherytes: map.aetherytes })

  return html`
    <a class="map map-zoom weather-map" href="/images/maps/${map.image}.webp" data-map="${data}" style="--focus: ${focus.toFixed(3)}" title="Show a bigger map">
      <span class="weather-map-canvas">
        <img src="/images/maps/${map.image}.webp" alt="Map of ${zone.name}" width="1024" height="1024">${map.aetherytes.map((a) => html`
        <span class="map-aetheryte" style="${at(a)}" title="${a.name} aetheryte"></span>`)}
      </span>
    </a>`
}

/**
 * The fish and vistas in each zone that wait on a weather, by zone.
 * @returns {Map<string, { weather: string[], previous?: string[], link: import("./html.js").Html, file: string }[]>}
 * previous is the weather a fish needs before it, file is the data it's from, relative to src/
 */
function waitingOnWeather() {
  const fish = readExpansions("fishing").flatMap((e) => e.entries.filter((f) => f.weather).map((f) => ({
    zone: f.zone,
    weather: f.weather,
    previous: f.previousWeather,
    link: html`<a href="${fishUrl(f)}">${f.name}</a>`,
    file: `js/data/fishing/${e.file}.json`
  })))
  const vistas = readExpansions("sightseeing").flatMap((e) => e.entries.filter((v) => v.weather).map((v) => ({
    zone: v.zone,
    weather: v.weather,
    link: html`<a href="${vistaUrl(v)}">${vistaNumber(v)} ${v.name}</a>`,
    file: `js/data/sightseeing/${e.file}.json`
  })))
  return Map.groupBy([...fish, ...vistas], (entry) => entry.zone)
}

/**
 * @param {{ link: import("./html.js").Html }[]} entries
 * @returns {import("./html.js").Html}
 */
const entryLinks = (entries) => html`<span class="detail-list">${entries.map((entry) => html`<span>${entry.link}</span>`)}</span>`

/**
 * @param {string} weather
 * @returns {import("./html.js").Html} Its icon and name
 */
const weatherLabel = (weather) => html`<span class="weather-label">${weatherIcon(weather, 20)}${weather}</span>`

/**
 * @param {string[]} weathers Any of them will do
 * @returns {import("./html.js").Html} One under the other, in a column of the changes
 */
const weatherChoices = (weathers) => html`<span class="weather-choices">${weathers.map(weatherLabel)}</span>`

/**
 * What one weather is enough for, then what waits on the weather changing, each change its own row. A weather before
 * is said once for every fish waiting on it, rather than after each of them.
 * @param {object} zone
 * @param {{ weather: string[], previous?: string[], link: import("./html.js").Html }[]} waiting From waitingOnWeather,
 * its own
 * @returns {import("./html.js").Html | undefined} Each weather and change, the most likely weather first
 */
function weatherNeeds(zone, waiting) {
  if (!waiting.length) return
  const order = [...zone.weather].sort((a, b) => b[1] - a[1]).map(([w]) => w)
  const steady = waiting.filter((entry) => !entry.previous)
  const changes = [...Map.groupBy(waiting.filter((entry) => entry.previous), (entry) => `${entry.previous} > ${entry.weather}`).values()]
    .sort((a, b) => order.indexOf(a[0].weather[0]) - order.indexOf(b[0].weather[0]))

  return html`
  <section class="weather-needs">${steady.length > 0 && html`
    <h2 class="detail-subtitle">Fish and vistas that wait on the weather</h2>
    ${facts(order.map((w) => [weatherLabel(w), steady.some((entry) => entry.weather.includes(w)) && entryLinks(steady.filter((entry) => entry.weather.includes(w)))]))}`}${changes.length > 0 && html`
    <h2 class="detail-subtitle">Fish that wait on the weather to change</h2>
    <dl class="detail-facts weather-changes">${changes.map((list) => html`
      <dt>${weatherChoices(list[0].previous)}<span class="weather-arrow" role="img" aria-label="to"></span>${weatherChoices(list[0].weather)}</dt>
      <dd>${entryLinks(list)}</dd>`)}
    </dl>`}
  </section>`
}

/**
 * The coming weather as js/weather-zone.js writes it, as of the build. Hidden until it puts the current ones in their
 * place (.weather-periods-pending), they take the room those will, so what's under the table doesn't move when they do
 * @param {object} zone
 * @returns {import("./html.js").Html}
 */
function periodRows(zone) {
  const start = periodStart(Date.now())
  return html`${Array.from({ length: SHOWN }, (_, i) => {
    const at = start + i * WEATHER_PERIOD
    const weather = weatherAt(zone, at)
    return html`
      <tr><td>${String(toEorzea(at).hours).padStart(2, "0")}:00</td><td class="weather-period-weather"><span class="weather-label">${weatherIcon(weather)}<span>${weather}</span></span></td><td><time>00:00</time></td><td>${i ? "00:00:00" : "Now"}</td></tr>`
  })}`
}

/**
 * @param {object} zone
 * @param {object[]} waiting See weatherNeeds
 * @returns {import("./html.js").Html}
 */
const zoneContent = (zone, waiting) => html`
<div class="weather-detail" data-zone="${JSON.stringify(zone)}">
  <header class="weather-detail-header">
    <div>
      <p class="detail-kicker">${zone.group} · Weather forecast</p>
      <h1 class="detail-title">${zone.name}</h1>
    </div>
  </header>
  <div class="weather-overview">
  <section class="weather-now-card" aria-label="Weather now">
    <div class="weather-now">
      <span class="detail-state">Now</span>
      <strong class="weather-now-name" id="weather-now"></strong>
    </div>
    <div class="weather-next">
      <span class="detail-state">Next: <strong id="weather-next"></strong></span>
      <strong class="detail-countdown" id="weather-countdown"></strong>
      <span class="weather-next-at">Changes at <time id="weather-change-at"></time></span>
    </div>
  </section>
  <section class="weather-chances-card">
    <h2 class="detail-subtitle">Weather chances</h2>
    <ul class="weather-chances">${[...zone.weather].sort((a, b) => b[1] - a[1]).map(([w, rate]) => html`
      <li>${weatherIcon(w)}<span>${w}</span><strong>${rate}%</strong></li>`)}
    </ul>
  </section>${zoneMap(zone)}
  </div>
  <section class="weather-finder">
    <h2 class="detail-subtitle">Coming weather</h2>${finderFilters(zone)}
    <table class="table weather-periods weather-periods-pending">
      <thead><tr><th>ET</th><th>Weather</th><th>Your time</th><th>In</th></tr></thead>
      <tbody id="weather-periods">${periodRows(zone)}
      </tbody>
    </table>
    <p class="table-empty" id="weather-periods-empty" hidden></p>
  </section>${weatherNeeds(zone, waiting)}
</div>`

/** @returns {object[]} A page per zone, see [zone].data.js */
export function zonePages() {
  const zones = readData("weather.json")
  const pagerTo = (zone) => zone && { url: zoneUrl(zone), text: zone.name }
  const waitingIn = waitingOnWeather()

  return zones.map((zone, i) => {
    const waiting = waitingIn.get(zone.name) ?? []
    return {
      slug: slug(zone.name),
      name: zone.name,
      title: `${zone.name} Weather Forecast: FFXIV`,
      ...ogZone(zone.name, ART[zone.name]),
      description: `FFXIV weather forecast for ${zone.name}: the weather now, when it changes, and when the weather you're after comes up next, in your local time. ${chanceText(zone)}.`,
      content: html`${zoneContent(zone, waiting)}
${pager(pagerTo(zones[i - 1]), pagerTo(zones[i + 1]), "Previous and next zone")}`,
      sources: [...DATA_SOURCES, "js/data/weather-maps.json", "js/data/weather-art.json", ...new Set(waiting.map((entry) => entry.file))]
    }
  })
}
