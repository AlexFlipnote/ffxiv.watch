import "./utils/navbar.js"
import EXPANSIONS from "./data/sightseeing.json"
import { applyDayNight } from "./utils/daynight.js"
import { chip, listing } from "./utils/listing.js"
import { cachedVistaWindows } from "./utils/sightseeing.js"
import { everyTick } from "./utils/tick.js"

/**
 * "Needs Sights of the First", with what that quest needs in turn on hover.
 * @param {{ quest: string, after: string[] }} unlock
 * @returns {HTMLSpanElement}
 */
function unlockChip(unlock) {
  const el = chip(`Needs ${unlock.quest}`, "chip-warning")
  el.title = `Unlocked by the quest ${unlock.quest}${unlock.after.length ? `, which needs ${unlock.after.join(" and ")} first` : ""}`
  return el
}

const render = listing({
  key: "sightseeing-filters",
  expansions: EXPANSIONS,
  // A Realm Reborn's are the only ones with times and weather
  defaultExpansion: EXPANSIONS[0].file,
  loadChunk: (file) => import(`./data/sightseeing/${file}.json`).then((m) => m.default),
  selects: { expansion: document.getElementById("filter-expansion") },
  search: document.getElementById("search"),
  body: document.getElementById("vistas"),
  empty: document.getElementById("vistas-empty"),
  noun: "vistas",

  cells: (vista) => {
    const name = Object.assign(document.createElement("div"), { className: "vista-name" })
    name.append(
      Object.assign(document.createElement("span"), { className: "vista-number", textContent: `#${String(vista.number).padStart(3, "0")}` }),
      Object.assign(document.createElement("strong"), { textContent: vista.name.replaceAll("*", "") })
    )
    const tags = Object.assign(document.createElement("div"), { className: "tags" })
    tags.append(
      chip(vista.emote),
      ...(vista.weather ?? []).map((w) => chip(w, "chip-accent")),
      ...(vista.level ? [chip(`Lv. ${vista.level}`)] : []),
      ...(vista.unlock ? [unlockChip(vista.unlock)] : [])
    )
    return [name, tags]
  },
  mapNote: (vista) => [
    `${vista.name.replaceAll("*", "")}: use the `,
    Object.assign(document.createElement("strong"), { textContent: vista.emote }),
    " emote here"
  ],

  matches: (vista, query) => !query || [vista.name, vista.zone, vista.spot, vista.emote, ...(vista.weather ?? []), vista.unlock?.quest]
    .some((text) => text?.toLowerCase().includes(query)),
  windowOf: cachedVistaWindows()
})

everyTick((now) => {
  render(now)
  applyDayNight(now)
})
