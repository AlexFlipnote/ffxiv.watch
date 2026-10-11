import EXPANSIONS from "./data/sightseeing.json"
import { listing } from "./utils/listing.js"
import { cachedWeatherWindows } from "./utils/windows.js"

listing({
  expansions: EXPANSIONS,
  loadChunk: (file) => import(`./data/sightseeing/${file}.json`).then((m) => m.default),
  idOf: (vista) => vista.number,
  selects: { expansion: document.getElementById("filter-expansion") },
  search: document.getElementById("search"),
  hideDone: document.getElementById("hide-done"),
  body: document.getElementById("vistas"),
  empty: document.getElementById("vistas-empty"),
  skeleton: document.getElementById("listing-skeleton"),
  noun: "vistas",
  done: "vistas",

  mapNote: (vista) => [
    `${vista.name.replaceAll("*", "")}: use the `,
    Object.assign(document.createElement("strong"), { textContent: vista.emote }),
    " emote here"
  ],

  matches: (vista, query) => [
    `#${String(vista.number).padStart(3, "0")}`, vista.name, vista.zone, vista.spot, vista.emote, ...(vista.weather ?? []), vista.unlock?.quest
  ].some((text) => text?.toLowerCase().includes(query)),
  windowOf: cachedWeatherWindows()
})
