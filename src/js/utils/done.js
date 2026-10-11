import { buzz } from "./haptics.js"
import { load, onStored, store } from "./storage.js"
import { toast } from "./toast.js"

/*
  What's been marked done, kept in localStorage as the ids joined with dots: "done-fish" -> "4869.4870.7678". The
  backup code packs every list into one line to paste on another device. Each list is its count and then the gaps
  between its sorted ids, as varints, so a run of ids in a row is a byte each. A checksum byte at the end catches a
  code that was cut short or mistyped, and the prefix carries the version.
*/

export const LISTS = [
  { key: "vistas", name: "Sightseeing", noun: "vistas" },
  { key: "gathering", name: "Gathering", noun: "items" },
  { key: "fish", name: "Fishing", noun: "fish" }
]

const PREFIX = "FW1:"

// "1" when the lists leave out what's done, the same for every list and in the settings
export const HIDE_DONE_KEY = "hide-completed"

/** @param {string} key One of LISTS */
export const storageKey = (key) => `done-${key}`

/**
 * @param {string} key One of LISTS
 * @returns {Set<number>}
 */
export function readDone(key) {
  const value = load(storageKey(key))
  return new Set(value ? value.split(".").map(Number).filter(Number.isInteger) : [])
}

/**
 * @param {string} key One of LISTS
 * @param {Set<number>} done
 */
export function writeDone(key, done) {
  store(storageKey(key), done.size ? [...done].sort((a, b) => a - b).join(".") : null)
}

/**
 * @param {Uint8Array} bytes
 * @returns {number}
 */
const checksum = (bytes) => bytes.reduce((sum, byte) => (sum + byte) & 255, 0)

/** @returns {string} Every list, "FW1:" and then base64url */
export function encodeBackup() {
  const bytes = []
  const varint = (n) => {
    while (n >= 128) {
      bytes.push((n & 127) | 128)
      n = Math.floor(n / 128)
    }
    bytes.push(n)
  }

  for (const { key } of LISTS) {
    const ids = [...readDone(key)].filter((id) => id >= 0).sort((a, b) => a - b)
    varint(ids.length)
    ids.forEach((id, i) => varint(id - (ids[i - 1] ?? 0)))
  }
  bytes.push(checksum(bytes))

  const base64 = btoa(String.fromCharCode(...bytes))
  return PREFIX + base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

/**
 * @param {string} code From encodeBackup, spaces and line breaks from pasting are fine
 * @returns {Record<string, Set<number>> | null} Each list's ids, null when it isn't a whole, valid code
 */
export function decodeBackup(code) {
  code = code.replace(/\s+/g, "")
  if (!code.startsWith(PREFIX)) return null

  let bytes
  try {
    const base64 = code.slice(PREFIX.length).replace(/-/g, "+").replace(/_/g, "/")
    bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
  } catch {
    return null
  }
  if (bytes.length < LISTS.length + 1 || checksum(bytes.subarray(0, -1)) !== bytes.at(-1)) return null

  let at = 0
  const end = bytes.length - 1
  const varint = () => {
    let n = 0
    for (let shift = 1; at < end; shift *= 128) {
      const byte = bytes[at++]
      n += (byte & 127) * shift
      if (byte < 128) return n
    }
    throw new Error("Cut short")
  }

  try {
    const lists = {}
    for (const { key } of LISTS) {
      const ids = new Set()
      let id = 0
      for (let count = varint(); count > 0; count--) ids.add(id += varint())
      lists[key] = ids
    }
    return at === end ? lists : null
  } catch {
    return null
  }
}

const SPARKS = 8
// How long the sparks and the pop take, see .done-check in _controls.scss
export const CELEBRATE_MS = 600

/**
 * A pop, a burst of sparks and a buzz when it's checked, a quick shrink when it's unchecked.
 * @param {HTMLButtonElement} button
 * @param {boolean} isDone
 */
function celebrate(button, isDone) {
  button.classList.remove("done-pop", "done-unpop")
  // Restarts the animation when it's clicked again before it ended
  void button.offsetWidth
  button.classList.add(isDone ? "done-pop" : "done-unpop")
  buzz(isDone ? [12, 60, 12] : 10)
  if (!isDone) return

  const burst = document.createElement("span")
  burst.className = "done-burst"
  burst.setAttribute("aria-hidden", "true")
  for (let i = 0; i < SPARKS; i++) {
    const spark = document.createElement("span")
    spark.style.setProperty("--angle", `${i * (360 / SPARKS)}deg`)
    burst.append(spark)
  }
  button.append(burst)
  setTimeout(() => burst.remove(), CELEBRATE_MS)
}

/**
 * Hooks up the page's done checks (doneButton in src/render/html.js), kept as the top of this file says. A row fades
 * once all its checks are done. Fires "done-change" on the document after each change.
 * @param {string} key "vistas", "fish", "gathering"
 */
export function doneChecks(key) {
  const buttons = [...document.querySelectorAll(".done-check")]
  const rows = [...new Set(buttons.map((b) => b.closest("tr")).filter(Boolean))]

  let done = readDone(key)
  // Its own saves are shown by the click, not read back
  let saving = false

  const show = () => {
    for (const button of buttons) {
      const isDone = done.has(Number(button.dataset.doneId))
      button.setAttribute("aria-pressed", isDone)
      button.title = isDone ? "Complete, click to undo" : "Mark as complete"
    }
    for (const tr of rows) {
      tr.toggleAttribute("data-done", [...tr.querySelectorAll(".done-check")].every((b) => b.getAttribute("aria-pressed") === "true"))
    }
    document.dispatchEvent(new Event("done-change"))
  }

  for (const button of buttons) {
    button.addEventListener("click", () => {
      const id = Number(button.dataset.doneId)
      const isDone = !done.delete(id)
      if (isDone) done.add(id)
      saving = true
      writeDone(key, done)
      saving = false
      show()
      celebrate(button, isDone)
      toast(`Marked ${button.dataset.name} as ${isDone ? "complete" : "not complete"}`, { tone: isDone ? "success" : "info" })
    })
  }

  onStored(storageKey(key), () => {
    if (saving) return
    done = readDone(key)
    show()
  })

  show()
}
