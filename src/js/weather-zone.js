import "./utils/navbar.js"
import ICONS from "./data/weather-icons.json"
import { toEorzea } from "./utils/eorzea.js"
import { openMap } from "./utils/mapModal.js"
import { everyTick, formatCountdown, formatIn, setText, setTime } from "./utils/time.js"
import { periodStart, WEATHER_PERIOD, weatherAt } from "./utils/windows.js"

// As far ahead as the fish and vista windows look
const HORIZON = 30 * 24 * 60 * 60 * 1000

const zone = JSON.parse(document.querySelector(".weather-detail").dataset.zone)
const nowName = document.getElementById("weather-now")
const nextName = document.getElementById("weather-next")
const countdown = document.getElementById("weather-countdown")
const changeAt = document.getElementById("weather-change-at")
const body = document.getElementById("weather-periods")
// As many as the build's rows
const SHOWN = body.children.length
const empty = document.getElementById("weather-periods-empty")
// The map opens in the dialog, with the zone's aetherytes, rather than as the image on its own
const map = document.querySelector(".weather-map[data-map]")
map?.addEventListener("click", (e) => {
  e.preventDefault()
  openMap(JSON.parse(map.dataset.map))
})

const selects = {
  from: document.getElementById("weather-from"),
  to: document.getElementById("weather-to"),
  at: document.getElementById("weather-at")
}

/**
 * @param {string} weather
 * @returns {HTMLElement} Its icon and name, kept on one line together
 */
function weatherLabel(weather) {
  const label = Object.assign(document.createElement("span"), { className: "weather-label" })
  label.append(
    Object.assign(document.createElement("img"), { className: "weather-icon", src: `/images/game/${ICONS[weather]}.webp`, alt: "", width: 24, height: 24 }),
    Object.assign(document.createElement("span"), { textContent: weather })
  )
  return label
}

/**
 * @param {number} now
 * @returns {number} When the weather turns into something else, the period after can have the same
 */
function nextChange(now) {
  const current = weatherAt(zone, now)
  let start = periodStart(now) + WEATHER_PERIOD
  while (weatherAt(zone, start) === current && start < now + HORIZON) start += WEATHER_PERIOD
  return start
}

/**
 * The periods from now that the dropdowns let through.
 * @param {number} now
 * @returns {{ start: number, weather: string, previous: string }[]}
 */
function findPeriods(now) {
  const { from, to, at } = Object.fromEntries(Object.entries(selects).map(([name, select]) => [name, select.value]))
  const found = []
  for (let start = periodStart(now); start < now + HORIZON && found.length < SHOWN; start += WEATHER_PERIOD) {
    const weather = weatherAt(zone, start)
    const previous = weatherAt(zone, start - WEATHER_PERIOD)
    if ((to && weather !== to) || (from && previous !== from) || (at && toEorzea(start).hours !== +at)) continue
    found.push({ start, weather, previous })
  }
  return found
}

// Each row's elements the tick updates
let rows = []

/** @param {number} now */
function fillPeriods(now) {
  const showPrevious = !!selects.from.value
  rows = findPeriods(now).map((period) => {
    const tr = document.createElement("tr")
    const cells = Array.from({ length: 4 }, () => tr.appendChild(document.createElement("td")))
    cells[0].textContent = `${String(toEorzea(period.start).hours).padStart(2, "0")}:00`
    cells[1].className = "weather-period-weather"
    cells[1].append(weatherLabel(period.weather))
    if (showPrevious) cells[1].append(Object.assign(document.createElement("span"), { className: "weather-after", textContent: `after ${period.previous}` }))
    const time = cells[2].appendChild(document.createElement("time"))
    // The day only when it isn't today, small under the time, so a phone's narrow column keeps to two lines
    const date = new Date(period.start)
    if (date.toDateString() !== new Date(now).toDateString()) {
      cells[2].append(Object.assign(document.createElement("span"), {
        className: "weather-day", textContent: date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })
      }))
    }
    return { ...period, tr, time, left: cells[3] }
  })
  body.replaceChildren(...rows.map((r) => r.tr))
  empty.textContent = "Not in the next 30 days."
  empty.hidden = rows.length > 0
}

/** @param {number} now */
function tickPeriods(now) {
  // Only the first one to come ticks by the second, the rest would be a column of changing digits
  const next = rows.find((row) => row.start > now)
  for (const row of rows) {
    const open = row.start <= now
    row.tr.classList.toggle("weather-current", open)
    // Only the time, the day is next to it, the full date is in its hover title
    setTime(row.time, new Date(row.start), new Date(row.start))
    setText(row.left, open ? "Now" : row === next ? formatCountdown(row.start - now) : formatIn(row.start - now))
  }
}

function saveUrl() {
  const url = new URL(location.href)
  for (const [name, select] of Object.entries(selects)) {
    if (select.value) url.searchParams.set(name, select.value)
    else url.searchParams.delete(name)
  }
  if (url.href !== location.href) history.replaceState(history.state, "", url)
}

const params = new URLSearchParams(location.search)
for (const [name, select] of Object.entries(selects)) {
  const value = params.get(name)
  if ([...select.options].some((o) => o.value === value)) select.value = value
  select.addEventListener("change", () => {
    fillPeriods(Date.now())
    tickPeriods(Date.now())
    saveUrl()
  })
}

// A small extra: a chance picks its weather in the finder's "To", and picking it again lets it go
for (const chance of document.querySelectorAll(".weather-chances li")) {
  chance.addEventListener("click", () => {
    const weather = chance.querySelector("span").textContent
    selects.to.value = selects.to.value === weather ? "" : weather
    selects.to.dispatchEvent(new Event("change"))
  })
}

let shownPeriod = null
everyTick((now) => {
  const period = periodStart(now)
  if (period !== shownPeriod) {
    shownPeriod = period
    const change = nextChange(now)
    nowName.replaceChildren(weatherLabel(weatherAt(zone, now)))
    nextName.textContent = weatherAt(zone, change)
    changeAt.dataset.at = change
    // The first row has moved on
    fillPeriods(now)
    document.querySelector(".weather-pending")?.classList.remove("weather-pending")
  }

  const change = +changeAt.dataset.at
  setText(countdown, formatCountdown(change - now))
  setTime(changeAt, new Date(change), new Date(now))
  tickPeriods(now)
})
