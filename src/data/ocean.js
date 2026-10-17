import { fishUrl } from "../render/fishing.js"
import { readData, slug } from "../render/html.js"
import { VOYAGE, voyageAt } from "../js/utils/voyages.js"

export const sources = ["js/data/ocean-fishing.json", "js/data/ocean-fish.json"]

const ROUTES = [
  { route: "indigo", name: "Indigo", from: "Limsa Lominsa" },
  { route: "ruby", name: "Ruby", from: "Kugane" }
]

/**
 * A stop as js/ocean.js writes it, see partials/ocean-stop.html.
 * @param {{ place: string, time: string }} stop
 * @param {Map<string, object>} [blue] Stop -> its blue fish, for the next voyage's blue fish at it, like js/ocean.js
 * @returns {object}
 */
function stopOf(stop, blue) {
  const fish = blue?.get(stop.place)
  return {
    place: stop.place,
    id: slug(stop.place),
    time: stop.time,
    timeClass: stop.time.toLowerCase(),
    blue: fish?.time === stop.time && { url: fishUrl(fish), name: fish.name }
  }
}

/**
 * One fish of a stop, with what it bites on. A blue fish gets what it needs caught first too.
 * @param {object} fish From ocean-fish.json
 * @param {Record<string, number>} icons Item id -> icon
 * @returns {object}
 */
const fishOf = (fish, icons) => ({
  class: fish.blue ? "ocean-fish ocean-blue" : "ocean-fish",
  icon: icons[fish.id],
  url: fishUrl(fish),
  name: fish.name,
  blue: fish.blue && {
    text: fish.time ? `Blue fish, ${fish.time}` : "Blue fish",
    title: fish.time ? `Bites in the spectral current when the voyage gets here at ${fish.time.toLowerCase()}` : false
  },
  bait: fish.bait ? { icon: icons[fish.bait.id], name: fish.bait.name } : false,
  // The game's ! to !!! over the character's head
  tug: fish.tug ? { marks: Array.from({ length: { light: 1, medium: 2, heavy: 3 }[fish.tug] }), name: fish.tug[0].toUpperCase() + fish.tug.slice(1) } : false,
  intuition: fish.predators ? fish.predators.map((p) => `${p.count}x ${p.name}`).join(" and ") : false
})

/** The voyages and every stop's fish, for /ocean-fishing/. */
export default () => {
  const { stops, icons } = readData("ocean-fish.json")
  // The voyages as they were when the page was built, hidden until js/ocean.js puts the current ones in their place:
  // they take the room those will, so nothing under them moves when they do
  const start = Math.ceil(Date.now() / VOYAGE) * VOYAGE
  const blue = new Map(stops.map((s) => [s.place, s.spectral.find((f) => f.blue && f.time)]).filter(([, f]) => f))

  return {
    next: ROUTES.map(({ route, name, from }) => {
      const voyage = voyageAt(route, start)
      return { route, name, from, destination: voyage.destination, stops: voyage.stops.map((stop) => stopOf(stop, blue)) }
    }),
    schedule: Array.from({ length: 6 }, (_, i) => start + (i + 1) * VOYAGE).map((time) => ({
      routes: ROUTES.map(({ route, name }) => ({ name, stops: voyageAt(route, time).stops.map((stop) => stopOf(stop)) }))
    })),
    routes: [...Map.groupBy(stops, (s) => s.route)].map(([route, list]) => ({
      route,
      stops: list.map((stop) => {
        const blueFish = stop.spectral.find((f) => f.blue && f.time)
        return {
          id: slug(stop.place),
          place: stop.place,
          // Its blue fish and the time of day it needs, js/ocean.js marks the voyages that get here then
          blue: blueFish ? JSON.stringify({ name: blueFish.name, time: blueFish.time, url: fishUrl(blueFish) }) : false,
          fish: stop.fish.map((f) => fishOf(f, icons)),
          spectral: stop.spectral.map((f) => fishOf(f, icons))
        }
      })
    }))
  }
}
