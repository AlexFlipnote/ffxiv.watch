import "./utils/navbar.js"
import { CRAFTER_KEY } from "./utils/crafting.js"
import { gameIcon } from "./utils/images.js"
import { findList, freeName, listUrl, loadPlanner, NAME_LENGTH, newList, onListsChange, readLists, renameList, sharedList, shareUrl, writeLists } from "./utils/lists.js"
import { closable } from "./utils/dialog.js"
import { craftTreeButton, el, iconButton, mergeData, planView, stepper } from "./utils/planner.js"
import { entriesOf, rank } from "./utils/search.js"
import { load, onStored } from "./utils/storage.js"
import { toast } from "./utils/toast.js"

// /lists/: the index, a list by ?name=<name>, or one shared by ?share=<code>

const RESULTS = 8
const CARD_ICONS = 6

const TITLE = document.title

const $ = (id) => document.getElementById(id)
const topBar = $("lists-top")
const topActions = $("lists-top-actions")
const intro = $("lists-intro")
const index = $("lists-index")
const cards = $("lists-cards")
const view = $("lists-view")
const nameInput = Object.assign($("lists-name"), { maxLength: NAME_LENGTH })
const actions = $("lists-actions")
const items = $("lists-items")
const addButton = $("lists-add")
const addRow = $("lists-add-row")
const craftsSection = $("lists-crafts")
const planSection = $("lists-plan")
const status = $("lists-status")
const planBody = $("lists-plan-body")
const sharedBanner = $("lists-shared")

let state = readLists()
let shared = null
// Null on the index
let current = null
let plan = null
let planKey = ""

function route() {
  const params = new URLSearchParams(location.search)
  shared = sharedList(params.get("share"))
  state = readLists()
  current = shared ?? findList(state.lists, params.get("name"))
  if (!current && params.has("name")) history.replaceState(null, "", location.pathname)
  render()
}

/**
 * @param {import("./utils/lists.js").List | null} list Null for the index
 * @param {boolean} [replace]
 */
function go(list, replace = false) {
  history[replace ? "replaceState" : "pushState"](null, "", list ? listUrl(list) : location.pathname)
  scrollTo(0, 0)
  route()
}

// Its own writes come back as changes, redrawing then would swap the rows being tapped
let saving = false

function save() {
  if (shared && current === shared) return
  if (current) state.active = current.id
  saving = true
  writeLists(state)
  saving = false
}

function render() {
  sharedBanner.hidden = !shared
  if (shared) $("lists-shared-name").textContent = shared.name
  topBar.hidden = !current
  intro.hidden = !!current
  index.hidden = !!current
  view.hidden = !current
  if (current) renderList()
  else renderIndex()
}

function renderIndex() {
  planKey = ""
  plan = null
  document.title = TITLE
  const start = Object.assign(el("button", "lists-card lists-card-new", [
    el("span", "lists-card-new-icon"),
    el("strong", "", ["New list"])
  ]), { type: "button" })
  start.addEventListener("click", startList)
  cards.replaceChildren(...state.lists.map((list) => {
    const count = list.items.reduce((n, i) => n + i.amount, 0)
    const link = Object.assign(el("a", "lists-card", [
      el("strong", "", [list.name]),
      el("span", "lists-card-count", [list.items.length ? `${list.items.length} recipe${list.items.length === 1 ? "" : "s"}, ${count} to make` : "Empty"]),
      el("span", "lists-card-icons", [
        ...list.items.slice(0, CARD_ICONS).map((i) => Object.assign(el("img", "bait-icon"), { src: gameIcon(i.icon), alt: "", width: 24, height: 24 })),
        list.items.length > CARD_ICONS && el("span", "lists-card-more", [`+${list.items.length - CARD_ICONS}`])
      ])
    ]), { href: listUrl(list) })
    link.addEventListener("click", (e) => {
      if (e.ctrlKey || e.metaKey || e.shiftKey) return
      e.preventDefault()
      go(list)
    })
    return el("li", "", [link])
  }), el("li", "", [start]))
}

function renderList() {
  const own = current !== shared
  document.title = `${current.name} - ffxiv.watch`
  nameInput.value = current.name
  nameInput.readOnly = !own
  addButton.hidden = !own
  renderActions(own)
  renderItems(own)
  loadPlan()
}

/** @param {boolean} own Not a shared list */
function renderActions(own) {
  const share = iconButton("share", "Share", { text: true })
  share.title = "Share a link to this list"
  share.addEventListener("click", shareList)
  const remove = own && iconButton("delete", "Delete", { text: true, className: "danger-button" })
  if (remove) {
    remove.title = "Delete this list"
    remove.addEventListener("click", deleteList)
  }
  actions.replaceChildren(...[own && share].filter(Boolean))
  topActions.replaceChildren(...[remove].filter(Boolean))
}

/** @param {boolean} own */
function renderItems(own) {
  items.replaceChildren(...current.items.map((item) => {
    const amount = stepper(item.amount, `How many ${item.name}`, (n) => {
      item.amount = n
      save()
      plan?.draw()
    }, { readOnly: !own })
    const remove = own && iconButton("delete", `Remove ${item.name} from the list`, { className: "lists-remove" })
    if (remove) {
      remove.addEventListener("click", () => {
        current.items = current.items.filter((i) => i !== item)
        save()
        renderList()
      })
    }
    return el("li", "lists-item", [
      remove,
      Object.assign(el("img", "bait-icon"), { src: gameIcon(item.icon), alt: "", width: 24, height: 24 }),
      el("span", "craft-label", [Object.assign(el("a", "crafting-ingredient", [item.name]), { href: `/crafting/${item.slug}/` })]),
      amount.el
    ])
  }))
  if (!current.items.length) items.append(el("li", "crafting-note", ["Nothing on it yet, add something to craft below."]))
}

/** Loads the items' recipe pages and draws the plan */
async function loadPlan() {
  const list = current
  const key = `${list.id}|${list.items.map((i) => i.slug).join()}`
  if (key === planKey && plan) return plan.draw()
  planKey = key
  plan = null
  planBody.replaceChildren()
  craftsSection.hidden = true
  foldDone(planSection, false)
  foldDone(craftsSection, false)
  mapButton.hidden = true
  if (!list.items.length) {
    status.textContent = "Add something to craft and what it takes shows up here."
    status.hidden = false
    return
  }

  status.textContent = "Loading the recipes..."
  status.hidden = false
  const loaded = await Promise.allSettled(list.items.map((i) => loadPlanner(i.slug)))
  // Changed while loading, a newer load draws
  if (key !== planKey || list !== current) return

  const failed = list.items.filter((_, i) => loaded[i].status === "rejected")
  const datas = loaded.filter((l) => l.status === "fulfilled").map((l) => l.value)
  status.textContent = failed.length ? `Couldn't load ${failed.map((i) => i.name).join(", ")}, check your connection. It may also have been renamed in a patch.` : ""
  status.hidden = !failed.length
  if (!datas.length) return

  const data = mergeData(datas, load(CRAFTER_KEY))
  const counts = (record) => new Map(Object.entries(record ?? {}).map(([id, n]) => [Number(id), n]))
  const gotten = new Set(list.gotten)
  const have = counts(list.have)
  const made = counts(list.made)
  plan = planView({
    data,
    roots: () => list.items.filter((i) => data.items[i.item]).map((i) => [i.item, i.amount]),
    gotten,
    have,
    made,
    onChange: () => {
      list.gotten = [...gotten]
      list.have = Object.fromEntries(have)
      list.made = Object.fromEntries(made)
      save()
    },
    onComplete: ({ materials, crafts }) => {
      foldDone(planSection, materials)
      foldDone(craftsSection, crafts)
    }
  })
  planBody.replaceChildren(plan.summary)
  mapButton.hidden = false
  craftsSection.replaceChildren(craftsSection.querySelector("h2"), plan.crafts)
  craftsSection.hidden = false
  plan.draw()
}

/**
 * Folds a card that's all done down to its title.
 * @param {HTMLElement} section
 * @param {boolean} done
 */
function foldDone(section, done) {
  const title = section.querySelector("h2")
  const was = section.classList.contains("planner-complete")
  section.classList.toggle("planner-complete", done)
  // One opened to look stays open across redraws
  if (done && !was) section.classList.remove("planner-open")
  if (done) {
    title.setAttribute("role", "button")
    title.tabIndex = 0
    title.setAttribute("aria-expanded", section.classList.contains("planner-open"))
    title.title = section.classList.contains("planner-open") ? "Fold it away" : "All done, tap to see it"
  } else {
    title.removeAttribute("role")
    title.removeAttribute("tabindex")
    title.removeAttribute("aria-expanded")
    title.removeAttribute("title")
  }
}

for (const section of [planSection, craftsSection]) {
  const title = section.querySelector("h2")
  const toggle = () => {
    if (!section.classList.contains("planner-complete")) return
    section.classList.toggle("planner-open")
    foldDone(section, true)
  }
  title.addEventListener("click", toggle)
  title.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      toggle()
    }
  })
}

let searchIndex = null
const loadIndex = () => searchIndex ??= fetch(document.querySelector(".search-button").dataset.index)
  .then((r) => r.json()).then((i) => entriesOf({ ...i, fish: [], gathering: [], sightseeing: [], weather: [], pages: [] }))
  .catch((err) => {
    searchIndex = null
    throw err
  })

/** @returns {() => void} Opens the search for what to add */
function addDialog() {
  const dialog = el("dialog", "modal modal-top search-modal")
  dialog.setAttribute("closedby", "any")
  dialog.setAttribute("aria-label", "Add to the list")
  const input = Object.assign(el("input", "search-input"), { type: "search", placeholder: "Search recipes...", autocomplete: "off", spellcheck: false })
  input.setAttribute("aria-label", "Search recipes")
  const close = Object.assign(el("button", "close-btn", ["×"]), { type: "button" })
  close.setAttribute("aria-label", "Close")
  const list = el("ul", "search-results")
  const note = el("p", "search-note")
  dialog.append(el("div", "search-field", [input, close]), list, note)
  document.body.append(dialog)
  closable(dialog, close)

  let shown = []
  let active = 0
  const setActive = (i) => {
    active = (i + shown.length) % shown.length
    for (const [j, li] of [...list.children].entries()) li.setAttribute("aria-selected", j === active)
    list.children[active]?.scrollIntoView({ block: "nearest" })
  }

  async function update() {
    let entries
    try {
      entries = await loadIndex()
    } catch {
      note.textContent = "Couldn't load the recipes, check your connection"
      return
    }
    const query = input.value.trim()
    shown = query ? rank(entries, query).slice(0, RESULTS) : []
    list.replaceChildren(...shown.map((entry, i) => {
      const button = Object.assign(el("button", "search-result", [
        el("span", "search-icon", [Object.assign(el("img"), { src: gameIcon(entry.icon), alt: "", width: 32, height: 32 })]),
        el("span", "search-name", [entry.name]),
        current.items.some((item) => entry.url.endsWith(`/${item.slug}/`)) && el("span", "search-kind", ["On the list, adds one"])
      ]), { type: "button" })
      button.addEventListener("click", () => {
        dialog.close()
        addItem(entry)
      })
      button.addEventListener("pointermove", () => active !== i && setActive(i))
      return el("li", "", [button])
    }))
    if (shown.length) setActive(0)
    note.textContent = !query ? "Type to search every recipe" : shown.length ? "" : `No recipe called "${query}"`
  }

  input.addEventListener("input", update)
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault()
      if (shown.length) setActive(active + (e.key === "ArrowDown" ? 1 : -1))
    } else if (e.key === "Enter" && shown.length) {
      e.preventDefault()
      list.children[active].querySelector("button").click()
    }
  })

  return () => {
    input.value = ""
    dialog.showModal()
    input.focus()
    update()
  }
}

const listText = () => [current.name, ...current.items.map((i) => `  ${i.amount}x ${i.name}`), "", plan ? plan.text() : ""].join("\n").trim()
const mapButton = craftTreeButton(() => plan?.tree, listText, "lists-map")
mapButton.hidden = true
addRow.append(mapButton)

let openAdd = null
addButton.addEventListener("click", () => {
  openAdd ??= addDialog()
  openAdd()
})

/** @param {{ name: string, url: string, icon: number }} entry */
async function addItem(entry) {
  const slug = entry.url.split("/").at(-2)
  const there = current.items.find((i) => i.slug === slug)
  if (there) {
    there.amount = Math.min(9999, there.amount + 1)
  } else {
    let data
    try {
      data = await loadPlanner(slug)
    } catch {
      toast(`Couldn't load ${entry.name}, check your connection`, { tone: "warning" })
      return
    }
    current.items.push({ slug, name: entry.name, icon: entry.icon, item: data.root, amount: 1 })
  }
  save()
  renderList()
  toast(`Added ${entry.name}`, { tone: "success" })
}

nameInput.addEventListener("change", () => {
  const wanted = nameInput.value.trim()
  const name = renameList(state.lists, current, wanted)
  nameInput.value = name
  if (wanted && name !== wanted) toast(`There's already a list called ${wanted}, so it's ${name}`, { tone: "info" })
  save()
  history.replaceState(null, "", listUrl(current))
  document.title = `${name} - ffxiv.watch`
})
nameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") nameInput.blur()
})

function startList() {
  const list = newList(freeName(state.lists))
  state.lists.push(list)
  current = list
  save()
  go(list)
  nameInput.focus()
  nameInput.select()
}

function deleteList() {
  if (current.items.length && !confirm(`Delete ${current.name}? This can't be undone.`)) return
  state.lists = state.lists.filter((l) => l !== current)
  current = null
  state.active = null
  save()
  go(null, true)
  toast("Deleted the list", { tone: "danger" })
}

$("lists-save").addEventListener("click", () => {
  const copy = { ...newList(freeName(state.lists, shared.name)), items: shared.items, gotten: shared.gotten }
  state.lists.push(copy)
  shared = null
  current = copy
  save()
  go(copy, true)
  toast(`Saved ${copy.name} to your lists`, { tone: "success" })
})

async function shareList() {
  const url = shareUrl(current)
  if (navigator.share) {
    try {
      await navigator.share({ title: current.name, url })
      return
    } catch (err) {
      if (err.name === "AbortError") return
    }
  }
  try {
    await navigator.clipboard.writeText(url)
    toast("Copied the link to this list", { tone: "success" })
  } catch {
    toast("Couldn't copy, your browser didn't allow it", { tone: "warning" })
  }
}

addEventListener("popstate", route)
onStored(CRAFTER_KEY, () => {
  if (!current) return
  planKey = ""
  loadPlan()
})
onListsChange(() => {
  if (saving || shared) return
  const id = current?.id
  state = readLists()
  current = findList(state.lists, id)
  render()
})

route()
