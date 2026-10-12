import "./utils/navbar.js"
import { everyTick, formatCountdown, setText, setTime } from "./utils/time.js"
import { VOYAGE, voyageAt } from "./utils/voyages.js"

const BOARDING = 15 * 60 * 1000
// The voyages listed after the next one
const COMING = 6

const next = document.querySelector(".ocean-next")
const state = document.getElementById("ocean-state")
const countdown = document.getElementById("ocean-countdown")
const when = document.getElementById("ocean-when")
const schedule = document.getElementById("ocean-schedule")
// Each stop's fish, further down, by place, and its blue fish with the time of day it needs
const stopCards = [...document.querySelectorAll(".ocean-stop")]
const anchors = new Map(stopCards.map((s) => [s.dataset.place, `#${s.id}`]))
const blueFish = new Map(stopCards.filter((s) => s.dataset.blue).map((s) => [s.dataset.place, JSON.parse(s.dataset.blue)]))
const routes = [...document.querySelectorAll(".ocean-route")].map((el) => ({
  route: el.dataset.route,
  destination: el.querySelector(".ocean-destination"),
  stops: el.querySelector(".ocean-stops")
}))

/**
 * @param {{ place: string, time: string }} stop
 * @returns {HTMLElement} The place, linked to its fish, and the time of day there, kept on one line together
 */
function stopPart(stop) {
  const part = Object.assign(document.createElement("span"), { className: "ocean-stop-part" })
  part.append(
    Object.assign(document.createElement("a"), { href: anchors.get(stop.place) ?? "#", textContent: stop.place }),
    Object.assign(document.createElement("span"), { className: `chip ocean-time ocean-${stop.time.toLowerCase()}`, textContent: stop.time })
  )
  return part
}

/**
 * Only the next voyage's, the list of coming ones would get too busy. Apart from the stop's line, so on a phone it
 * can go under it rather than run past the screen's edge
 * @param {{ place: string, time: string }} stop
 * @returns {HTMLElement[]} Its blue fish, when the voyage gets there at the time it bites
 */
function blueChip(stop) {
  const blue = blueFish.get(stop.place)
  if (!blue || blue.time !== stop.time) return []
  return [Object.assign(document.createElement("a"), {
    className: "chip chip-gold ocean-blue-chip", href: blue.url, textContent: blue.name, title: `Blue fish, ${blue.name} bites here at ${stop.time.toLowerCase()}`
  })]
}

/** @param {number} start When the shown voyage's boarding opens */
function fillVoyages(start) {
  for (const { route, destination, stops } of routes) {
    const voyage = voyageAt(route, start)
    destination.textContent = voyage.destination
    stops.replaceChildren(...voyage.stops.map((stop) => {
      const li = document.createElement("li")
      li.append(stopPart(stop), ...blueChip(stop))
      return li
    }))
  }

  schedule.replaceChildren(...Array.from({ length: COMING }, (_, i) => {
    const time = start + (i + 1) * VOYAGE
    const li = document.createElement("li")
    li.dataset.start = time
    li.append(document.createElement("time"), ...routes.map(({ route }) => {
      const line = Object.assign(document.createElement("span"), { className: "ocean-schedule-route" })
      line.append(Object.assign(document.createElement("strong"), { textContent: route === "indigo" ? "Indigo" : "Ruby" }))
      line.append(...voyageAt(route, time).stops.map(stopPart))
      return line
    }))
    return li
  }))
}

let shown = null
everyTick((now) => {
  const departed = Math.floor(now / VOYAGE) * VOYAGE
  const boarding = now < departed + BOARDING
  const start = boarding ? departed : departed + VOYAGE
  if (start !== shown) {
    shown = start
    fillVoyages(start)
    next.classList.toggle("ocean-boarding", boarding)
  }

  setText(state, boarding ? "Boarding, closes in" : "Next voyage in")
  setText(countdown, formatCountdown((boarding ? start + BOARDING : start) - now))
  setTime(when, new Date(start), new Date(now))
  for (const li of schedule.children) setTime(li.firstChild, new Date(+li.dataset.start), new Date(now))
  // The build's stand-ins are replaced, see oceanPage in src/render/ocean.js
  document.querySelector(".ocean-pending")?.classList.remove("ocean-pending")
})
