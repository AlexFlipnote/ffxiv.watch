import { openMap } from "./mapModal.js"
import { formatCountdown, setTime } from "./timers.js"
import { setText } from "./tick.js"

/**
 * When an entry is up, in Earth ms. `{ always: true }` for no time limit, null when nothing is coming.
 * @typedef {{ start: number, end: number, open: boolean } | { always: true } | null} Window
 */

/**
 * @typedef {object} ListingOptions
 * @property {string} key localStorage key for the filters
 * @property {{ name: string, file: string }[]} expansions From the data's index file
 * @property {string} defaultExpansion `file` to pick on a first visit
 * @property {(file: string) => Promise<object[]>} loadChunk Loads one expansion's entries
 * @property {Record<string, HTMLSelectElement>} selects Filter dropdowns by name, `expansion` gets filled here
 * @property {HTMLInputElement} search
 * @property {HTMLElement} body The table's tbody
 * @property {HTMLElement} empty Shown when nothing matches
 * @property {(entry: object) => Node[]} cells The first column's content
 * @property {(entry: object) => string | (string | Node)[]} [mapNote] Shown under the coordinates in the map dialog
 * @property {(entry: object, query: string) => boolean} matches `query` is lowercase, "" for none
 * @property {(entry: object, now: number) => Window} windowOf Called every frame, so keep it cheap
 * @property {string} noun "nodes", "vistas"
 */

const ALL = ""
const STATE_ORDER = { open: 0, later: 1, always: 2, none: 3 }

/**
 * @param {string} value
 * @param {string} [text]
 * @returns {HTMLOptionElement}
 */
export function option(value, text = value) {
  const el = document.createElement("option")
  el.value = value
  el.textContent = text
  return el
}

/**
 * @param {string} text
 * @param {string} [className] Extra class, like "chip-gold"
 * @returns {HTMLSpanElement}
 */
export function chip(text, className = "") {
  const el = document.createElement("span")
  el.className = `chip ${className}`.trim()
  el.textContent = text
  return el
}

/**
 * @param {string} key
 * @returns {object} The saved value, {} when there's none or storage is blocked
 */
function loadSaved(key) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? {}
  } catch {
    return {}
  }
}

/**
 * @param {string} key
 * @param {object} value
 */
function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage blocked, just not saved
  }
}

/**
 * The location column: zone and spot, the whole cell opens the map.
 * @param {{ zone: string, spot?: string, map?: import("./mapModal.js").MapSpot }} entry
 * @param {string | (string | Node)[]} [note] Shown under the coordinates
 * @returns {HTMLTableCellElement}
 */
function locationCell(entry, note) {
  const td = document.createElement("td")
  td.className = "location-cell"
  td.innerHTML = `
    <button class="location" title="Show on map">
      <span class="map-icon" aria-hidden="true"></span>
      <span class="place"><span class="zone"></span><span class="spot"></span></span>
    </button>
  `
  td.querySelector(".zone").textContent = entry.zone
  td.querySelector(".spot").textContent = entry.spot ?? ""

  const button = td.querySelector("button")
  if (entry.map) button.addEventListener("click", () => openMap({ ...entry, note }))
  else button.disabled = true
  return td
}

/**
 * Zone and spot on one line, for the first column on phones, where the location column is only the map icon.
 * @param {{ zone: string, spot?: string }} entry
 * @returns {HTMLDivElement}
 */
function placeLine(entry) {
  const el = document.createElement("div")
  el.className = "place-line"
  el.append(Object.assign(document.createElement("span"), { className: "zone", textContent: entry.zone }))
  if (entry.spot) el.append(Object.assign(document.createElement("span"), { className: "spot", textContent: entry.spot }))
  return el
}

/**
 * @param {Window} w
 * @returns {"open" | "always" | "later" | "none"}
 */
function stateOf(w) {
  if (!w) return "none"
  if (w.always) return "always"
  return w.open ? "open" : "later"
}

/**
 * Sort order: up now (closing soonest first), up later (soonest first), always up, nothing coming.
 * @param {Window} a
 * @param {Window} b
 * @returns {number}
 */
function compareWindows(a, b) {
  const sa = stateOf(a)
  const sb = stateOf(b)
  if (sa !== sb) return STATE_ORDER[sa] - STATE_ORDER[sb]
  if (sa === "open") return a.end - b.end
  if (sa === "later") return a.start - b.start || a.end - b.end
  return 0
}

/**
 * Entries with the same key share a group: up now and closing together, or up next at the same times.
 * @param {Window} w
 * @returns {string}
 */
function groupKey(w) {
  const state = stateOf(w)
  if (state === "open") return `open|${w.end}`
  if (state === "later") return `later|${w.start}|${w.end}`
  return state
}

/**
 * A group's header row (the tab with the countdown) and the gap row above it.
 * @param {string} state From stateOf
 * @returns {{ header: HTMLTableRowElement, gap: HTMLTableRowElement, countdown: HTMLElement, from: HTMLTimeElement, to: HTMLTimeElement }}
 */
function groupRows(state) {
  const header = document.createElement("tr")
  header.className = `group-header group-${state}`
  header.innerHTML = `
    <td colspan="2">
      <span class="group-tab">
        <strong class="group-countdown"></strong>
        <span class="group-when"><span class="group-until">Up until </span><time></time><span class="group-dash"> - </span><time></time></span>
      </span>
    </td>
  `
  const gap = document.createElement("tr")
  gap.className = "group-gap"
  gap.innerHTML = "<td colspan=\"2\"></td>"

  const [from, to] = header.querySelectorAll("time")
  return { header, gap, countdown: header.querySelector(".group-countdown"), from, to }
}

/**
 * Wires up a table page: remembered filters, one expansion's data at a time, and rows sorted and grouped by when
 * they're up.
 * @param {ListingOptions} options
 * @returns {(now: number) => void} Redraws the table, call it every frame
 */
export function listing({ key, expansions, defaultExpansion, loadChunk, selects, search, body, empty, cells, mapNote, matches, windowOf, noun }) {
  const rows = new Map()
  let groups = new Map()
  const loaded = new Map()
  let shown = []
  let onPage = []
  // Bumped by every filter change, so a slow chunk load can't overwrite a newer pick
  let generation = 0
  // The groups on the page, until the first moment one of them opens or closes
  let layout = null

  selects.expansion.append(option(ALL, "All"), ...expansions.map((e) => option(e.file, e.name)))
  const saved = { expansion: defaultExpansion, ...loadSaved(key) }
  for (const [name, select] of Object.entries(selects)) {
    if ([...select.options].some((o) => o.value === saved[name])) select.value = saved[name]
  }

  const loadExpansion = (file) => {
    if (!loaded.has(file)) loaded.set(file, loadChunk(file))
    return loaded.get(file)
  }

  function rowOf(entry) {
    if (!rows.has(entry)) {
      const tr = document.createElement("tr")
      tr.className = "group-row"
      const first = document.createElement("td")
      first.append(...cells(entry), placeLine(entry))
      tr.append(first, locationCell(entry, mapNote?.(entry)))
      rows.set(entry, { tr })
    }
    return rows.get(entry)
  }

  async function applyFilters() {
    save(key, Object.fromEntries(Object.entries(selects).map(([name, select]) => [name, select.value])))
    const query = search.value.trim().toLowerCase()

    const current = ++generation
    if (!shown.length) empty.textContent = `Loading ${noun}...`
    const files = selects.expansion.value === ALL ? expansions.map((e) => e.file) : [selects.expansion.value]
    const entries = (await Promise.all(files.map(loadExpansion))).flat()
    if (current !== generation) return

    shown = entries.filter((entry) => matches(entry, query))
    layout = null
    render(Date.now())
  }

  /**
   * Sorts the entries into groups and puts their rows on the page.
   * @param {number} now
   * @returns {{ runs: { key: string, w: Window, state: string, group: object }[], until: number }} `until` is when the
   * first group opens or closes, the layout holds until then
   */
  function buildLayout(now) {
    const windows = new Map(shown.map((entry) => [entry, windowOf(entry, now)]))
    const sorted = [...shown].sort((a, b) => compareWindows(windows.get(a), windows.get(b)))

    const runs = []
    for (const entry of sorted) {
      const w = windows.get(entry)
      const key = groupKey(w)
      if (runs.at(-1)?.key !== key) runs.push({ key, w, state: stateOf(w), entries: [] })
      runs.at(-1).entries.push(entry)
    }

    const trs = []
    const used = new Map()
    let until = Infinity
    for (const [i, run] of runs.entries()) {
      run.group = groups.get(run.key) ?? groupRows(run.state)
      used.set(run.key, run.group)
      if (run.state === "open") until = Math.min(until, run.w.end)
      if (run.state === "later") until = Math.min(until, run.w.start)

      if (i > 0) trs.push(run.group.gap)
      trs.push(run.group.header)
      for (const [j, entry] of run.entries.entries()) {
        const row = rowOf(entry)
        const rowClass = `group-row group-${run.state}${j === run.entries.length - 1 ? " group-last" : ""}`
        if (row.tr.className !== rowClass) row.tr.className = rowClass
        trs.push(row.tr)
      }
    }
    groups = used

    if (trs.length !== onPage.length || trs.some((tr, i) => tr !== onPage[i])) {
      onPage = trs
      body.replaceChildren(...trs)
    }

    setText(empty, `No ${noun} match.`)
    if (empty.hidden !== shown.length > 0) empty.hidden = shown.length > 0
    // Nothing coming up rechecks once a minute
    return { runs, until: Math.min(until, now + 60 * 1000) }
  }

  // Every frame only the countdowns change, the groups are rebuilt when one opens or closes
  function render(now) {
    if (!layout || now >= layout.until) layout = buildLayout(now)

    const date = new Date(now)
    for (const { state, w, group } of layout.runs) {
      if (state === "open" || state === "later") {
        setText(group.countdown, formatCountdown((w.open ? w.end : w.start) - now))
        setTime(group.from, new Date(w.start), date)
        setTime(group.to, new Date(w.end), date, { zone: true })
      } else {
        setText(group.countdown, state === "always" ? "Any time" : "Nothing in the next 30 days")
      }
    }
  }

  for (const select of Object.values(selects)) select.addEventListener("change", applyFilters)
  search.addEventListener("input", applyFilters)
  applyFilters()

  return render
}
