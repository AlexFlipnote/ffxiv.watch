import { ET_MINUTE_EARTH_MS } from "./eorzea.js"

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
 * @returns {string} "Tue 13 Oct, 10:00", or "10:00" when it's the same day as `now`
 */
export function formatDate(date, now = new Date()) {
  const today = date.toDateString() === now.toDateString()
  return date.toLocaleString("en-GB", {
    ...(today ? {} : { weekday: "short", day: "numeric", month: "short" }),
    hour: "2-digit", minute: "2-digit", hour12: false
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
  const key = `${date.getTime()}|${from ? from.getTime() : dayOf(now)}|${zone}`
  if (filledTimes.get(el) === key) return
  filledTimes.set(el, key)

  const short = formatDate(date, from ?? now)
  el.textContent = zone ? `${short} ${gmtOffset(date)}` : short
  el.dateTime = date.toISOString()
  el.title = `${date.toLocaleString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false
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
