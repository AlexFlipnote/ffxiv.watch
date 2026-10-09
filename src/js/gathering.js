import "./utils/navbar.js"
import EXPANSIONS from "./data/gathering.json"
import { applyDayNight } from "./utils/daynight.js"
import { nextWindow } from "./utils/gathering.js"
import { chip, listing } from "./utils/listing.js"
import { everyTick } from "./utils/tick.js"

const jobSelect = document.getElementById("filter-job")
const typeSelect = document.getElementById("filter-type")

const ALL = ""
const TIMED = "Timed"
const TYPE_COLORS = { Legendary: "chip-gold", Ephemeral: "chip-accent" }

/**
 * @param {{ name: string, stars?: number, collectable?: boolean, perception?: number }} item
 * @returns {HTMLSpanElement}
 */
function itemEl(item) {
  const el = document.createElement("span")
  el.className = "gathering-item"
  el.append(Object.assign(document.createElement("strong"), { textContent: item.name }))
  if (item.stars) el.append(Object.assign(document.createElement("span"), { className: "gathering-stars", textContent: "★".repeat(item.stars) }))
  if (item.collectable) el.append(Object.assign(chip("C", "gathering-collectable"), { title: "Collectable" }))
  if (item.perception) el.title = `Needs ${item.perception} Perception`
  return el
}

const render = listing({
  key: "gathering-filters",
  expansions: EXPANSIONS,
  defaultExpansion: EXPANSIONS.at(-1).file,
  loadChunk: (file) => import(`./data/gathering/${file}.json`).then((m) => m.default),
  selects: { job: jobSelect, expansion: document.getElementById("filter-expansion"), type: typeSelect },
  search: document.getElementById("search"),
  body: document.getElementById("nodes"),
  empty: document.getElementById("nodes-empty"),
  noun: "nodes",

  cells: (node) => {
    const items = Object.assign(document.createElement("div"), { className: "gathering-items" })
    items.append(...node.items.map(itemEl))
    const tags = Object.assign(document.createElement("div"), { className: "tags" })
    tags.append(
      chip(node.type, TYPE_COLORS[node.type]),
      chip(`${node.job} Lv. ${node.level}`),
      ...(node.folklore ? [chip(node.folklore)] : []),
      ...(node.quest ? [Object.assign(chip(`Quest: ${node.quest}`), { title: "Unlocked by this quest" })] : [])
    )
    return [items, tags]
  },
  mapNote: (node) => node.items.map((i) => i.name).join(", "),

  matches: (node, query) => {
    if (jobSelect.value !== ALL && node.job !== jobSelect.value) return false
    if (typeSelect.value === TIMED ? !node.times : typeSelect.value !== ALL && node.type !== typeSelect.value) return false
    if (!query) return true
    return [node.zone, node.spot, node.folklore, node.quest, ...node.items.map((i) => i.name)]
      .some((text) => text?.toLowerCase().includes(query))
  },
  // Regular and Diadem nodes have no times, they're always up
  windowOf: (node, now) => node.times ? nextWindow(node, now) : { always: true }
})

everyTick((now) => {
  render(now)
  applyDayNight(now)
})
