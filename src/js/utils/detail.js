import { formatCountdown, setTime } from "./timers.js"
import { setText } from "./tick.js"

// How many windows the list under the countdown shows, the current one included
const UPCOMING = 5

/**
 * @typedef {object} WindowSource What a timer on a detail page works its windows out with
 * @property {(now: number) => import("./listing.js").Window} current Called every tick, so keep it cheap
 * @property {(from: number) => import("./listing.js").Window} after The next window ending after `from`, called
 * only when the list needs redrawing
 */

/**
 * Wires up the .detail-timer elements from src/render/html.js: a countdown to the next window, and the next few in the
 * visitor's time.
 * @param {(data: object) => WindowSource} windowsOf Gets the element's data-window, parsed
 * @returns {(now: number) => void} Redraws them, call it every tick
 */
export function detailTimers(windowsOf) {
  const timers = [...document.querySelectorAll(".detail-timer[data-window]")].map((el) => ({
    el,
    ...windowsOf(JSON.parse(el.dataset.window)),
    state: el.querySelector(".detail-state"),
    countdown: el.querySelector(".detail-countdown"),
    list: el.querySelector(".detail-upcoming"),
    // The windows listed, redrawn when the first one is over
    listed: []
  }))

  /**
   * @param {object} timer
   * @param {import("./listing.js").Window} first The window up now or next, the list starts with it
   */
  function relist(timer, first) {
    timer.listed = [first]
    while (timer.listed.length < UPCOMING) {
      const next = timer.after(timer.listed.at(-1).end)
      if (!next) break
      timer.listed.push(next)
    }

    timer.list.replaceChildren(...timer.listed.map(() => {
      const li = document.createElement("li")
      li.append(document.createElement("time"), " - ", document.createElement("time"))
      return li
    }))
  }

  return (now) => {
    const date = new Date(now)
    for (const timer of timers) {
      const w = timer.current(now)
      if (!w) {
        timer.el.classList.remove("detail-open")
        setText(timer.state, "Nothing in the next 30 days")
        setText(timer.countdown, "")
        if (timer.listed.length) {
          timer.listed = []
          timer.list.replaceChildren()
        }
        continue
      }

      timer.el.classList.toggle("detail-open", w.open)
      setText(timer.state, w.open ? "Up now, ends in" : "Up in")
      setText(timer.countdown, formatCountdown((w.open ? w.end : w.start) - now))

      if (timer.listed[0]?.start !== w.start) relist(timer, w)
      timer.listed.forEach((listed, i) => {
        const [from, to] = timer.list.children[i].querySelectorAll("time")
        const start = new Date(listed.start)
        setTime(from, start, date)
        setTime(to, new Date(listed.end), date, { zone: true, from: start })
      })
    }
  }
}
