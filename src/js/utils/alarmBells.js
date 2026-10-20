import { load, onStored } from "./storage.js"
import { formatCountdown, setText } from "./time.js"

/*
  The alarms, kept in localStorage as JSON under "alarms". Each has its ET times and, when it waits for weather, its
  zone's odds, so any page can work out its windows. alarms.js rings them, loaded once there's one.
*/

export const ALARMS_KEY = "alarms"
// ET minutes before a window it rings
export const LEAD_KEY = "alarm-lead"
export const DEFAULT_LEAD = 0
// A file's name in /sounds/alarms/, or "off"
export const SOUND_KEY = "alarm-sound"
export const DEFAULT_SOUND = "brightline"
// The soonest window, saved by alarms.js so the next page can draw the pill before that loads
export const NEXT_KEY = "alarms-next"

/**
 * @param {string} [name] One of the settings' options, the picked one when left out
 * @returns {string | null} Its file, null for "off"
 */
export function soundUrl(name = load(SOUND_KEY) ?? DEFAULT_SOUND) {
  if (name === "off") return null
  // A sound that's since been removed falls back
  return `/sounds/alarms/${/^[a-z-]+$/.test(name) ? name : DEFAULT_SOUND}.m4a`
}

/**
 * @typedef {object} Alarm
 * @property {string} id "fish:4869", "node:974", "vista:112"
 * @property {string} name
 * @property {string} url Its page
 * @property {string} place "Yak T'el, Xd'aa Talat Tsoly"
 * @property {number} [icon] Its game icon in /images/game/, missing on alarms set before they had one
 * @property {string} [zone]
 * @property {[number, number][]} [times]
 * @property {string[]} [weather]
 * @property {string[]} [previousWeather]
 * @property {[string, number][]} [rates] Its zone's weather odds, when it waits for weather
 * @property {number} [rung] The start of the last window it rang for
 */

/**
 * @param {{ zone: string, spot?: string }} entry
 * @returns {string} "Yak T'el, Xd'aa Talat Tsoly"
 */
export const placeOf = (entry) => [entry.zone, entry.spot].filter(Boolean).join(", ")

/** @returns {Alarm[]} */
export function readAlarms() {
  try {
    const alarms = JSON.parse(load(ALARMS_KEY))
    return Array.isArray(alarms) ? alarms : []
  } catch {
    return []
  }
}

/**
 * @param {number} now
 * @returns {{ start: number, end: number } | null} The soonest window NEXT_KEY saved, null once it's over
 */
export function savedNext(now) {
  try {
    const w = JSON.parse(load(NEXT_KEY))
    return w?.end > now ? w : null
  } catch {
    return null
  }
}

/**
 * Draws the pill in the lower left, made the first time.
 * @param {number} count
 * @param {{ start: number, end: number } | null} w The soonest window
 * @param {number} now
 */
export function paintPill(count, w, now) {
  let pill = document.querySelector(".alarm-pill")
  if (!pill) {
    pill = document.createElement("button")
    pill.className = "alarm-pill"
    pill.setAttribute("aria-haspopup", "dialog")
    pill.innerHTML = "<span class=\"alarm-pill-icon\" aria-hidden=\"true\"></span><span class=\"alarm-pill-count\"></span><span class=\"alarm-pill-next\"></span>"
    document.body.append(pill)
  }
  pill.hidden = !count
  document.body.toggleAttribute("data-alarms", count > 0)
  if (!count) return

  const open = Boolean(w && w.start <= now)
  const next = pill.querySelector(".alarm-pill-next")
  setText(pill.querySelector(".alarm-pill-count"), String(count))
  setText(next, !w ? "" : open ? "Up now" : formatCountdown(w.start - now))
  next.classList.toggle("alarms-open", open)
  pill.setAttribute("aria-label", `${count} alarm${count === 1 ? "" : "s"}${!w ? "" : open ? ", one up now" : `, next up in ${formatCountdown(w.start - now)}`}`)
}

// Each bell's alarm, null when it's always up
const bells = new Map()

/** @param {HTMLButtonElement} button */
function paint(button, ids) {
  const alarm = bells.get(button)
  if (!alarm) {
    button.disabled = true
    button.removeAttribute("aria-pressed")
    button.title = "Always up, nothing to wait for"
    button.setAttribute("aria-label", button.title)
    return
  }
  const set = ids.has(alarm.id)
  button.disabled = false
  button.setAttribute("aria-pressed", set)
  button.title = set ? "Alarm set, click to remove it" : "Set an alarm for when it's up"
  button.setAttribute("aria-label", `Alarm for ${alarm.name}`)
}

const ids = () => new Set(readAlarms().map((a) => a.id))

onStored(ALARMS_KEY, () => {
  const set = ids()
  for (const button of bells.keys()) paint(button, set)
})

/**
 * Hooks up a bell (alarmButton in src/render/html.js).
 * @param {HTMLButtonElement} button
 * @param {Alarm | null} alarm What it's for, null when it's always up and the bell stays off
 */
export function alarmBell(button, alarm) {
  const hooked = bells.has(button)
  bells.set(button, alarm)
  paint(button, ids())
  if (hooked) return

  button.addEventListener("click", () => {
    const alarm = bells.get(button)
    if (!alarm) return
    // Browsers ignore an ask that isn't right in the click. A phone can't show them without a service worker
    if (!ids().has(alarm.id) && globalThis.Notification?.permission === "default" && !matchMedia("(pointer: coarse)").matches) {
      Notification.requestPermission()
    }
    import("./alarms.js").then((m) => m.toggleAlarm(alarm))
  })
}
