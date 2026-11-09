import EXPANSIONS from "./data/crafting.json"
import { listing } from "./utils/listing.js"

const jobSelect = document.getElementById("filter-job")

listing({
  expansions: EXPANSIONS,
  loadChunk: (file) => import(`./data/crafting/${file}.json`).then((m) => m.default),
  idOf: (recipe) => recipe.id,
  selects: { job: jobSelect, expansion: document.getElementById("filter-expansion") },
  search: document.getElementById("search"),
  body: document.getElementById("recipes"),
  empty: document.getElementById("recipes-empty"),
  skeleton: document.getElementById("listing-skeleton"),
  noun: "recipes",

  filter: (recipe) => !jobSelect.value || recipe.jobs.includes(jobSelect.value),
  // From a word's start, so "aunt" isn't every Gauntlets
  matches: (recipe, query) => [recipe.name, ...recipe.jobs, ...recipe.books ?? [], recipe.expert && "Expert"]
    .some((text) => text && startsWord(text, query))
})

/**
 * @param {string} text
 * @param {string} query Lowercase
 * @returns {boolean} The query at the start of a word in it
 */
const startsWord = (text, query) => ` ${text.toLowerCase().replace(/[^a-z0-9' ]+/g, " ")}`.includes(` ${query}`)
