import EXPANSIONS from "./data/fishing.json"
import { placeOf } from "./utils/alarmBells.js"
import { listing } from "./utils/listing.js"
import { cachedWindows } from "./utils/forecast.js"
import { nextVoyageTo } from "./utils/voyages.js"
import { alarmTiming, cachedWeatherWindows } from "./utils/windows.js"

const methodSelect = document.getElementById("filter-method")
const typeSelect = document.getElementById("filter-type")

const ALL = ""
// The type filter's options, each a test on the fish. The first, "", leaves out the fish that bite any time, and the
// ocean fish but the blue ones, as nearly every voyage has the rest
const special = (fish) => !fish.anyTime && (!fish.ocean || fish.ocean.blue)
const TYPES = {
  big: (fish) => fish.big,
  timed: (fish) => fish.times || fish.weather || fish.previousWeather,
  intuition: (fish) => fish.predators,
  ocean: (fish) => fish.ocean,
  anytime: (fish) => fish.anyTime,
  all: () => true
}

const weatherWindows = cachedWeatherWindows()
// An ocean fish's windows are the voyages to its stop, boarding
const voyageWindows = cachedWindows((fish, now) => nextVoyageTo(fish.ocean, now))

listing({
  expansions: EXPANSIONS,
  loadChunk: (file) => import(`./data/fishing/${file}.json`).then((m) => m.default),
  idOf: (fish) => fish.id,
  selects: { method: methodSelect, expansion: document.getElementById("filter-expansion"), type: typeSelect },
  search: document.getElementById("search"),
  body: document.getElementById("fish"),
  empty: document.getElementById("fish-empty"),
  skeleton: document.getElementById("listing-skeleton"),
  noun: "fish",
  done: "fish",

  mapNote: (fish) => fish.name,

  filter: (fish) => (methodSelect.value === ALL || fish.method === methodSelect.value)
    && (typeSelect.value === ALL ? special(fish) : TYPES[typeSelect.value]?.(fish)),
  matches: (fish, query) => [
    fish.name, fish.zone, fish.spot, fish.folklore, fish.method, fish.big && "Big fish", fish.scrip,
    fish.ocean && "Ocean fishing", fish.ocean?.stop, fish.ocean?.blue && "Blue fish",
    ...(fish.weather ?? []), ...(fish.previousWeather ?? []),
    ...(fish.bait ?? []).flat().map((b) => b.name), ...(fish.predators ?? []).map((p) => p.name)
  ].some((text) => text?.toLowerCase().includes(query)),
  windowOf: (fish, now) => fish.ocean ? voyageWindows(fish, now) : weatherWindows(fish, now),
  alarmOf: (fish, tr) => TYPES.timed(fish) || fish.ocean ? {
    id: `fish:${fish.id}`, name: fish.name, url: tr.querySelector(".gathering-item").pathname, place: placeOf(fish),
    ...fish.ocean ? { ocean: { stop: fish.ocean.stop, time: fish.ocean.time } } : alarmTiming(fish)
  } : null
})
