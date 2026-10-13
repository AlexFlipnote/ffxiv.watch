import "./utils/navbar.js"
import { crystallineConflictAt, frontlineAt } from "./utils/pvp.js"
import { everyTick, formatCountdown, setText, setTime } from "./utils/time.js"

/**
 * @typedef {object} Card
 * @property {(time: number) => { map: string, start: number, end: number }} at
 * @property {number} coming How many after the current one are listed, as many as the build's empty rows
 * @property {HTMLElement} map
 * @property {HTMLElement} countdown
 * @property {HTMLOListElement} upcoming
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
    coming: upcoming.children.length,
    map: el.querySelector(".pvp-map"),
    countdown: el.querySelector(".pvp-countdown"),
    upcoming,
    shown: null
  }
}

const cards = [card("pvp-frontline", frontlineAt), card("pvp-crystalline-conflict", crystallineConflictAt)]

/**
 * @param {Card} c
 * @param {{ map: string, end: number }} on The map on now
 */
function fill(c, on) {
  c.map.textContent = on.map
  let next = on.end
  c.upcoming.replaceChildren(...Array.from({ length: c.coming }, () => {
    const after = c.at(next)
    next = after.end
    const li = document.createElement("li")
    li.dataset.start = after.start
    li.append(document.createElement("time"), Object.assign(document.createElement("span"), { textContent: after.map }))
    return li
  }))
}

everyTick((now) => {
  for (const c of cards) {
    const on = c.at(now)
    if (on.start !== c.shown) {
      c.shown = on.start
      fill(c, on)
    }
    setText(c.countdown, formatCountdown(on.end - now))
    for (const li of c.upcoming.children) setTime(li.firstChild, new Date(+li.dataset.start), new Date(now))
  }
})
