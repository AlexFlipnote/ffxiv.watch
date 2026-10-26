import "./navbar.js"
import { alarmBell } from "./alarmBells.js"
import { CELEBRATE_MS, doneChecks, HIDE_DONE_KEY } from "./done.js"
import { openMap } from "./mapModal.js"
import { load, onStored } from "./storage.js"
import { everyTick, formatCountdown, setText, setTime } from "./time.js"

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
 * @property {HTMLElement} body The table's tbody, with the rows of the expansion a first visit shows. Its data-rows has
 * the other expansions' rows' files, see listRows in src/render/html.js
 * @property {HTMLElement} empty Shown when nothing matches
 * @property {HTMLElement} skeleton Shown in place of the table until the first data is in
 * @property {(entry: object) => string | (string | Node)[]} [mapNote] Shown under the coordinates in the map dialog
 * @property {(entry: object) => boolean} [filter] The page's own dropdowns, skipped while searching
 * @property {(entry: object, query: string) => boolean} matches The search, `query` is lowercase and never ""
 * @property {(entry: object, now: number) => Window} windowOf Called every tick, so keep it cheap
 * @property {(entry: object, tr: HTMLTableRowElement) => import("./alarmBells.js").Alarm | null} alarmOf Null when it's
 * always up
 * @property {string} noun "nodes", "vistas"
 * @property {string} done Its done checks, see doneChecks
 */

const ALL = ""
// An option with no value, "Any" or "All", in the URL
const ANY = "any"
const STATE_ORDER = { open: 0, later: 1, always: 2, none: 3 }
// Laying out a row is what's slow, a search for "a" matches nearly every fish. The soonest are the ones that matter.
// Only every expansion at once is cut down, one has a few hundred at most
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
  const label = state === "open" ? "Ends in" : state === "later" ? "Up in" : ""
  header.innerHTML = `
    <td colspan="2">
      <span class="group-tab">
        ${label ? `<span class="group-label">${label}</span>` : ""}
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
 */
export function listing({ expansions, loadChunk, idOf, selects, search, body, empty, skeleton, mapNote, filter, matches, windowOf, alarmOf, noun, done }) {
  const addDoneChecks = doneChecks(done)
  // An expansion's file -> where its rows are, when the page came without them
  const rowFiles = JSON.parse(body.dataset.rows || "{}")
  // "dawntrail:974" -> its row, until the entry it's for has loaded
  const unclaimed = new Map([...body.querySelectorAll("tr[data-key]")].map((tr) => [tr.dataset.key, tr]))
  const keys = new Map()
  const rows = new Map()
  let groups = new Map()
  const loaded = new Map()
  let shown = []
  // maxRows when every expansion is on show, all of them for one
  let limit = Infinity
  let onPage = []
  // Bumped by every filter change, so a slow chunk load can't overwrite a newer pick
  let generation = 0
  // The groups on the page, until the first moment one of them opens or closes
  let layout = null
  // Nothing is drawn until the first data is in, the rows from the build stay hidden until then (see _listing.scss)
  let ready = false
  // Not in the URL like the filters, someone a link is shared with has their own done checks
  let hideDone = load(HIDE_DONE_KEY) === "1"

  // The filters are only in the URL, so a link shares them and a fresh visit starts from what the page picks
  const defaults = Object.fromEntries(Object.entries(selects).map(([name, select]) => [name, select.value]))
  const params = new URLSearchParams(location.search)
  for (const [name, select] of Object.entries(selects)) {
    const value = params.get(name) === ANY ? ALL : params.get(name)
    if ([...select.options].some((o) => o.value === value)) select.value = value
  }
  search.value = params.get("q") ?? ""
  // Raised by "Show more" under a cut-down list, ?results= in the URL so a reload or a shared link keeps them
  let maxRows = Math.max(MAX_ROWS, Math.floor(Number(params.get("results"))) || 0)

  const filters = search.closest(".filters")
  const toggle = filters.querySelector(".filters-toggle")
  toggle?.addEventListener("click", () => {
    const open = filters.classList.toggle("filters-open")
    toggle.setAttribute("aria-expanded", open)
  })

  /**
   * Adds an expansion's rows to the ones its entries can claim.
   * @param {string} url
   */
  async function loadRows(url) {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`${url}: ${response.status}`)
    const template = document.createElement("template")
    template.innerHTML = await response.text()
    addDoneChecks(template.content)
    for (const tr of template.content.querySelectorAll("tr[data-key]")) unclaimed.set(tr.dataset.key, tr)
  }

  const loadExpansion = (file) => {
    if (!loaded.has(file)) {
      loaded.set(file, Promise.all([loadChunk(file), rowFiles[file] && loadRows(rowFiles[file])]).then(([entries]) => {
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
      const bell = tr.querySelector(".alarm-bell")
      const alarm = alarmOf(entry, tr)
      // The build put its icon on the bell
      alarmBell(bell, alarm && { ...alarm, icon: Number(bell.dataset.icon) || undefined })
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
    // Left by links from before it was remembered
    url.searchParams.delete("hide")
    toggle?.classList.toggle("filters-set", Object.entries(selects).some(([name, select]) => select.value !== defaults[name]))
    const query = search.value.trim()
    if (query) url.searchParams.set("q", query)
    else url.searchParams.delete("q")
    if (maxRows > MAX_ROWS) url.searchParams.set("results", maxRows)
    else url.searchParams.delete("results")
    if (url.href !== location.href) history.replaceState(history.state, "", url)
  }

  // Trying again reloads the page, the browser remembers a failed import() and won't fetch it again
  function showLoadError() {
    ready = false
    skeleton.hidden = true
    layout = null
    groups = new Map()
    onPage = []
    body.replaceChildren()
    const retry = Object.assign(document.createElement("button"), { className: "table-link", textContent: "Try again" })
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

    limit = files.length > 1 ? maxRows : Infinity
    shown = entries.filter((entry) => rowOf(entry)
      && !(hideDone && rowOf(entry).tr.hasAttribute("data-done"))
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
    for (const entry of sorted.slice(0, limit)) {
      const w = windows.get(entry)
      const key = groupKey(w)
      if (runs.at(-1)?.key !== key) runs.push({ key, w, state: stateOf(w), entries: [] })
      runs.at(-1).entries.push(entry)
    }

    const trs = []
    const used = new Map()
    let until = Infinity
    for (const [i, run] of runs.entries()) {
      if (!groups.has(run.key)) {
        const group = groupRows(run.state)
        nearScreen.observe(group.header)
        groups.set(run.key, group)
      }
      run.group = groups.get(run.key)
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
    for (const [key, group] of groups) {
      if (used.has(key)) continue
      nearScreen.unobserve(group.header)
      shownHeaders.delete(group.header)
    }
    groups = used

    if (trs.length !== onPage.length || trs.some((tr, i) => tr !== onPage[i])) {
      onPage = trs
      body.replaceChildren(...trs)
    }

    // A failed load put its own note there
    if (empty.firstChild !== emptyText) empty.replaceChildren(emptyText, more)
    setText(emptyText, shown.length
      ? `Showing the ${limit} soonest of ${shown.length.toLocaleString("en-US")} ${noun}, search or filter to narrow them down. `
      : `No ${noun} match.`)
    const cut = shown.length > limit
    if (more.hidden === cut) more.hidden = !cut
    const hide = shown.length > 0 && shown.length <= limit
    if (empty.hidden !== hide) empty.hidden = hide
    // Nothing coming up rechecks once a minute
    return { runs, until: Math.min(until, now + 60 * 1000) }
  }

  const emptyText = document.createTextNode("")
  const more = Object.assign(document.createElement("button"), { className: "table-link", textContent: "Show more" })
  more.addEventListener("click", () => {
    maxRows += MAX_ROWS
    limit = maxRows
    saveUrl()
    layout = null
    render(Date.now())
  })

  // The group headers on screen or half a screen from it.
  const shownHeaders = new Set()
  const nearScreen = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) shownHeaders.add(entry.target)
      else shownHeaders.delete(entry.target)
    }
    render(Date.now())
  }, { rootMargin: "50% 0px" })

  // Every tick only the countdowns change, the groups are rebuilt when one opens or closes
  function render(now) {
    if (!ready) return
    if (!layout || now >= layout.until) layout = buildLayout(now)

    const date = new Date(now)
    for (const { state, w, group } of layout.runs) {
      // Filled once when made, so one far off isn't blank
      if (group.filled && !shownHeaders.has(group.header)) continue
      group.filled = true
      if (state === "open" || state === "later") {
        setText(group.countdown, formatCountdown((w.open ? w.end : w.start) - now))
        // Up now, only the end is shown, "Up until 21:03", so its day goes by today's instead
        const start = new Date(w.start)
        setTime(group.from, start, date)
        setTime(group.to, new Date(w.end), date, { from: w.open ? null : start })
      } else {
        setText(group.countdown, state === "always" ? "Any time" : "Nothing in the next 30 days")
      }
    }
  }

  for (const select of Object.values(selects)) select.addEventListener("change", applyFilters)
  search.addEventListener("input", applyFilters)
  onStored(HIDE_DONE_KEY, () => {
    hideDone = load(HIDE_DONE_KEY) === "1"
    applyFilters()
  })
  // After the check's sparks, which a row hidden at once would take with it
  document.addEventListener("done-change", () => {
    if (hideDone) setTimeout(applyFilters, CELEBRATE_MS)
  })
  // It filters as you type, so Enter only has to put the phone's keyboard away
  search.addEventListener("keydown", (e) => {
    if (e.key === "Enter") search.blur()
  })
  applyFilters()
  topButton(filters)
  everyTick(render)
}

/**
 * A button in the lower left that takes you back up to the search and filters, shown once they're scrolled out of
 * sight. Left, so the toasts on the right don't cover it.
 * @param {HTMLElement} filters
 */
function topButton(filters) {
  const button = document.createElement("button")
  button.className = "top-button"
  button.hidden = true
  button.setAttribute("aria-label", "Back to the top")
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
    // Read by the toasts' CSS, a body:has() for it restyled the whole page on every tick
    document.body.toggleAttribute("data-top-button", !button.hidden)
  }, { rootMargin: `-${navbarHeight}px 0px 0px 0px` }).observe(filters)
}
