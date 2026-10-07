import "./utils/navbar.js"
import { applyDayNight } from "./utils/daynight.js"
import { formatCountdown, gmtOffset, setTime } from "./utils/timers.js"
import { tick } from "./utils/tick.js"
import { WEATHER_PERIOD, ZONES, forecast, periodStart, weatherAt, weatherNames } from "./utils/weather.js"

const zoneSelect = document.getElementById("zone")
const fromSelect = document.getElementById("filter-from")
const toSelect = document.getElementById("filter-to")
const timeSelect = document.getElementById("filter-time")
const nowWeather = document.getElementById("now-weather")
const nextWeather = document.getElementById("next-weather")
const nextCountdown = document.getElementById("next-countdown")
const nextAt = document.getElementById("next-at")
const forecastBody = document.getElementById("forecast")
const forecastTable = document.getElementById("forecast-table")
const forecastEmpty = document.getElementById("forecast-empty")
const localZone = document.getElementById("local-zone")

const ZONE_KEY = "weather-zone"
const DEFAULT_ZONE = "Middle La Noscea"
const ANY = ""

// Rows on screen, their "In" cell counts down every tick
let rows = []
let renderedKey = null

const pad = (n) => String(n).padStart(2, "0")
const etHour = (ms) => Math.floor(ms / 1000 / 175) % 24

function option(value, text = value) {
  const el = document.createElement("option")
  el.value = value
  el.textContent = text
  return el
}

// The zone options are already in the page, written by the build (see zoneOptions in build.js).
// The last picked zone is remembered
function pickZone() {
  let saved = null
  try {
    saved = localStorage.getItem(ZONE_KEY)
  } catch {
    // Falls back to the default zone
  }
  zoneSelect.value = ZONES.some((z) => z.name === saved) ? saved : DEFAULT_ZONE
}

// From/To only offer weathers the zone can actually have
function fillFilters() {
  const names = weatherNames(currentZone())
  fromSelect.replaceChildren(option(ANY, "Any"), ...names.map((n) => option(n)))
  toSelect.replaceChildren(option(ANY, "Any"), ...names.map((n) => option(n)))
}

const currentZone = () => ZONES.find((z) => z.name === zoneSelect.value)

function renderForecast(now) {
  const from = fromSelect.value
  const to = toSelect.value
  const time = timeSelect.value
  const filtered = from !== ANY || to !== ANY || time !== ANY

  const periods = forecast(currentZone(), now, {
    limit: filtered ? 10 : 12,
    filter: (p) => (from === ANY || p.previous === from)
      && (to === ANY || p.weather === to)
      && (time === ANY || etHour(p.start) === +time)
  })

  rows = periods.map((p) => {
    const tr = document.createElement("tr")
    tr.classList.toggle("current", p.start <= now)
    tr.innerHTML = `
      <td class="weather-et"></td>
      <td><span class="weather-previous"></span><span class="weather-arrow"> → </span><strong></strong></td>
      <td class="weather-local"><time></time></td>
      <td class="weather-in"></td>
    `
    const cells = tr.querySelectorAll("td")
    cells[0].textContent = `${pad(etHour(p.start))}:00`
    tr.querySelector(".weather-previous").textContent = p.previous
    tr.querySelector("strong").textContent = p.weather
    setTime(cells[2].querySelector("time"), new Date(p.start), new Date(now))
    return { period: p, tr, inCell: cells[3] }
  })

  // Filtering is about transitions, so then each row also shows the weather before it
  forecastTable.classList.toggle("transitions", filtered)
  forecastBody.replaceChildren(...rows.map((r) => r.tr))
  forecastEmpty.hidden = rows.length > 0
}

function render(now) {
  const zone = currentZone()
  const next = periodStart(now) + WEATHER_PERIOD

  nowWeather.textContent = weatherAt(zone, now)
  nextWeather.textContent = weatherAt(zone, next)
  nextCountdown.textContent = formatCountdown(next - now)
  setTime(nextAt, new Date(next), new Date(now), { zone: true })
  localZone.textContent = gmtOffset(new Date(now))

  // The list only changes when the weather does, or when a picker changes
  const key = [zone.name, fromSelect.value, toSelect.value, timeSelect.value, periodStart(now)].join("|")
  if (key !== renderedKey) {
    renderedKey = key
    renderForecast(now)
  }

  for (const { period, inCell } of rows) {
    inCell.textContent = period.start <= now ? "Now" : formatCountdown(period.start - now)
  }
}

pickZone()
fillFilters()
timeSelect.append(option(ANY, "Any"), ...[0, 8, 16].map((h) => option(String(h), `${pad(h)}:00`)))

zoneSelect.addEventListener("change", () => {
  try {
    localStorage.setItem(ZONE_KEY, zoneSelect.value)
  } catch {
    // Storage blocked, just not saved
  }
  fillFilters()
  render(Date.now())
})

for (const select of [fromSelect, toSelect, timeSelect]) {
  select.addEventListener("change", () => render(Date.now()))
}

tick(1000, (now) => {
  render(now)
  applyDayNight(now)
})
