import { slug } from "mothwing/html"
import { closable } from "./dialog.js"

// More would only be scrolled past, and every row is DOM a phone has to keep
const SHOWN = 20
const KINDS = {
  fish: { label: "Fish", url: (name) => `/fishing/${slug(name)}/` },
  gathering: { label: "Gathering", url: (name) => `/gathering/${slug(name)}/` },
  sightseeing: { label: "Vista", url: (name) => `/sightseeing/${slug(name)}/` },
  weather: { label: "Weather", url: (name) => `/weather/${slug(name)}/` }
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

const modal = document.createElement("dialog")
modal.className = "modal search-modal"
modal.setAttribute("closedby", "any")
modal.setAttribute("aria-label", "Search")
modal.innerHTML = `
  <div class="search-field">
    <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
    <input class="search-input" id="search-input" type="search" placeholder="Search fish, items, vistas, zones..." autocomplete="off"
      spellcheck="false" role="combobox" aria-expanded="true" aria-controls="search-results" aria-label="Search">
    <button class="close-btn" aria-label="Close">&times;</button>
  </div>
  <ul class="search-results" id="search-results" role="listbox" aria-label="Results"></ul>
  <p class="search-note" aria-live="polite"></p>
`
document.body.append(modal)

const input = modal.querySelector(".search-input")
const list = modal.querySelector(".search-results")
const note = modal.querySelector(".search-note")
closable(modal, modal.querySelector(".close-btn"))

/** @type {Promise<Entry[]> | null} */
let loading = null
/** @type {Entry[]} */
let entries = []
/** @type {Entry[]} */
let shown = []
let active = 0

/** @returns {Promise<Entry[]>} The index, fetched once, from where the navbar's button says, see data/search.js */
export function load() {
  loading ??= fetch(document.querySelector(".search-button").dataset.index).then((r) => r.json()).then((index) => {
    const all = []
    for (const [key, { label, url }] of Object.entries(KINDS)) {
      for (const row of index[key]) {
        const [name, icon] = Array.isArray(row) ? row : [row]
        all.push({ name, url: url(name), kind: label, icon, ...searchable(name) })
      }
    }
    for (const [name, url, keywords] of index.pages) all.push({ name, url, kind: "Page", ...searchable(name, keywords) })
    return all
  }).catch((e) => {
    loading = null
    throw e
  })
  return loading
}

const startsWord = (key, i) => i === 0 || key[i - 1] === " "

/**
 * The word's letters in order through the key, like "grtwd" in "greatwood" or "dufi" in "duty finder", the first at
 * the start of one of its words. Tried jumping to word starts first, as that's how people shorten names, then without.
 * @param {string} word
 * @param {string} key
 * @param {boolean} [jump]
 * @returns {number} 0 when they aren't there, up to 3 a letter: letters starting words and next to each other count most
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
 * How well one of the query's words is in the entry: a whole word of its name, then the start of one, then anywhere
 * in it or its keywords, then its letters in order (see abbreviation), always below the rest.
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
 * Every word of the query has to be in it, in any order. The name being the query comes first, "The" left out like
 * people leave it out of "The Ruby Sea", then the query as whole words in it, so "la noscea" finds the zones before
 * La Noscean Leek.
 * @param {Entry} entry
 * @param {string} query Folded
 * @param {string[]} words The query's words
 * @returns {number} Higher is better, 0 when it doesn't match
 */
function score(entry, query, words) {
  let total = 0
  for (const word of words) {
    const points = wordScore(entry, word)
    if (!points) return 0
    total += points
  }
  const key = ` ${entry.key} `
  if (key === ` ${query} ` || key === ` the ${query} `) total += 500
  else if (key.startsWith(` ${query} `)) total += 200
  else if (key.includes(` ${query} `)) total += 150
  else if (entry.key.startsWith(query)) total += 100
  return total
}

/** @param {number} i */
function setActive(i) {
  active = (i + shown.length) % shown.length
  for (const [j, li] of [...list.children].entries()) li.setAttribute("aria-selected", j === active)
  const li = list.children[active]
  input.setAttribute("aria-activedescendant", li.id)
  li.scrollIntoView({ block: "nearest" })
}

function update() {
  const query = fold(input.value.trim())
  const words = query.split(" ").filter(Boolean)

  shown = query ? entries
    .map((entry) => ({ entry, rank: score(entry, query, words) }))
    .filter((e) => e.rank > 0)
    .sort((a, b) => b.rank - a.rank || a.entry.key.length - b.entry.key.length)
    .slice(0, SHOWN)
    .map((e) => e.entry) : []

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
  else note.textContent = shown.length ? "" : `Nothing called "${input.value.trim()}"`
}

input.addEventListener("input", update)
input.addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault()
    if (shown.length) setActive(active + (e.key === "ArrowDown" ? 1 : -1))
  } else if (e.key === "Enter" && shown.length) {
    e.preventDefault()
    list.children[active].querySelector("a").click()
  }
})

export async function openSearch() {
  if (modal.open) return
  modal.showModal()
  input.select()
  update()
  try {
    entries = await load()
  } catch {
    note.textContent = "Couldn't load the search, check your connection and try again"
    return
  }
  update()
}

// Ctrl+K, ⌘K on a Mac, or / like most sites with a search, unless it's typed into a field
document.addEventListener("keydown", (e) => {
  const typing = e.target.closest?.("input, textarea, select, [contenteditable]")
  if ((e.key.toLowerCase() === "k" && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !typing && !e.ctrlKey && !e.metaKey && !e.altKey)) {
    e.preventDefault()
    openSearch()
  }
})
