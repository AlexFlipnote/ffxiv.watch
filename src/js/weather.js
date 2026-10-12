import "./utils/navbar.js"
import ZONES from "./data/weather.json"
import ICONS from "./data/weather-icons.json"
import { toEorzea } from "./utils/eorzea.js"
import { everyTick, setText, setTime } from "./utils/time.js"
import { periodStart, WEATHER_PERIOD, weatherAt } from "./utils/windows.js"

const container = document.getElementById("weather")
const search = document.getElementById("search")
const regionSelect = document.getElementById("filter-region")
const empty = document.getElementById("weather-empty")
const change = document.getElementById("weather-change")
const periodTimes = [...document.querySelectorAll("#weather-head .weather-period")].slice(1)
  .map((el) => ({ time: el.querySelector("time"), et: el.querySelector(".weather-period-sub") }))

// An option with no value, "All", in the URL, like the lists
const ANY = "any"
const defaultRegion = regionSelect.value

const zoneByName = new Map(ZONES.map((z) => [z.name, z]))
const groups = [...container.querySelectorAll(".weather-group")].map((section) => ({
  section,
  region: section.dataset.group,
  rows: [...section.querySelectorAll(".weather-row")].map((row) => ({
    row,
    zone: zoneByName.get(row.dataset.zone),
    cells: [...row.querySelectorAll(".weather-cell")],
    // The zone and the weather on show, lowercase, for the search
    text: ""
  }))
}))

/**
 * @param {HTMLElement} cell
 * @param {string} weather
 */
function fillCell(cell, weather) {
  if (cell.dataset.weather === weather) return
  cell.dataset.weather = weather
  const icon = Object.assign(document.createElement("img"), { src: `/images/game/${ICONS[weather]}.webp`, alt: "", width: 32, height: 32 })
  cell.replaceChildren(icon, Object.assign(document.createElement("span"), { textContent: weather }))
}

/** @param {number} period Start of the period on now */
function fillForecast(period) {
  for (const { rows } of groups) {
    for (const entry of rows) {
      const forecast = entry.cells.map((cell, i) => {
        const weather = weatherAt(entry.zone, period + i * WEATHER_PERIOD)
        fillCell(cell, weather)
        return weather
      })
      entry.text = [entry.zone.name, ...forecast].join("|").toLowerCase()
    }
  }
}

/**
 * Searching looks through every region, like the lists do, the dropdown only picks what shows without one.
 */
function applyFilters() {
  const query = search.value.trim().toLowerCase()
  let shown = 0
  for (const { section, region, rows } of groups) {
    let any = false
    for (const { row, text } of rows) {
      const show = query ? text.includes(query) : !regionSelect.value || region === regionSelect.value
      row.hidden = !show
      any ||= show
    }
    section.hidden = !any
    if (any) shown++
  }
  empty.textContent = "No zones match."
  empty.hidden = shown > 0
}

function saveUrl() {
  const url = new URL(location.href)
  if (regionSelect.value === defaultRegion) url.searchParams.delete("region")
  else url.searchParams.set("region", regionSelect.value || ANY)
  const query = search.value.trim()
  if (query) url.searchParams.set("q", query)
  else url.searchParams.delete("q")
  if (url.href !== location.href) history.replaceState(history.state, "", url)
}

const params = new URLSearchParams(location.search)
const region = params.get("region") === ANY ? "" : params.get("region")
if ([...regionSelect.options].some((o) => o.value === region)) regionSelect.value = region
search.value = params.get("q") ?? ""

for (const input of [search, regionSelect]) {
  input.addEventListener(input === search ? "input" : "change", () => {
    applyFilters()
    saveUrl()
  })
}

let shownPeriod = null
everyTick((now) => {
  const period = periodStart(now)
  if (period !== shownPeriod) {
    shownPeriod = period
    fillForecast(period)
    // The weather the search looks at moved on
    applyFilters()
  }

  // In minutes, "22:27 left" would read as a time next to the others. A period is 23 minutes 20 seconds
  setText(change, `${Math.ceil((period + WEATHER_PERIOD - now) / 60000)} min left`)
  periodTimes.forEach(({ time, et }, i) => {
    const start = period + (i + 1) * WEATHER_PERIOD
    // Only the time, the periods are minutes apart, the full date is in its hover title
    setTime(time, new Date(start), new Date(start))
    setText(et, `ET ${String(toEorzea(start).hours).padStart(2, "0")}:00`)
  })
})

// Stuck once where it started has scrolled up under the navbar. The navbar's background then reaches down behind it,
// as far as it's tall (see _weather.scss)
const head = document.getElementById("weather-head")
const reach = () => document.documentElement.style.setProperty("--navbar-reach",
  head.classList.contains("weather-head-stuck") ? `${head.offsetHeight}px` : "0px")
new IntersectionObserver(([entry]) => {
  head.classList.toggle("weather-head-stuck", !entry.isIntersecting && entry.boundingClientRect.top < entry.rootBounds.top)
  reach()
}, { rootMargin: `-${document.querySelector(".navbar").offsetHeight}px 0px 0px 0px` }).observe(document.getElementById("weather-head-sentinel"))
// A phone turned sideways, say, changes how tall it is
new ResizeObserver(reach).observe(head)

// The CSS showed only the first region until now
container.classList.add("weather-ready")
