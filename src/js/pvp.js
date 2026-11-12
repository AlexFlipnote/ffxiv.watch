import "./utils/navbar.js"
import { crystallineConflictAt, fillNow, frontlineAt, mapName, backdropOf } from "./utils/pvp.js"
import { everyTick, formatCountdown, setText, setTime } from "./utils/time.js"

/**
 * @typedef {object} Card
 * @property {(time: number) => { map: string, start: number, end: number }} at
 * @property {HTMLElement} now
 * @property {HTMLElement} countdown
 * @property {HTMLOListElement} upcoming
 * @property {number} size How many come after, as many as the build's empty rows
 * @property {number | null} shown The start of the map on show
 */

/**
 * @param {string} id
 * @param {Card["at"]} at
 * @returns {Card}
 */
function card(id, at) {
  const el = document.getElementById(id)
  const upcoming = el.querySelector(".pvp-upcoming")
  return {
    at,
    now: el.querySelector(".pvp-now"),
    countdown: el.querySelector(".pvp-countdown"),
    upcoming,
    size: upcoming.children.length,
    shown: null
  }
}

const cards = [card("pvp-frontline", frontlineAt), card("pvp-crystalline-conflict", crystallineConflictAt)]

/**
 * The map on now and the ones after it, repeats and all, one row each so the cards' lists line up.
 * @param {Card} c
 * @param {{ map: string, end: number }} on The map on now
 */
function fill(c, on) {
  fillNow(c.now, on.map)
  const rows = []
  for (let after = c.at(on.end); rows.length < c.size; after = c.at(after.end)) {
    const li = document.createElement("li")
    li.dataset.start = after.start
    li.append(backdropOf(after.map), document.createElement("time"), mapName(after.map))
    rows.push(li)
  }
  c.upcoming.replaceChildren(...rows)
}

everyTick((now) => {
  for (const c of cards) {
    const on = c.at(now)
    if (on.start !== c.shown) {
      c.shown = on.start
      fill(c, on)
    }
    setText(c.countdown, formatCountdown(on.end - now))
    for (const li of c.upcoming.children) setTime(li.querySelector("time"), new Date(+li.dataset.start), new Date(now))
  }
  document.querySelector(".pvp-pending")?.classList.remove("pvp-pending")
})
