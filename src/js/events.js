import "./utils/navbar.js"
import { everyTick, formatCountdown, setText, setTime } from "./utils/time.js"

const now = document.querySelector("#events-now .events-grid")
const soon = document.querySelector("#events-soon .events-grid")
const empty = document.getElementById("events-empty")

/**
 * @typedef {object} Card
 * @property {HTMLElement} el
 * @property {number} start
 * @property {number | null} end Null for one that runs until a patch
 * @property {string} until That patch
 * @property {HTMLTimeElement} startTime
 * @property {HTMLTimeElement | null} endTime
 * @property {HTMLElement} state
 * @property {HTMLElement} countdown
 */

/** @type {Card[]} */
const cards = [...document.querySelectorAll(".event-card")].map((el) => {
  const [startTime, endTime = null] = el.querySelectorAll(".event-when time")
  return {
    el,
    start: +el.dataset.start,
    end: el.dataset.end ? +el.dataset.end : null,
    until: el.dataset.until,
    startTime,
    endTime,
    state: el.querySelector(".event-countdown .detail-state"),
    countdown: el.querySelector(".event-countdown strong")
  }
})

everyTick((ms) => {
  const date = new Date(ms)
  for (const card of cards) {
    if (card.end !== null && card.end <= ms) {
      card.el.remove()
      continue
    }
    const started = card.start <= ms
    // The page was built a while ago, an event may have started since
    if (started && card.el.parentElement !== now) now.append(card.el)

    setTime(card.startTime, new Date(card.start), date)
    if (card.endTime) setTime(card.endTime, new Date(card.end), date)
    if (!started) {
      setText(card.state, "Starts in")
      setText(card.countdown, formatCountdown(card.start - ms))
    } else if (card.end === null) {
      setText(card.state, "Until")
      setText(card.countdown, `Patch ${card.until}`)
    } else {
      setText(card.state, "Ends in")
      setText(card.countdown, formatCountdown(card.end - ms))
    }
  }
  now.closest("section").hidden = !now.children.length
  soon.closest("section").hidden = !soon.children.length
  empty.hidden = !!(now.children.length || soon.children.length)
  // The build's countdowns are replaced, see eventCard in src/pages/events/index.data.js
  document.querySelector(".events-pending")?.classList.remove("events-pending")
})
