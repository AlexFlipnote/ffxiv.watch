import { fishUrl, tugMarks } from "./fishing.js"
import { chip, html, readData, slug } from "./html.js"
import { VOYAGE, voyageAt } from "../js/utils/voyages.js"

const DATA_SOURCES = ["js/data/ocean-fishing.json", "js/data/ocean-fish.json"]

/**
 * @param {number} id
 * @param {Record<string, number>} icons Item id -> icon, from ocean-fish.json
 * @returns {import("./html.js").Html}
 */
const icon = (id, icons) => html`<img class="bait-icon" src="/images/game/${icons[id]}.webp" alt="" width="24" height="24">`

/**
 * One fish of a stop, with what it bites on. A blue fish gets what it needs caught first too.
 * @param {object} fish From ocean-fish.json
 * @param {Record<string, number>} icons
 * @returns {import("./html.js").Html}
 */
const fishLine = (fish, icons) => html`
        <li class="${fish.blue ? "ocean-fish ocean-blue" : "ocean-fish"}">
          <span class="bait-step">${icon(fish.id, icons)}<a href="${fishUrl(fish)}">${fish.name}</a></span>${fish.blue && chip(fish.time ? `Blue fish, ${fish.time}` : "Blue fish", "chip-gold", fish.time && `Bites in the spectral current when the voyage gets here at ${fish.time.toLowerCase()}`)}
          <span class="ocean-catch">${fish.bait && html`<span class="bait-step">${icon(fish.bait.id, icons)}${fish.bait.name}</span>`}${fish.tug && tugMarks(fish.tug)}</span>${fish.predators && html`
          <span class="ocean-intuition">Intuition: catch ${fish.predators.map((p) => `${p.count}x ${p.name}`).join(" and ")} first</span>`}
        </li>`

/**
 * @param {{ place: string, fish: object[], spectral: object[] }} stop
 * @param {Record<string, number>} icons
 * @returns {import("./html.js").Html} Linked to from the voyages, by the place's slug. data-blue is its blue fish and the
 * time of day it needs, js/ocean.js marks the voyages that get here then
 */
function stopCard(stop, icons) {
  const blue = stop.spectral.find((f) => f.blue && f.time)
  return html`
<section class="ocean-stop" id="${slug(stop.place)}" data-place="${stop.place}"${blue && html` data-blue="${JSON.stringify({ name: blue.name, time: blue.time, url: fishUrl(blue) })}"`}>
  <h3 class="ocean-stop-name">${stop.place}</h3>
  <div class="ocean-lists">
    <div>
      <h4 class="ocean-list-title">Fish</h4>
      <ul class="ocean-list">${stop.fish.map((f) => fishLine(f, icons))}
      </ul>
    </div>
    <div>
      <h4 class="ocean-list-title">Spectral current</h4>
      <ul class="ocean-list">${stop.spectral.map((f) => fishLine(f, icons))}
      </ul>
    </div>
  </div>
</section>`
}

/**
 * A route's next voyage, filled in by js/ocean.js.
 * @param {"indigo" | "ruby"} route
 * @param {string} name
 * @param {string} from Where it leaves from
 * @returns {import("./html.js").Html}
 */
const routeCard = (route, name, from, start, blue) => {
  const voyage = voyageAt(route, start)
  return html`
    <div class="ocean-route" data-route="${route}">
      <h2 class="ocean-route-name">${name} route <span class="ocean-route-from">from ${from}</span></h2>
      <p class="ocean-destination">${voyage.destination}</p>
      <ol class="ocean-stops">${voyage.stops.map((stop) => html`<li>${stopPart(stop)}${blueChip(stop, blue)}</li>`)}</ol>
    </div>`
}

/**
 * A stop as js/ocean.js writes it, so the build's stand-in for the voyages takes the same room (see oceanPage).
 * @param {{ place: string, time: string }} stop
 * @returns {import("./html.js").Html}
 */
const stopPart = (stop) => html`<span class="ocean-stop-part"><a href="#${slug(stop.place)}">${stop.place}</a><span class="chip ocean-time ocean-${stop.time.toLowerCase()}">${stop.time}</span></span>`

/**
 * @param {{ place: string, time: string }} stop
 * @param {Map<string, object>} blue Stop -> its blue fish
 * @returns {import("./html.js").Html | undefined} The next voyage's blue fish at the stop, like js/ocean.js
 */
function blueChip(stop, blue) {
  const fish = blue.get(stop.place)
  return fish?.time === stop.time && html`<a class="chip chip-gold ocean-blue-chip" href="${fishUrl(fish)}">${fish.name}</a>`
}

/**
 * The coming voyages as js/ocean.js writes them.
 * @param {number} start When the next voyage boards
 * @returns {import("./html.js").Html}
 */
const schedule = (start) => html`${Array.from({ length: 6 }, (_, i) => start + (i + 1) * VOYAGE).map((time) => html`
            <li><time>Mon 1 Jan, 00:00</time>${["indigo", "ruby"].map((route) => html`<span class="ocean-schedule-route"><strong>${route === "indigo" ? "Indigo" : "Ruby"}</strong>${voyageAt(route, time).stops.map(stopPart)}</span>`)}</li>`)}`

/**
 * @returns {{ next: import("./html.js").Html, schedule: import("./html.js").Html, stops: import("./html.js").Html, sources: string[] }}
 */
export function oceanPage() {
  const { stops, icons } = readData("ocean-fish.json")
  const byRoute = Map.groupBy(stops, (s) => s.route)
  // The voyages as they were when the page was built, hidden until js/ocean.js puts the current ones in their place:
  // they take the room those will, so nothing under them moves when they do
  const start = Math.ceil(Date.now() / VOYAGE) * VOYAGE
  const blue = new Map(stops.map((s) => [s.place, s.spectral.find((f) => f.blue && f.time)]).filter(([, f]) => f))

  return {
    next: html`${routeCard("indigo", "Indigo", "Limsa Lominsa", start, blue)}${routeCard("ruby", "Ruby", "Kugane", start, blue)}`,
    schedule: schedule(start),
    stops: html`${[...byRoute].map(([route, list]) => html`
<h2 class="ocean-heading">${route} route stops</h2>${list.map((s) => stopCard(s, icons))}`)}`,
    sources: DATA_SOURCES
  }
}
