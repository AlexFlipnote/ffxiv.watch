import EXPANSIONS from "./data/gathering.json"
import { placeOf } from "./utils/alarmBells.js"
import { nextWindow } from "./utils/eorzea.js"
import { listing } from "./utils/listing.js"

const jobSelect = document.getElementById("filter-job")
const typeSelect = document.getElementById("filter-type")

const ALL = ""
const TIMED = "Timed"
// Nodes with an item that shows only once it's revealed, the rest of their items aren't
const HIDDEN = "Hidden"

listing({
  expansions: EXPANSIONS,
  loadChunk: (file) => import(`./data/gathering/${file}.json`).then((m) => m.default),
  idOf: (node) => node.id,
  selects: { job: jobSelect, expansion: document.getElementById("filter-expansion"), type: typeSelect },
  search: document.getElementById("search"),
  body: document.getElementById("nodes"),
  empty: document.getElementById("nodes-empty"),
  skeleton: document.getElementById("listing-skeleton"),
  noun: "nodes",
  done: "gathering",

  mapNote: (node) => node.items.map((i) => i.name).join(", "),

  filter: (node) => (jobSelect.value === ALL || node.job === jobSelect.value)
    && (typeSelect.value === TIMED ? !!node.times
      : typeSelect.value === HIDDEN ? node.items.some((i) => i.hidden)
        : typeSelect.value === ALL || node.type === typeSelect.value),
  matches: (node, query) => [
    node.zone, node.spot, node.type, node.job, node.folklore, node.quest, ...node.items.flatMap((i) => [i.name, i.scrip, i.hidden && HIDDEN])
  ]
    .some((text) => text?.toLowerCase().includes(query)),
  // Regular and Diadem nodes have no times, they're always up
  windowOf: (node, now) => node.times ? nextWindow(node, now) : { always: true },
  // The crystals have no page
  alarmOf: (node, tr) => {
    if (!node.times) return null
    const link = tr.querySelector("a.gathering-item")
    const named = node.items.filter((i) => i.id >= 20)
    return {
      id: `node:${node.id}`, name: named.length > 1 ? `${named[0].name} +${named.length - 1}` : named[0]?.name ?? node.spot,
      url: link?.pathname ?? "/gathering/", place: placeOf(node), times: node.times
    }
  }
})
