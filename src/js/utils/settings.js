import { closable } from "./dialog.js"
import { decodeBackup, encodeBackup, HIDE_DONE_KEY, LISTS, readDone, storageKey, writeDone } from "./done.js"
import { load, onStored, store } from "./storage.js"
import { pickedTheme, pickTheme } from "./theme.js"
import { pickClock, pickedClock } from "./time.js"
import { toast } from "./toast.js"

const modal = document.getElementById("settings")
const themes = [...modal.querySelectorAll("input[name=theme]")]
const clocks = [...modal.querySelectorAll("input[name=clock]")]
const hideDone = document.getElementById("settings-hide-done")
const lists = document.getElementById("settings-lists")
const code = document.getElementById("settings-code")
const copy = document.getElementById("settings-copy")
const restoreCode = document.getElementById("settings-restore-code")
const restore = document.getElementById("settings-restore")

const CONFIRM_MS = 3000
const tap = matchMedia("(pointer: coarse)").matches ? "Tap" : "Click"
const confirms = []

/**
 * A button that asks for a second click before it does anything, and goes back after a while without one.
 * @param {HTMLButtonElement} button
 * @param {string} asking What it says while it waits, "reset"
 * @param {() => boolean} needed false does it at once, nothing to lose
 * @param {() => void} action
 */
function confirmButton(button, asking, needed, action) {
  const label = button.textContent
  let timer = null
  const reset = () => {
    clearTimeout(timer)
    timer = null
    button.classList.remove("settings-confirming")
    button.textContent = label
  }
  confirms.push(reset)

  button.addEventListener("click", () => {
    if (timer === null && needed()) {
      button.classList.add("settings-confirming")
      button.textContent = `${tap} again to ${asking}`
      timer = setTimeout(reset, CONFIRM_MS)
      return
    }
    reset()
    action()
  })
}

/**
 * @param {Record<string, Set<number>>} done
 * @returns {string} "12 vistas, 30 items and 100 fish", the lists with anything in them
 */
function counts(done) {
  const parts = LISTS.filter(({ key }) => done[key].size).map(({ key, noun }) => `${done[key].size.toLocaleString("en-US")} ${noun}`)
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : parts[0] ?? "nothing"
}

const rows = LISTS.map(({ key, name, noun }) => {
  const li = document.createElement("li")
  li.innerHTML = `
    <span class="settings-list-name"></span>
    <span class="settings-list-count"></span>
    <button class="settings-btn settings-danger">Reset</button>
  `
  li.querySelector(".settings-list-name").textContent = name
  const button = li.querySelector("button")
  button.setAttribute("aria-label", `Reset ${name.toLowerCase()} progress`)
  confirmButton(button, "reset", () => true, () => {
    writeDone(key, new Set())
    toast(`Reset your ${name.toLowerCase()} progress`, { tone: "warning" })
  })
  lists.append(li)
  return { key, noun, count: li.querySelector(".settings-list-count"), button }
})

function showProgress() {
  for (const { key, noun, count, button } of rows) {
    const size = readDone(key).size
    count.textContent = `${size.toLocaleString("en-US")} ${noun} done`
    button.disabled = size === 0
  }
  code.value = encodeBackup()
}

function show() {
  for (const input of themes) input.checked = input.value === pickedTheme()
  for (const input of clocks) input.checked = input.value === pickedClock()
  hideDone.checked = load(HIDE_DONE_KEY) === "1"
  showProgress()
}

for (const input of themes) input.addEventListener("change", () => pickTheme(input.value))
for (const input of clocks) input.addEventListener("change", () => pickClock(input.value))
hideDone.addEventListener("change", () => store(HIDE_DONE_KEY, hideDone.checked ? "1" : null))

copy.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(code.value)
  } catch {
    // The clipboard API needs https, a phone on the dev server over the network has the old way
    code.select()
    if (!document.execCommand("copy")) {
      toast("Couldn't copy it, select the code and copy it yourself", { tone: "warning" })
      return
    }
  }
  toast("Copied the backup code", { tone: "success" })
})

/** @returns {Record<string, Set<number>> | null} The pasted code's lists, with a note when it isn't one */
function pasted() {
  const backup = decodeBackup(restoreCode.value)
  restoreCode.toggleAttribute("aria-invalid", !backup)
  if (!backup) toast(restoreCode.value.trim() ? "That isn't a whole backup code, try copying it again" : "Paste a backup code first", { tone: "warning" })
  return backup
}

// Restoring replaces what's here, so it asks first when there's something to lose
confirmButton(restore, "replace", () => !!decodeBackup(restoreCode.value) && LISTS.some(({ key }) => readDone(key).size), () => {
  const backup = pasted()
  if (!backup) return
  for (const { key } of LISTS) writeDone(key, backup[key])
  restoreCode.value = ""
  toast(`Restored ${counts(backup)}`, { tone: "success" })
})
restoreCode.addEventListener("input", () => restoreCode.removeAttribute("aria-invalid"))
restoreCode.addEventListener("keydown", (e) => {
  if (e.key === "Enter") restore.click()
})

for (const { key } of LISTS) onStored(storageKey(key), showProgress)
onStored(HIDE_DONE_KEY, () => hideDone.checked = load(HIDE_DONE_KEY) === "1")
onStored("theme", () => themes.forEach((input) => input.checked = input.value === pickedTheme()))
onStored("clock", () => clocks.forEach((input) => input.checked = input.value === pickedClock()))

closable(modal, document.getElementById("settings-close"))
modal.addEventListener("close", () => confirms.forEach((reset) => reset()))

export function openSettings() {
  show()
  modal.showModal()
}
