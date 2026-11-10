import "./utils/navbar.js"
import { backdropOf, CRYSTALLINE_CONFLICT, crystallineConflictAt, fillNow, FRONTLINE, frontlineAt, mapName } from "./utils/pvp.js"
import { everyTick, formatCountdown, formatDate, formatEnGB, setText } from "./utils/time.js"

// The Frontline and Crystalline Conflict pages: the map on now, and a month of days or a day of hours to step through

const main = document.querySelector("main[data-rotation]")
const daily = main.dataset.rotation === "frontline"
const rotation = daily ? FRONTLINE : CRYSTALLINE_CONFLICT
const at = daily ? frontlineAt : crystallineConflictAt

const now = main.querySelector(".pvp-now")
const countdown = now.querySelector(".pvp-countdown")
const title = main.querySelector(".pvp-schedule-title")
const days = main.querySelector(".pvp-days")
const nowTag = daily ? "Today" : "Now"
// The rotation's order, its place in it ("Day 3") kept for when it's not the one on anymore
const cycle = [...main.querySelectorAll(".pvp-cycle li")].map((li) => ({ li, slot: li.querySelector(".pvp-slot"), text: li.querySelector(".pvp-slot").textContent }))

// Months from this one, or days from today
let offset = 0
// The start of the map on show as now
let shown = null

/**
 * @param {number} from
 * @returns {number} The first time a map comes up at or after `from`
 */
const nextStart = (from) => rotation.start + Math.ceil((from - rotation.start) / rotation.every) * rotation.every

/**
 * @param {string} text
 * @param {string} className
 * @returns {HTMLSpanElement}
 */
const span = (text, className) => Object.assign(document.createElement("span"), { textContent: text, className })

/**
 * A day or an hour's tile, on its map's banner.
 * @param {import("./utils/pvp.js").MapOn} on
 * @param {HTMLElement} when Its date or time
 * @param {number} time
 * @returns {HTMLLIElement}
 */
function tile(on, when, time) {
  const li = document.createElement("li")
  li.append(backdropOf(on.map), when)
  if (on.start === shown) {
    li.className = "is-now"
    li.append(span(nowTag, "pvp-tag"))
  } else if (on.end <= time) {
    li.className = "is-past"
  }
  li.append(mapName(on.map))
  return li
}

/**
 * The month `offset` months from this one, a tile a day with its reset's map. A day without a reset of its own, from a
 * clock change, shows the one after.
 * @param {number} time
 */
function fillMonth(time) {
  const today = new Date(time)
  const first = new Date(today.getFullYear(), today.getMonth() + offset, 1)
  title.textContent = formatEnGB(first, { month: "long", year: "numeric" })
  const length = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
  // Monday first, as the weekdays above are
  const blanks = Array.from({ length: (first.getDay() + 6) % 7 }, () => Object.assign(document.createElement("li"), { className: "is-blank" }))
  days.replaceChildren(...blanks, ...Array.from({ length }, (_, i) => {
    const day = new Date(first.getFullYear(), first.getMonth(), i + 1)
    const when = document.createElement("span")
    when.className = "pvp-when"
    when.append(span(String(i + 1), "pvp-day"), span(formatEnGB(day, { weekday: "short" }), "pvp-weekday"))
    return tile(at(nextStart(day.getTime())), when, time)
  }))
}

/**
 * The day `offset` days from today, a tile an hour.
 * @param {number} time
 */
function fillDay(time) {
  const today = new Date(time)
  const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset)
  const end = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1).getTime()
  const named = { [-1]: "Yesterday", 0: "Today", 1: "Tomorrow" }[offset]
  title.textContent = named ?? formatEnGB(day, { weekday: "long", day: "numeric", month: "long" })
  const tiles = []
  for (let start = nextStart(day.getTime()); start < end; start += rotation.every) {
    const when = document.createElement("time")
    when.className = "pvp-when"
    when.dateTime = new Date(start).toISOString()
    when.textContent = formatDate(new Date(start), new Date(start))
    tiles.push(tile(at(start), when, time))
  }
  days.replaceChildren(...tiles)
}

const fill = (time) => (daily ? fillMonth : fillDay)(time)

for (const button of main.querySelectorAll(".pvp-step")) {
  button.addEventListener("click", () => {
    offset += +button.dataset.step
    fill(Date.now())
  })
}

everyTick((time) => {
  const on = at(time)
  if (on.start !== shown) {
    shown = on.start
    fillNow(now, on.map)
    cycle.forEach(({ li, slot, text }, i) => {
      li.classList.toggle("is-now", i === on.slot)
      slot.textContent = i === on.slot ? nowTag : text
    })
    // The reset in the reader's own time
    for (const el of main.querySelectorAll(".pvp-reset")) el.textContent = formatDate(new Date(on.end), new Date(on.end))
    fill(time)
  }
  setText(countdown, formatCountdown(on.end - time))
  main.classList.remove("pvp-pending")
})
