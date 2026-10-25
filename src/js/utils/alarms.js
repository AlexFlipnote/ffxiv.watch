import { ALARMS_KEY, DEFAULT_LEAD, LEAD_KEY, NEXT_KEY, paintStrip, readAlarms, soundUrl } from "./alarmBells.js"
import { closable } from "./dialog.js"
import { ET_MINUTE_EARTH_MS } from "./eorzea.js"
import { alarmsDue, alarmWindow, cachedWindows, ringDue } from "./forecast.js"
import { load, onStored, store } from "./storage.js"
import { everyTick, formatCountdown, formatIn, setText } from "./time.js"
import { toast } from "./toast.js"
import { nextVoyageTo } from "./voyages.js"

// Longer timers misfire in some browsers
const MAX_WAIT = 60 * 60 * 1000

/** @typedef {import("./alarmBells.js").Alarm} Alarm */

/** @returns {number} ET minutes before a window it rings */
function leadMinutes() {
  const minutes = Number(load(LEAD_KEY) ?? DEFAULT_LEAD)
  return Number.isFinite(minutes) && minutes >= 0 ? minutes : DEFAULT_LEAD
}

/** @returns {string} "2 ET hours (5:50) before it's up", "when it's up" */
export function leadText() {
  const minutes = leadMinutes()
  if (!minutes) return "when it's up"
  const hours = minutes / 60
  const earth = Math.round(minutes * ET_MINUTE_EARTH_MS / 1000)
  return `${hours} ET hour${hours === 1 ? "" : "s"} (${Math.floor(earth / 60)}:${String(earth % 60).padStart(2, "0")}) before it's up`
}

/**
 * @param {Alarm} alarm
 * @param {number} now
 * @returns {import("./listing.js").Window} Its window now or next, an ocean fish's is its voyage's boarding
 */
const windowOf = (alarm, now) => alarm.ocean ? nextVoyageTo(alarm.ocean, now) : alarmWindow(alarm, now)
const current = cachedWindows(windowOf)
// Phones pause a page in the background, and only show notifications through a service worker
const touch = matchMedia("(pointer: coarse)").matches

/**
 * Adds the alarm, or takes it away when it's set.
 * @param {Alarm} alarm
 */
export function toggleAlarm(alarm) {
  const alarms = readAlarms()
  const at = alarms.findIndex((a) => a.id === alarm.id)
  if (at >= 0) {
    alarms.splice(at, 1)
    store(ALARMS_KEY, alarms.length ? JSON.stringify(alarms) : null)
    toast(`Removed the alarm for ${alarm.name}`)
    return
  }
  store(ALARMS_KEY, JSON.stringify([...alarms, alarm]))
  toast(`Alarm set for ${alarm.name}, it rings ${leadText()}`, { tone: "success" })
}

let askedForClick = false

function playSound() {
  const url = soundUrl()
  if (!url) return
  // Refused in a tab that hasn't been clicked since it loaded
  new Audio(url).play().catch((err) => {
    if (err.name !== "NotAllowedError" || askedForClick) return
    askedForClick = true
    toast("Your browser kept the alarm quiet, click anywhere on the page once and it can play its sound", { tone: "warning", duration: 15000 })
  })
}

/**
 * Its toast and notification, schedule plays the sound.
 * @param {Alarm} alarm
 * @param {{ start: number }} w The window it's ringing for
 */
function ring(alarm, w) {
  const left = w.start - Date.now()
  const text = alarm.ocean
    ? left > 1000 ? `The voyage for ${alarm.name} boards in ${formatIn(left)}` : `The voyage for ${alarm.name} is boarding now`
    : left > 1000 ? `${alarm.name} is up in ${formatIn(left)}` : `${alarm.name} is up now`
  toast(text, { tone: "success", duration: 15000 })
  if (touch || globalThis.Notification?.permission !== "granted") return
  let notification
  try {
    notification = new Notification(text, { body: alarm.place, icon: "/images/icon-192.png", tag: `${alarm.id}:${w.start}` })
  } catch {
    // Some browsers only show them through a service worker
    return
  }
  notification.addEventListener("click", () => {
    focus()
    notification.close()
    if (location.pathname !== alarm.url) location.href = alarm.url
  })
}

/** @type {Alarm[]} */
let alarms = readAlarms()
let leader = false
let timer = null
// Skips the storage event of its own `rung` write
let saving = false

/** Rings what's due and waits for the next one. Only in the tab holding the lock. */
function schedule() {
  clearTimeout(timer)
  const now = Date.now()
  const { due, next } = alarmsDue(alarms, now, leadMinutes() * ET_MINUTE_EARTH_MS, windowOf)
  if (due.length) {
    for (const [alarm, w] of due) alarm.rung = w.start
    saving = true
    store(ALARMS_KEY, JSON.stringify(alarms))
    saving = false
    ringDue(due, playSound, ring)
    schedule()
    return
  }
  if (next < Infinity) timer = setTimeout(schedule, Math.min(next - now, MAX_WAIT))
}

const strip = document.querySelector(".alarm-strip")
// What NEXT_KEY last saved
let saved = load(NEXT_KEY)

const modal = document.createElement("dialog")
modal.className = "modal modal-top alarms-modal"
modal.setAttribute("closedby", "any")
modal.setAttribute("aria-labelledby", "alarms-title")
modal.innerHTML = `
  <div class="modal-header">
    <h2 class="title" id="alarms-title">Alarms</h2>
    <button class="close-btn" aria-label="Close">&times;</button>
  </div>
  <ul class="alarms-list"></ul>
  <p class="alarms-note"></p>
`
document.body.append(modal)
closable(modal, modal.querySelector(".close-btn"))
const list = modal.querySelector(".alarms-list")
const note = modal.querySelector(".alarms-note")

/**
 * @param {number} now
 * @returns {{ alarm: Alarm, w: import("./listing.js").Window }[]} Up now first, then the soonest
 */
function sorted(now) {
  const time = ({ w }) => !w || w.always ? Infinity : w.open ? -Infinity : w.start
  return alarms.map((alarm) => ({ alarm, w: current(alarm, now) })).sort((a, b) => time(a) - time(b))
}

/**
 * @param {import("./listing.js").Window} w
 * @param {number} now
 * @returns {string}
 */
const status = (w, now) => !w || w.always ? "Nothing in the next 30 days"
  : w.open ? `Ends in ${formatCountdown(w.end - now)}` : `Up in ${formatCountdown(w.start - now)}`

function buildList() {
  list.replaceChildren(...sorted(Date.now()).map(({ alarm }) => {
    const li = document.createElement("li")
    li.dataset.id = alarm.id
    li.innerHTML = `
      <span class="alarms-icon"></span>
      <div class="alarms-entry"><a class="alarms-name"></a><span class="alarms-place"></span></div>
      <span class="alarms-status"></span>
      <button class="alarms-remove" aria-label="Remove">&times;</button>
    `
    const link = li.querySelector("a")
    link.href = alarm.url
    link.textContent = alarm.name
    li.querySelector(".alarms-place").textContent = alarm.place
    // Alarms set before icons were added have none
    if (Number.isInteger(alarm.icon)) li.querySelector(".alarms-icon").innerHTML = `<img src="/images/game/${alarm.icon}.webp" alt="" width="36" height="36">`
    li.querySelector("button").setAttribute("aria-label", `Remove the alarm for ${alarm.name}`)
    li.querySelector("button").addEventListener("click", () => toggleAlarm(alarm))
    return li
  }))

  const blocked = globalThis.Notification?.permission === "denied"
  note.textContent = `Rings ${leadText()}, while a tab is open.${touch ? " Keep the page open on phone screen." : ""}${blocked
    ? " Notifications are blocked for this site." : ""}`
}

function render(now) {
  const first = alarms.length ? sorted(now)[0] : null
  const soonest = first?.w && !first.w.always ? { start: first.w.start, end: first.w.end, name: first.alarm.name } : null
  paintStrip(alarms.length, soonest, now)
  const json = soonest && JSON.stringify(soonest)
  if (json !== saved) store(NEXT_KEY, saved = json)

  if (!modal.open) return
  for (const { alarm, w } of sorted(now)) {
    const el = list.querySelector(`li[data-id="${CSS.escape(alarm.id)}"] .alarms-status`)
    if (!el) continue
    setText(el, status(w, now))
    el.classList.toggle("alarms-open", Boolean(w?.open))
  }
}

// Opened first, render skips a closed list
strip.addEventListener("click", () => {
  buildList()
  modal.showModal()
  render(Date.now())
})

onStored(ALARMS_KEY, () => {
  if (saving) return
  alarms = readAlarms()
  if (modal.open) buildList()
  if (!alarms.length) modal.close()
  render(Date.now())
  if (leader) schedule()
})
onStored(LEAD_KEY, () => {
  if (modal.open) buildList()
  if (leader) schedule()
})
// A hidden tab's timers are slowed down
document.addEventListener("visibilitychange", () => {
  if (leader && !document.hidden) schedule()
})

/** Rings in this tab from now on */
function lead() {
  leader = true
  alarms = readAlarms()
  schedule()
}

const LOCK = "ffxiv-watch-alarms"
// Waiting for the lock, so a burst of clicks asks once
let claiming = false

/**
 * Waits for the lock and rings while holding it, until the tab closes.
 * @param {boolean} [steal] Takes it from the tab holding it
 */
function contend(steal = false) {
  claiming = steal
  navigator.locks.request(LOCK, { steal }, () => {
    claiming = false
    return new Promise(() => lead())
  }).catch(() => {
    // Taken by a tab clicked in since
    claiming = false
    leader = false
    clearTimeout(timer)
    contend()
  })
}

if (navigator.locks) {
  contend()
  // Only a tab that's been clicked can play sound, so the last one clicked rings
  for (const type of ["pointerdown", "keydown"]) {
    addEventListener(type, () => {
      if (!leader && !claiming) contend(true)
    }, { capture: true, passive: true })
  }
} else {
  lead()
}

everyTick(render)
