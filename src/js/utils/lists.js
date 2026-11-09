import { load, onStored, store } from "./storage.js"

// Crafting lists in localStorage. A list goes by its name (unique, case aside), its address is /lists/?name=<name>
// and its contents are shared as /lists/?share=<code>

const KEY = "crafting-lists"

/**
 * @typedef {{ slug: string, name: string, icon: number, item: number, amount: number }} ListItem
 * @typedef {{ id: string, name: string, items: ListItem[], gotten: number[], have: Record<string, number>, made?: Record<string, number> }} List
 */

/** @returns {{ active: string | null, lists: List[] }} */
export function readLists() {
  try {
    const value = JSON.parse(load(KEY))
    if (value && Array.isArray(value.lists)) return byName(value)
  } catch {
    // A broken value starts over
  }
  return { active: null, lists: [] }
}

/**
 * Each list's name as its id, a repeated one numbered: lists used to have random ids.
 * @param {{ active: string | null, lists: List[] }} state
 * @returns {{ active: string | null, lists: List[] }}
 */
function byName(state) {
  const kept = []
  let active = state.active
  for (const list of state.lists) {
    const name = freeName(kept, String(list.name || "My list").trim().slice(0, 60) || "My list")
    if (list.id === state.active) active = name
    kept.push({ ...list, id: name, name })
  }
  return { active, lists: kept }
}

/**
 * @param {string} name
 * @returns {string}
 */
const nameKey = (name) => name.trim().toLocaleLowerCase()

/**
 * @param {List[]} lists
 * @param {string | null} name
 * @returns {List | null} Case aside
 */
export const findList = (lists, name) => name ? lists.find((l) => nameKey(l.name) === nameKey(name)) ?? null : null

/**
 * @param {List} list
 * @returns {string}
 */
export const listUrl = (list) => `/lists/?${new URLSearchParams({ name: list.name })}`

/** @param {{ active: string | null, lists: List[] }} state */
export const writeLists = (state) => store(KEY, state.lists.length ? JSON.stringify(state) : null)

/** @param {() => void} callback */
export const onListsChange = (callback) => onStored(KEY, callback)

/**
 * @param {string} name
 * @returns {List}
 */
export const newList = (name) => ({ id: name, name, items: [], gotten: [], have: {}, made: {} })

/**
 * @param {{ active: string | null, lists: List[] }} state
 * @returns {List | null} The one last picked, else the first
 */
export const activeList = (state) => findList(state.lists, state.active) ?? state.lists[0] ?? null

/**
 * @param {List[]} lists
 * @param {string} [base]
 * @returns {string} "My list", "My list 2"... whichever isn't taken
 */
export function freeName(lists, base = "My list") {
  const names = new Set(lists.map((l) => nameKey(l.name)))
  for (let n = 1; ; n++) {
    const name = n === 1 ? base : `${base} ${n}`
    if (!names.has(nameKey(name))) return name
  }
}

/**
 * Renames a list, numbered when the name's taken.
 * @param {List[]} lists
 * @param {List} list
 * @param {string} name
 * @returns {string} The name it got
 */
export function renameList(lists, list, name) {
  const wanted = name.trim().slice(0, 60) || list.name
  list.name = freeName(lists.filter((l) => l !== list), wanted)
  list.id = list.name
  return list.name
}

// "Create a new list...", no list's name is empty
export const NEW_LIST = ""

/**
 * Adds to a list, or to the amount already on it.
 * @param {string | null} listId NEW_LIST makes one
 * @param {ListItem} item
 * @param {number[]} gotten
 * @param {string} [name] A new list's
 * @returns {List}
 */
export function addToList(listId, item, gotten, name = "My list") {
  const state = readLists()
  let list = listId === NEW_LIST ? null : findList(state.lists, listId) ?? activeList(state)
  if (!list) {
    list = newList(freeName(state.lists, name.trim().slice(0, 60) || "My list"))
    state.lists.push(list)
  }
  const there = list.items.find((i) => i.slug === item.slug)
  if (there) there.amount = Math.min(9999, there.amount + item.amount)
  else list.items.push(item)
  list.gotten = [...new Set([...list.gotten, ...gotten])]
  state.active = list.id
  writeLists(state)
  return list
}

/**
 * @param {string} text
 * @returns {string} base64url of its UTF-8
 */
const toBase64Url = (text) => btoa(String.fromCharCode(...new TextEncoder().encode(text)))
  .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")

/**
 * @param {string} code
 * @returns {string}
 */
const fromBase64Url = (code) => new TextDecoder().decode(Uint8Array.from(atob(code.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)))

/**
 * @param {List} list
 * @returns {string}
 */
export function shareUrl(list) {
  const code = toBase64Url(JSON.stringify([1, list.name, list.items.map((i) => [i.slug, i.amount, i.item, i.icon, i.name]), list.gotten]))
  return `${location.origin}/lists/?share=${code}`
}

/**
 * @param {string | null} code
 * @returns {List | null} Null for a broken one
 */
export function sharedList(code) {
  if (!code) return null
  try {
    const [version, name, items, gotten] = JSON.parse(fromBase64Url(code))
    if (version !== 1 || typeof name !== "string" || !Array.isArray(items)) return null
    return {
      ...newList(name.slice(0, 60)),
      items: items.filter((i) => Array.isArray(i) && typeof i[0] === "string" && /^[a-z0-9-]+$/.test(i[0])).map(([slug, amount, item, icon, itemName]) => ({
        slug, amount: Math.min(9999, Math.max(1, Math.floor(amount) || 1)), item: Number(item), icon: Number(icon), name: String(itemName)
      })),
      gotten: Array.isArray(gotten) ? gotten.map(Number).filter(Number.isInteger) : []
    }
  } catch {
    return null
  }
}

const planners = new Map()

/**
 * A recipe page's data-planner.
 * @param {string} slug
 * @returns {Promise<object>}
 */
export function loadPlanner(slug) {
  if (!planners.has(slug)) {
    planners.set(slug, fetch(`/crafting/${slug}/`).then((res) => {
      if (!res.ok) throw new Error(`/crafting/${slug}/: ${res.status}`)
      return res.text()
    }).then((page) => {
      const section = new DOMParser().parseFromString(page, "text/html").querySelector(".crafting-full[data-planner]")
      if (!section) throw new Error(`/crafting/${slug}/ has no planner`)
      return JSON.parse(section.dataset.planner)
    }).catch((err) => {
      planners.delete(slug)
      throw err
    }))
  }
  return planners.get(slug)
}
