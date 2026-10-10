import { CELEBRATE_MS } from "./done.js"
import { openMap } from "./mapModal.js"
import { formatCountdown, setTime } from "./time.js"
import { setText } from "./tick.js"

/**
 * When an entry is up, in Earth ms. `{ always: true }` for no time limit, null when nothing is coming.
 * @typedef {{ start: number, end: number, open: boolean } | { always: true } | null} Window
 */

/**
 * @typedef {object} ListingOptions
 * @property {{ name: string, file: string }[]} expansions From the data's index file
 * @property {(file: string) => Promise<object[]>} loadChunk Loads one expansion's entries
 * @property {(entry: object) => number} idOf The same as the page's rows were keyed with, see listRows in src/render/html.js
 * @property {Record<string, HTMLSelectElement>} selects Filter dropdowns by name, also their names in the URL
 * @property {HTMLInputElement} search
 * @property {HTMLInputElement} [hideDone] Leaves out the rows marked done, see js/utils/done.js
 * @property {HTMLElement} body The table's tbody, with a row for every entry from the build
 * @property {HTMLElement} empty Shown when nothing matches
 * @property {HTMLElement} skeleton Shown in place of the table until the first data is in
 * @property {(entry: object) => string | (string | Node)[]} [mapNote] Shown under the coordinates in the map dialog
 * @property {(entry: object) => boolean} [filter] The page's own dropdowns, skipped while searching
 * @property {(entry: object, query: string) => boolean} matches The search, `query` is lowercase and never ""
 * @property {(entry: object, now: number) => Window} windowOf Called every tick, so keep it cheap
 * @property {string} noun "nodes", "vistas"
 */

const ALL = ""
// An option with no value, "Any" or "All", in the URL
const ANY = "any"
const STATE_ORDER = { open: 0, later: 1, always: 2, none: 3 }
// Laying out a row is what's slow, a search for "a" matches nearly every fish. The soonest are the ones that matter
const MAX_ROWS = 100

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
 * Wires up a table page: remembered filters, the search in the URL, one expansion's data at a time, and rows sorted
 * and grouped by when they're up. The rows come with the page, each marked with the entry it's for.
 * @param {ListingOptions} options
 * @returns {(now: number) => void} Redraws the table, call it every tick
 */
export function listing({ expansions, loadChunk, idOf, selects, search, hideDone, body, empty, skeleton, mapNote, filter, matches, windowOf, noun }) {
  // "dawntrail:974" -> its row, until the entry it's for has loaded
  const unclaimed = new Map([...body.querySelectorAll("tr[data-key]")].map((tr) => [tr.dataset.key, tr]))
  const keys = new Map()
  const rows = new Map()
  let groups = new Map()
  const loaded = new Map()
  let shown = []
  let onPage = []
  // Bumped by every filter change, so a slow chunk load can't overwrite a newer pick
  let generation = 0
  // The groups on the page, until the first moment one of them opens or closes
  let layout = null
  // Nothing is drawn until the first data is in, the rows from the build stay hidden until then (see _listing.scss)
  let ready = false

  // The filters are only in the URL, so a link shares them and a fresh visit starts from what the page picks
  const defaults = Object.fromEntries(Object.entries(selects).map(([name, select]) => [name, select.value]))
  const params = new URLSearchParams(location.search)
  for (const [name, select] of Object.entries(selects)) {
    const value = params.get(name) === ANY ? ALL : params.get(name)
    if ([...select.options].some((o) => o.value === value)) select.value = value
  }
  search.value = params.get("q") ?? ""
  if (hideDone) hideDone.checked = params.get("hide") === "completed"

  const loadExpansion = (file) => {
    if (!loaded.has(file)) {
      loaded.set(file, loadChunk(file).then((entries) => {
        entries.forEach((entry) => keys.set(entry, `${file}:${idOf(entry)}`))
        return entries
      }))
    }
    return loaded.get(file)
  }

  /**
   * @param {object} entry
   * @returns {{ tr: HTMLTableRowElement } | null} null when the page has no row for it
   */
  function rowOf(entry) {
    if (!rows.has(entry)) {
      const tr = unclaimed.get(keys.get(entry))
      if (!tr) return null
      unclaimed.delete(keys.get(entry))
      if (entry.map) {
        tr.querySelector(".location").addEventListener("click", (e) => {
          e.preventDefault()
          openMap({ ...entry, note: mapNote?.(entry) })
        })
      }
      rows.set(entry, { tr })
    }
    return rows.get(entry)
  }

  function saveUrl() {
    const url = new URL(location.href)
    for (const [name, select] of Object.entries(selects)) {
      if (select.value === defaults[name]) url.searchParams.delete(name)
      else url.searchParams.set(name, select.value || ANY)
    }
    if (hideDone?.checked) url.searchParams.set("hide", "completed")
    else url.searchParams.delete("hide")
    const query = search.value.trim()
    if (query) url.searchParams.set("q", query)
    else url.searchParams.delete("q")
    if (url.href !== location.href) history.replaceState(history.state, "", url)
  }

  // A flaky connection, say. The table empties out for a note instead of the skeleton staying up. Trying again
  // reloads the page, the browser remembers a failed import() and won't fetch it again
  function showLoadError() {
    ready = false
    skeleton.hidden = true
    layout = null
    groups = new Map()
    onPage = []
    body.replaceChildren()
    const retry = Object.assign(document.createElement("button"), { className: "table-retry", textContent: "Try again" })
    retry.addEventListener("click", () => location.reload())
    empty.replaceChildren(`Couldn't load the ${noun}, check your connection. `, retry)
    empty.hidden = false
  }

  async function applyFilters() {
    saveUrl()
    const query = search.value.trim().toLowerCase()
    // A search looks through everything, the dropdowns are off until it's cleared
    for (const select of Object.values(selects)) select.disabled = !!query

    const current = ++generation
    const files = query || selects.expansion.value === ALL ? expansions.map((e) => e.file) : [selects.expansion.value]
    let entries
    try {
      entries = (await Promise.all(files.map(loadExpansion))).flat()
    } catch (err) {
      console.error(err)
      if (current === generation) showLoadError()
      return
    }
    if (current !== generation) return

    shown = entries.filter((entry) => rowOf(entry)
      && !(hideDone?.checked && rowOf(entry).tr.hasAttribute("data-done"))
      && (query ? matches(entry, query) : !filter || filter(entry)))
    ready = true
    skeleton.hidden = true
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
    for (const entry of sorted.slice(0, MAX_ROWS)) {
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

    setText(empty, shown.length
      ? `Showing the ${MAX_ROWS} soonest of ${shown.length.toLocaleString("en-US")} ${noun}, search or filter to narrow them down.`
      : `No ${noun} match.`)
    const hide = shown.length > 0 && shown.length <= MAX_ROWS
    if (empty.hidden !== hide) empty.hidden = hide
    // Nothing coming up rechecks once a minute
    return { runs, until: Math.min(until, now + 60 * 1000) }
  }

  // Every tick only the countdowns change, the groups are rebuilt when one opens or closes
  function render(now) {
    if (!ready) return
    if (!layout || now >= layout.until) layout = buildLayout(now)

    const date = new Date(now)
    for (const { state, w, group } of layout.runs) {
      if (state === "open" || state === "later") {
        setText(group.countdown, formatCountdown((w.open ? w.end : w.start) - now))
        // Up now, only the end is shown, "Up until 21:03", so its day goes by today's instead
        const start = new Date(w.start)
        setTime(group.from, start, date)
        setTime(group.to, new Date(w.end), date, { zone: true, from: w.open ? null : start })
      } else {
        setText(group.countdown, state === "always" ? "Any time" : "Nothing in the next 30 days")
      }
    }
  }

  for (const select of Object.values(selects)) select.addEventListener("change", applyFilters)
  search.addEventListener("input", applyFilters)
  hideDone?.addEventListener("change", applyFilters)
  // After the check's sparks, which a row hidden at once would take with it
  document.addEventListener("done-change", () => {
    if (hideDone?.checked) setTimeout(applyFilters, CELEBRATE_MS)
  })
  // It filters as you type, so Enter only has to put the phone's keyboard away
  search.addEventListener("keydown", (e) => {
    if (e.key === "Enter") search.blur()
  })
  applyFilters()
  filtersButton(search.closest(".filters"))

  return render
}

/**
 * A button in the corner that takes you back up to the filters, shown once they're scrolled out of sight.
 * @param {HTMLElement} filters
 */
function filtersButton(filters) {
  const button = document.createElement("button")
  button.className = "filters-button"
  button.hidden = true
  button.setAttribute("aria-label", "Back to the filters")
  button.title = button.getAttribute("aria-label")
  document.body.append(button)

  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)")
  button.addEventListener("click", () => {
    filters.scrollIntoView({ behavior: reduceMotion.matches ? "auto" : "smooth", block: "start" })
  })

  // Only once they're above the screen, the sticky navbar over the top counts as out of sight
  const navbarHeight = document.querySelector(".navbar").offsetHeight
  new IntersectionObserver(([entry]) => {
    button.hidden = entry.isIntersecting || entry.boundingClientRect.top > 0
  }, { rootMargin: `-${navbarHeight}px 0px 0px 0px` }).observe(filters)
}
