import ROTATIONS from "../data/pvp.json" with { type: "json" }

// The PvP map rotations, as the duty finder opens them, from the game's data: see scripts/build/pvp.js

/**
 * @typedef {object} MapOn
 * @property {string} map
 * @property {number} slot Where in the rotation's order it is, from 0
 * @property {number} start
 * @property {number} end
 */

/**
 * @param {{ maps: string[], start: number, every: number }} rotation When maps[0] came up, and how long each lasts
 * @param {number} time
 * @returns {MapOn} The map on at `time`, and when it came up and goes
 */
function mapAt({ maps, start, every }, time) {
  const n = Math.floor((time - start) / every)
  const from = start + n * every
  const slot = ((n % maps.length) + maps.length) % maps.length
  return { map: maps[slot], slot, start: from, end: from + every }
}

/** Frontline's daily challenge, a map a day from the daily reset, round in this order. */
export const FRONTLINE = ROTATIONS.frontline

/** Crystalline Conflict's map, a new one every hour on the hour, round in this order. */
export const CRYSTALLINE_CONFLICT = ROTATIONS.crystallineConflict

/** @param {number} time */
export const frontlineAt = (time) => mapAt(FRONTLINE, time)

/** @param {number} time */
export const crystallineConflictAt = (time) => mapAt(CRYSTALLINE_CONFLICT, time)

/**
 * @param {string} map
 * @returns {string} The map's duty finder banner, from scripts/build/pvp.js
 */
export const bannerOf = (map) => `/images/pvp/${ROTATIONS.banners[map]}.webp`

/** Frontline's modes, in the order they first come up. A mode's place is its dot's color, see _pvp.scss. */
export const MODES = [...new Set(FRONTLINE.maps.map((map) => ROTATIONS.modes[map]))]

/**
 * @param {string} map
 * @returns {{ name: string, index: number } | null} A Frontline map's mode, null for Crystalline Conflict's
 */
export function modeOf(map) {
  const name = ROTATIONS.modes[map]
  return name ? { name, index: MODES.indexOf(name) } : null
}

/**
 * A mode's dot, before a Frontline map's name.
 * @param {string} map
 * @returns {HTMLElement[]} Empty for Crystalline Conflict's, to spread into an append
 */
function modeDot(map) {
  const mode = modeOf(map)
  return mode ? [Object.assign(document.createElement("i"), { className: `pvp-mode pvp-mode-${mode.index}`, title: mode.name })] : []
}

/**
 * @param {string} map
 * @returns {HTMLSpanElement} Its name, after its mode's dot when it has one
 */
export function mapName(map) {
  const span = document.createElement("span")
  span.className = "pvp-name"
  span.append(...modeDot(map), map)
  return span
}

/**
 * @param {string} map
 * @returns {HTMLImageElement} Its banner, behind a row or a day, see .pvp-backdrop
 */
export const backdropOf = (map) => Object.assign(document.createElement("img"), {
  className: "pvp-backdrop", src: bannerOf(map), alt: "", decoding: "async"
})

/**
 * Fills a .pvp-now box with the map on: its name, banner and a Frontline map's mode.
 * @param {HTMLElement} el
 * @param {string} map
 */
export function fillNow(el, map) {
  el.querySelector(".pvp-map").textContent = map
  el.querySelector(".pvp-banner").src = bannerOf(map)
  const mode = modeOf(map)
  el.querySelector(".pvp-now-mode")?.replaceChildren(...modeDot(map), mode?.name ?? "")
}
