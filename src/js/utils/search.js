import { slug } from "mothwing/html"
import { closable } from "./dialog.js"
import { load, store } from "./storage.js"

// Every row is DOM a phone has to keep
const SHOWN = 20
// The URLs of the results last opened, shown before anything's typed
const RECENT_KEY = "search-recent"
const RECENT_SHOWN = 5
const KINDS = {
  fish: { label: "Fish", url: (name) => `/fishing/${slug(name)}/` },
  gathering: { label: "Gathering", url: (name) => `/gathering/${slug(name)}/` },
  sightseeing: { label: "Vista", url: (name) => `/sightseeing/${slug(name)}/` },
  weather: { label: "Weather", url: (name) => `/weather/${slug(name)}/` }
}
// A word naming a kind, "fish ruby" or "weather kugane", puts that kind first
const KIND_WORDS = {
  fish: "Fish", item: "Gathering", items: "Gathering", gathering: "Gathering", node: "Gathering",
  vista: "Vista", vistas: "Vista", sightseeing: "Vista", weather: "Weather", zone: "Weather", page: "Page"
}

/**
 * @typedef {object} Entry
 * @property {string} name
 * @property {string} url
 * @property {string} kind Shown next to the name
 * @property {number} [icon] Item.Icon, for the fish and items
 * @property {string} key Its name folded, see fold
 * @property {string[]} words The key's words
 * @property {string} text The key and its keywords, which a query's words can also be found in
 */

/**
 * @param {string} text
 * @returns {string} "Rak'tika Greatwood" -> "raktika greatwood", so a query can leave out what's hard to type
 */
const fold = (text) => text.normalize("NFD").replace(/[̀-ͯ'’]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()

/**
 * @param {string} name
 * @param {string} [keywords]
 * @returns {Pick<Entry, "key" | "words" | "text">}
 */
function searchable(name, keywords = "") {
  const key = fold(name)
  return { key, words: key.split(" "), text: `${key} ${fold(keywords)}` }
}

/**
 * @param {object} index search.json, see src/data/search.js
 * @returns {Entry[]}
 */
export function entriesOf(index) {
  const all = []
  for (const [key, { label, url }] of Object.entries(KINDS)) {
    for (const row of index[key]) {
      const [name, icon] = Array.isArray(row) ? row : [row]
      all.push({ name, url: url(name), kind: label, icon, ...searchable(name) })
    }
  }
  for (const [name, url, keywords] of index.pages) all.push({ name, url, kind: "Page", ...searchable(name, keywords) })
  return all
}

const startsWord = (key, i) => i === 0 || key[i - 1] === " "

/**
 * The word's letters in order through the key, like "grtwd" in "greatwood", the first starting a word.
 * @param {string} word
 * @param {string} key
 * @param {boolean} [jump]
 * @returns {number} 0 when they aren't there, up to 3 a letter, most for word starts and letters in a row
 */
function abbreviation(word, key, jump = true) {
  let pos = -1
  let points = 0
  for (let i = 0; i < word.length; i++) {
    let at = key.indexOf(word[i], pos + 1)
    if (at < 0) return jump ? abbreviation(word, key, false) : 0
    if (i === 0 || (jump && at !== pos + 1)) {
      let start = at
      while (start >= 0 && !startsWord(key, start)) start = key.indexOf(word[i], start + 1)
      if (start >= 0) at = start
      else if (i === 0) return 0
    }
    points += startsWord(key, at) ? 3 : at === pos + 1 ? 2 : 1
    pos = at
  }
  return points
}

/**
 * How well one of the query's words is in the entry, an abbreviation always last.
 * @param {Entry} entry
 * @param {string} word
 * @returns {number} 0 when it isn't
 */
function wordScore(entry, word) {
  if (entry.words.includes(word)) return 100
  if (entry.words.some((w) => w.startsWith(word))) return 80
  if (entry.key.includes(word)) return 50
  if (entry.text.includes(word)) return 40
  // A letter is in nearly every name
  if (word.length < 2) return 0
  const points = abbreviation(word, entry.key)
  return points && 10 + points / word.length * 9
}

/**
 * Every word of the query has to be in it. The exact name comes first, a leading "The" optional, then whole words.
 * @param {Entry} entry
 * @param {string} query Folded
 * @param {string[]} words The query's words
 * @returns {number} Higher is better, 0 when it doesn't match
 */
function score(entry, query, words) {
  let total = 0
  for (const word of words) {
    // Alone it's still a search for the word, not every fish
    const points = words.length > 1 && KIND_WORDS[word] === entry.kind ? 110 : wordScore(entry, word)
    if (!points) return 0
    total += points
  }
  const key = ` ${entry.key} `
  if (key === ` ${query} ` || key === ` the ${query} `) total += 500
  else if (key.startsWith(` ${query} `)) total += 200
  else if (key.includes(` ${query} `)) total += 150
  else if (entry.key.startsWith(query)) total += 100
  // "fish" means Fishing before Hook Fish
  if (entry.kind === "Page") total += 100
  return total
}

/**
 * @param {Entry[]} entries
 * @param {string} text What's typed
 * @returns {Entry[]} The best matches, best first, none for an empty query
 */
export function rank(entries, text) {
  const query = fold(text)
  const words = query.split(" ").filter(Boolean)
  if (!query) return []
  return entries
    .map((entry) => ({ entry, rank: score(entry, query, words) }))
    .filter((e) => e.rank > 0)
    .sort((a, b) => b.rank - a.rank || a.entry.key.length - b.entry.key.length)
    .slice(0, SHOWN)
    .map((e) => e.entry)
}

/** @type {Promise<Entry[]> | null} */
let loading = null
/** @type {Entry[]} */
let entries = []
/** @type {Map<string, Entry>} */
let byUrl = new Map()
/** @type {Entry[]} */
let shown = []
let active = 0
let modal, input, list, note, label

/** @returns {Promise<Entry[]>} The index, fetched once from the URL on the navbar's button */
export function loadIndex() {
  loading ??= fetch(document.querySelector(".search-button").dataset.index).then((r) => r.json()).then(entriesOf).catch((e) => {
    loading = null
    throw e
  })
  return loading
}

/** @param {number} i */
function setActive(i) {
  active = (i + shown.length) % shown.length
  for (const [j, li] of [...list.children].entries()) li.setAttribute("aria-selected", j === active)
  const li = list.children[active]
  input.setAttribute("aria-activedescendant", li.id)
  li.scrollIntoView({ block: "nearest" })
}

/** @returns {string[]} The recent results' URLs, newest first */
function recentUrls() {
  try {
    const urls = JSON.parse(load(RECENT_KEY))
    return Array.isArray(urls) ? urls : []
  } catch {
    return []
  }
}

/** @param {string} url */
function remember(url) {
  store(RECENT_KEY, JSON.stringify([url, ...recentUrls().filter((u) => u !== url)].slice(0, RECENT_SHOWN)))
}

function update() {
  const typed = input.value.trim()
  const query = fold(typed)
  // A page renamed since isn't in the index
  shown = query ? rank(entries, typed) : recentUrls().map((url) => byUrl.get(url)).filter(Boolean)
  label.hidden = !!query || !shown.length
  list.setAttribute("aria-label", query ? "Results" : "Recent")

  list.replaceChildren(...shown.map((entry, i) => {
    const li = document.createElement("li")
    li.id = `search-result-${i}`
    li.setAttribute("role", "option")
    li.innerHTML = `
      <a class="search-result" tabindex="-1">
        <span class="search-icon"></span><span class="search-name"></span><span class="search-kind"></span>
      </a>
    `
    const a = li.querySelector("a")
    a.href = entry.url
    a.querySelector(".search-name").textContent = entry.name
    a.querySelector(".search-kind").textContent = entry.kind
    if (entry.icon) a.querySelector(".search-icon").innerHTML = `<img src="/images/game/${entry.icon}.webp" alt="" width="32" height="32">`
    else a.querySelector(".search-icon").dataset.kind = entry.kind.toLowerCase()
    a.addEventListener("pointermove", () => active !== i && setActive(i))
    return li
  }))

  input.removeAttribute("aria-activedescendant")
  if (shown.length) setActive(0)
  if (!entries.length) note.textContent = "Loading..."
  else if (!query) note.textContent = `${entries.length.toLocaleString("en-US")} fish, items, vistas, zones and pages`
  else note.textContent = shown.length ? "" : `Nothing called "${typed}"`
}

/** The dialog, made the first time it opens */
function build() {
  modal = document.createElement("dialog")
  modal.className = "modal modal-top search-modal"
  modal.setAttribute("closedby", "any")
  modal.setAttribute("aria-label", "Search")
  modal.innerHTML = `
    <div class="search-field">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
      <input class="search-input" id="search-input" type="search" placeholder="Search fish, items, vistas, zones..." autocomplete="off"
        spellcheck="false" role="combobox" aria-expanded="true" aria-controls="search-results" aria-label="Search">
      <button class="close-btn" aria-label="Close">&times;</button>
    </div>
    <p class="search-label" id="search-label" hidden>Recent</p>
    <ul class="search-results" id="search-results" role="listbox" aria-label="Results"></ul>
    <p class="search-note" aria-live="polite"></p>
  `
  document.body.append(modal)

  input = modal.querySelector(".search-input")
  list = modal.querySelector(".search-results")
  note = modal.querySelector(".search-note")
  label = modal.querySelector(".search-label")
  closable(modal, modal.querySelector(".close-btn"))

  input.addEventListener("input", update)
  // Enter clicks the result too, so this catches both
  list.addEventListener("click", (e) => {
    const a = e.target.closest("a")
    if (a) remember(a.getAttribute("href"))
  })
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault()
      if (shown.length) setActive(active + (e.key === "ArrowDown" ? 1 : -1))
    } else if (e.key === "Enter" && shown.length) {
      e.preventDefault()
      list.children[active].querySelector("a").click()
    }
  })
}

export async function openSearch() {
  if (!modal) build()
  if (modal.open) return
  modal.showModal()
  input.select()
  update()
  try {
    entries = await loadIndex()
    byUrl = new Map(entries.map((entry) => [entry.url, entry]))
  } catch {
    note.textContent = "Couldn't load the search, check your connection and try again"
    return
  }
  update()
}

// Ctrl+K, ⌘K, or / outside a field
document.addEventListener("keydown", (e) => {
  const typing = e.target.closest?.("input, textarea, select, [contenteditable]")
  if ((e.key.toLowerCase() === "k" && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !typing && !e.ctrlKey && !e.metaKey && !e.altKey)) {
    e.preventDefault()
    openSearch()
  }
})
