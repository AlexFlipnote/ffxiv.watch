import EXPANSIONS from "./data/crafting.json"
import { addDialog } from "./utils/list-add.js"
import { listing } from "./utils/listing.js"

const jobSelect = document.getElementById("filter-job")
const body = document.getElementById("recipes")

listing({
  expansions: EXPANSIONS,
  loadChunk: (file) => import(`./data/crafting/${file}.json`).then((m) => m.default),
  idOf: (recipe) => recipe.id,
  selects: { job: jobSelect, expansion: document.getElementById("filter-expansion") },
  search: document.getElementById("search"),
  body,
  empty: document.getElementById("recipes-empty"),
  skeleton: document.getElementById("listing-skeleton"),
  noun: "recipes",

  filter: (recipe) => !jobSelect.value || recipe.jobs.includes(jobSelect.value),
  // From a word's start, so "aunt" isn't every Gauntlets
  matches: (recipe, query) => [recipe.name, ...recipe.jobs, ...recipe.books ?? [], recipe.expert && "Expert"]
    .some((text) => text && startsWord(text, query))
})

// Each row's add to list button, a dialog per item it adds
const dialogs = new Map()
body.addEventListener("click", (e) => {
  const button = /** @type {HTMLElement} */ (e.target).closest(".row-list-add")
  if (!button) return
  const item = Number(button.dataset.item)
  if (!dialogs.has(item)) {
    const link = button.closest("tr").querySelector(".crafting-name")
    const slug = new URL(link.href).pathname.split("/")[2]
    dialogs.set(item, addDialog({ slug, name: link.querySelector("strong").textContent, icon: Number(button.dataset.icon), item }, new Set()))
  }
  dialogs.get(item)()
})

/**
 * @param {string} text
 * @param {string} query Lowercase
 * @returns {boolean} The query at the start of a word in it
 */
const startsWord = (text, query) => ` ${text.toLowerCase().replace(/[^a-z0-9' ]+/g, " ")}`.includes(` ${query}`)
