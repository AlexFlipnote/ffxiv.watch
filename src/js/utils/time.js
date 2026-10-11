import { ET_MINUTE_EARTH_MS } from "./eorzea.js"
import { load, onStored, store } from "./storage.js"

const CLOCK_KEY = "clock"
let use12 = null

/** @returns {"auto" | "12" | "24"} The picked one, "auto" guesses with autoHour12 */
export function pickedClock() {
  const clock = load(CLOCK_KEY)
  return clock === "12" || clock === "24" ? clock : "auto"
}

/** @param {"auto" | "12" | "24"} clock */
export const pickClock = (clock) => store(CLOCK_KEY, clock === "auto" ? null : clock)

/**
 * The browser's language decides it, not the device's clock setting, which a page can't see. Plenty in Europe run an
 * American English browser on a 24-hour clock, so a European time zone overrules it.
 * @returns {boolean}
 */
function autoHour12() {
  const { hour12, timeZone = "" } = new Intl.DateTimeFormat(undefined, { hour: "numeric" }).resolvedOptions()
  return !!hour12 && !timeZone.startsWith("Europe/")
}

/** @returns {boolean} Whether Earth times are shown as 12-hour, "9:05 PM" */
export function hour12() {
  if (use12 === null) {
    const picked = pickedClock()
    use12 = picked === "auto" ? autoHour12() : picked === "12"
  }
  return use12
}

// timers.js brings this file into the build too, where there's no document
if (typeof document !== "undefined") onStored(CLOCK_KEY, () => use12 = null)

/**
 * The hour and minute part of a toLocaleString() format.
 * @returns {Intl.DateTimeFormatOptions}
 */
const clockOptions = () => (hour12()
  ? { hour: "numeric", minute: "2-digit", hour12: true }
  : { hour: "2-digit", minute: "2-digit", hour12: false })

/**
 * The British date order, with the AM and PM the 12-hour clock's mostly American users know instead of its am and pm.
 * @param {Date} date
 * @param {Intl.DateTimeFormatOptions} options
 * @returns {string}
 */
export const formatEnGB = (date, options) => date.toLocaleString("en-GB", options).replace(/\b[ap]m\b/, (p) => p.toUpperCase())

/**
 * Rounded up to the second, so it reaches 00:00:00 right as the time comes, not a second before.
 * @param {number} ms
 * @returns {string} "01:02:03", or "2 days, 01:02:03"
 */
export function formatCountdown(ms) {
  const s = Math.ceil(ms / 1000)
  const m = Math.floor(s / 60)
  const h = Math.floor(m / 60)
  const d = Math.floor(h / 24)
  const pad = (n) => String(n).padStart(2, "0")
  const time = `${pad(h % 24)}:${pad(m % 60)}:${pad(s % 60)}`
  return d > 0 ? `${d} ${d > 1 ? "days" : "day"}, ${time}` : time
}

/**
 * @param {Date} date
 * @param {Date} [now] Or any other day to leave the day out on
 * @returns {string} "Tue 13 Oct, 10:00", or "10:00" when it's the same day as `now`, 12-hour when picked
 */
export function formatDate(date, now = new Date()) {
  const today = date.toDateString() === now.toDateString()
  return formatEnGB(date, {
    ...(today ? {} : { weekday: "short", day: "numeric", month: "short" }),
    ...clockOptions()
  })
}

// <time> -> what it was last filled with
const filledTimes = new WeakMap()

let today = { ms: null, day: null }

/**
 * `now.toDateString()`, worked out once for all the <time>s in a frame.
 * @param {Date} now
 * @returns {string}
 */
const dayOf = (now) => {
  if (today.ms !== now.getTime()) today = { ms: now.getTime(), day: now.toDateString() }
  return today.day
}

/**
 * Fills a <time> with the short date, the full one on hover. Skips the work when nothing changed.
 * @param {HTMLTimeElement} el
 * @param {Date} date
 * @param {Date} now Decides whether the day is shown
 * @param {{ zone?: boolean, from?: Date }} [options] `zone` adds "GMT+2" after it. `from` is the start of the range
 * this ends: on the same day the day is left out, "Sat 10 Oct, 00:40 - 00:54", whether or not it's today
 */
export function setTime(el, date, now, { zone = false, from = null } = {}) {
  const key = `${date.getTime()}|${from ? from.getTime() : dayOf(now)}|${zone}|${hour12()}`
  if (filledTimes.get(el) === key) return
  filledTimes.set(el, key)

  const short = formatDate(date, from ?? now)
  el.textContent = zone ? `${short} ${gmtOffset(date)}` : short
  el.dateTime = date.toISOString()
  el.title = `${formatEnGB(date, {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
    ...clockOptions()
  })} (${gmtOffset(date)})`
}

/**
 * @param {Date} date
 * @returns {string} "GMT+2", or "GMT+5:30" for zones that aren't a whole hour off
 */
export function gmtOffset(date) {
  const minutes = -date.getTimezoneOffset()
  const hours = Math.floor(Math.abs(minutes) / 60)
  const rest = Math.abs(minutes) % 60
  return `GMT${minutes < 0 ? "-" : "+"}${hours}${rest ? `:${String(rest).padStart(2, "0")}` : ""}`
}

/**
 * When what a page shows can next change: the next Earth second (the countdowns and clocks) or the next Eorzean
 * minute (windows opening and closing, the day/night phase), whichever comes first.
 * @param {number} now
 * @returns {number}
 */
const nextChange = (now) => Math.min(
  (Math.floor(now / 1000) + 1) * 1000,
  (Math.floor(now / ET_MINUTE_EARTH_MS) + 1) * ET_MINUTE_EARTH_MS
)

/**
 * Calls `fn` right away, then on the first frame after each moment the page can change (see nextChange). Waking
 * once or twice a second instead of every frame saves a phone's battery, and nothing runs while the tab is hidden.
 * @param {(now: number) => void} fn Gets `Date.now()`, should only touch the DOM when something changed
 */
export function everyTick(fn) {
  const run = () => {
    const now = Date.now()
    fn(now)
    // A timer firing a hair early reruns with nothing changed and waits again
    setTimeout(() => requestAnimationFrame(run), Math.ceil(nextChange(now) - Date.now()))
  }
  run()
}

/**
 * Sets an element's text, skipping the write when it's already that.
 * @param {HTMLElement} el
 * @param {string} text
 */
export function setText(el, text) {
  if (el.textContent !== text) el.textContent = text
}
