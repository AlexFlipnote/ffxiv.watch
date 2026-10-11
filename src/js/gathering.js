import EXPANSIONS from "./data/gathering.json"
import { nextWindow } from "./utils/eorzea.js"
import { listing } from "./utils/listing.js"

const jobSelect = document.getElementById("filter-job")
const typeSelect = document.getElementById("filter-type")

const ALL = ""
const TIMED = "Timed"

listing({
  expansions: EXPANSIONS,
  loadChunk: (file) => import(`./data/gathering/${file}.json`).then((m) => m.default),
  idOf: (node) => node.id,
  selects: { job: jobSelect, expansion: document.getElementById("filter-expansion"), type: typeSelect },
  search: document.getElementById("search"),
  hideDone: document.getElementById("hide-done"),
  body: document.getElementById("nodes"),
  empty: document.getElementById("nodes-empty"),
  skeleton: document.getElementById("listing-skeleton"),
  noun: "nodes",
  done: "gathering",

  mapNote: (node) => node.items.map((i) => i.name).join(", "),

  filter: (node) => (jobSelect.value === ALL || node.job === jobSelect.value)
    && (typeSelect.value === TIMED ? !!node.times : typeSelect.value === ALL || node.type === typeSelect.value),
  matches: (node, query) => [node.zone, node.spot, node.type, node.job, node.folklore, node.quest, ...node.items.map((i) => i.name)]
    .some((text) => text?.toLowerCase().includes(query)),
  // Regular and Diadem nodes have no times, they're always up
  windowOf: (node, now) => node.times ? nextWindow(node, now) : { always: true }
})
