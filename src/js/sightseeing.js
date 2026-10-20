import EXPANSIONS from "./data/sightseeing.json"
import { placeOf } from "./utils/alarmBells.js"
import { listing } from "./utils/listing.js"
import { alarmTiming, cachedWeatherWindows } from "./utils/windows.js"

listing({
  expansions: EXPANSIONS,
  loadChunk: (file) => import(`./data/sightseeing/${file}.json`).then((m) => m.default),
  idOf: (vista) => vista.number,
  selects: { expansion: document.getElementById("filter-expansion") },
  search: document.getElementById("search"),
  body: document.getElementById("vistas"),
  empty: document.getElementById("vistas-empty"),
  skeleton: document.getElementById("listing-skeleton"),
  noun: "vistas",
  done: "vistas",

  mapNote: (vista) => [
    `${vista.name}: use the `,
    Object.assign(document.createElement("strong"), { textContent: vista.emote }),
    " emote here"
  ],

  matches: (vista, query) => [
    `#${String(vista.number).padStart(3, "0")}`, vista.name, vista.zone, vista.spot, vista.emote, ...(vista.weather ?? []), vista.unlock?.quest
  ].some((text) => text?.toLowerCase().includes(query)),
  windowOf: cachedWeatherWindows(),
  // Its done check's id, as on its own page
  alarmOf: (vista, tr) => vista.times || vista.weather ? {
    id: `vista:${tr.querySelector(".done-check").dataset.doneId}`, name: vista.name, url: tr.querySelector("strong a").pathname,
    place: placeOf(vista), ...alarmTiming(vista)
  } : null
})
