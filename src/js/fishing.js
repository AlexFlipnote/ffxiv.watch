import EXPANSIONS from "./data/fishing.json"
import { listing } from "./utils/listing.js"
import { cachedWeatherWindows } from "./utils/windows.js"

const methodSelect = document.getElementById("filter-method")
const typeSelect = document.getElementById("filter-type")

const ALL = ""
// The type filter's options, each a test on the fish. The first, "", leaves out the fish that bite any time
const TYPES = {
  big: (fish) => fish.big,
  timed: (fish) => fish.times || fish.weather || fish.previousWeather,
  intuition: (fish) => fish.predators,
  anytime: (fish) => fish.anyTime,
  all: () => true
}

listing({
  expansions: EXPANSIONS,
  loadChunk: (file) => import(`./data/fishing/${file}.json`).then((m) => m.default),
  idOf: (fish) => fish.id,
  selects: { method: methodSelect, expansion: document.getElementById("filter-expansion"), type: typeSelect },
  search: document.getElementById("search"),
  hideDone: document.getElementById("hide-done"),
  body: document.getElementById("fish"),
  empty: document.getElementById("fish-empty"),
  skeleton: document.getElementById("listing-skeleton"),
  noun: "fish",
  done: "fish",

  mapNote: (fish) => fish.name,

  filter: (fish) => (methodSelect.value === ALL || fish.method === methodSelect.value)
    && (typeSelect.value === ALL ? !fish.anyTime : TYPES[typeSelect.value]?.(fish)),
  matches: (fish, query) => [
    fish.name, fish.zone, fish.spot, fish.folklore, fish.method, fish.big && "Big fish",
    ...(fish.weather ?? []), ...(fish.previousWeather ?? []),
    ...(fish.bait ?? []).flat().map((b) => b.name), ...(fish.predators ?? []).map((p) => p.name)
  ].some((text) => text?.toLowerCase().includes(query)),
  windowOf: cachedWeatherWindows()
})
