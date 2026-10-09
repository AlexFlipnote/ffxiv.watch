import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { coordinates, mapPercent, mapSize } from "../js/utils/map.js"

/*
  Builds HTML for the pages at build time, imported by the pages' .data.js files and build.js.
  html`...` escapes what goes into it, unless it's HTML already: another html`...`, raw(), or a list of those.
*/

const DATA = path.join(path.dirname(fileURLToPath(import.meta.url)), "../js/data")

/** HTML that's safe to put in as-is. */
class Html {
  /** @param {string} value */
  constructor(value) {
    this.value = value
  }

  toString() {
    return this.value
  }
}

const ENTITIES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }

/**
 * @param {string} text
 * @returns {string}
 */
export const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (c) => ENTITIES[c])

const CHARACTERS = Object.fromEntries(Object.entries(ENTITIES).map(([c, entity]) => [entity, c]))

/**
 * @param {string} html What escapeHtml made
 * @returns {string} The text back
 */
export const unescapeHtml = (html) => html.replace(/&(amp|lt|gt|quot|#39);/g, (entity) => CHARACTERS[entity])

/**
 * @param {string} value
 * @returns {Html} Put in as it is, not escaped
 */
export const raw = (value) => new Html(value)

/**
 * @param {any} value
 * @returns {string} null, undefined and false are left out, lists are joined
 */
const toHtml = (value) => {
  if (value == null || value === false) return ""
  if (Array.isArray(value)) return value.map(toHtml).join("")
  return value instanceof Html ? value.value : escapeHtml(value)
}

/**
 * @param {TemplateStringsArray} strings
 * @param {...any} values
 * @returns {Html}
 */
export const html = (strings, ...values) => raw(strings.reduce((out, string, i) => out + toHtml(values[i - 1]) + string))

/**
 * @param {string} name
 * @returns {string} The name as a URL part: "Rak'tika Greatwood" -> "raktika-greatwood"
 */
export const slug = (name) => name
  .normalize("NFD")
  .replace(/[̀-ͯ'’*]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "")

/**
 * @param {string} file Relative to src/js/data/
 * @returns {any}
 */
export const readData = (file) => JSON.parse(fs.readFileSync(path.join(DATA, file), "utf8"))

/**
 * @param {string} name "gathering", "sightseeing"
 * @returns {{ name: string, file: string, entries: object[] }[]} Each expansion's entries, in the game's order
 */
export const readExpansions = (name) => readData(`${name}.json`).map((e) => ({ ...e, entries: readData(`${name}/${e.file}.json`) }))

/**
 * The expansion filter's options, in the page so the select has its width before the script runs: filled in later,
 * a phone wraps it onto a line of its own and the page under it jumps.
 * @param {{ name: string, file: string }[]} expansions From readExpansions
 * @param {string} selected The file a first visit shows
 * @returns {Html}
 */
export const expansionOptions = (expansions, selected) => html`<option value="">All</option>${expansions.map((e) =>
  html`<option value="${e.file}"${e.file === selected && html` selected`}>${e.name}</option>`)}`

/**
 * The game's text, which marks *italic* and **bold**, and breaks lines with \n.
 * @param {string} text
 * @returns {Html} A <p> per paragraph
 */
export function gameText(text) {
  return raw(text.split(/\n{2,}/).map((paragraph) => {
    const inline = escapeHtml(paragraph)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/\n/g, "<br>")
    return `<p>${inline}</p>`
  }).join(""))
}

/**
 * @param {string} text
 * @param {string} [className] Extra class, like "chip-gold"
 * @param {string} [title] Shown on hover
 * @returns {Html}
 */
export const chip = (text, className = "", title = null) =>
  html`<span class="${`chip ${className}`.trim()}"${title ? html` title="${title}"` : ""}>${text}</span>`

/**
 * @param {number} minutes ET minutes into the day
 * @returns {string} "08:00"
 */
const etClock = (minutes) => {
  const m = minutes % (24 * 60)
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`
}

/**
 * @param {[number, number][]} times [start, duration] in ET minutes
 * @returns {string} "08:00 - 10:00 and 20:00 - 22:00 ET"
 */
export const etWindows = (times) => `${times.map(([start, duration]) => `${etClock(start)} - ${etClock(start + duration)}`).join(" and ")} ET`

/**
 * Zone and spot on one line, for the first column on phones, where the location column is only the map icon.
 * @param {{ zone: string, spot?: string }} entry
 * @returns {Html}
 */
export const placeLine = (entry) =>
  html`<div class="place-line"><span class="zone">${entry.zone}</span>${entry.spot ? html`<span class="spot">${entry.spot}</span>` : ""}</div>`

/**
 * The location column: zone and spot, the whole cell opens the map (listing.js hooks up the click).
 * @param {{ zone: string, spot?: string, map?: object }} entry
 * @returns {Html}
 */
export const locationCell = (entry) => html`
  <td class="location-cell">
    <button class="location" title="Show on map"${entry.map ? "" : raw(" disabled")}>
      <span class="map-icon" aria-hidden="true"></span>
      <span class="place"><span class="zone">${entry.zone}</span><span class="spot">${entry.spot ?? ""}</span></span>
    </button>
  </td>`

/**
 * A table row, matched up with its entry by data-key when listing.js loads the data.
 * @param {string} key "dawntrail:12", the expansion's file and the entry's place in it
 * @param {{ zone: string, spot?: string, map?: object }} entry
 * @param {Html} content The first column, placeLine is added after it
 * @returns {Html}
 */
export const listRow = (key, entry, content) => html`
<tr data-key="${key}">
  <td>${content}${placeLine(entry)}</td>${locationCell(entry)}
</tr>`

/**
 * The map with a circle when it's an area or a pin when it's an exact spot, and the nearest aetheryte, placed like
 * js/utils/mapModal.js does.
 * It's a button that opens the same map bigger in the map dialog, with what data-map holds (see js/utils/mapZoom.js).
 * @param {{ zone: string, spot?: string, map: import("../js/utils/map.js").MapSpot, aetheryte?: { name: string, x: number, y: number } }} entry
 * @param {string} [note] Shown under the coordinates in the dialog
 * @returns {Html}
 */
export function mapFigure(entry, note) {
  const { map } = entry
  const at = (spot) => `left: ${mapPercent(map, spot.x).toFixed(2)}%; top: ${mapPercent(map, spot.y).toFixed(2)}%`
  const size = `${(2 * mapSize(map, map.radius)).toFixed(2)}%`
  const data = JSON.stringify({ zone: entry.zone, spot: entry.spot, map, aetheryte: entry.aetheryte, note })

  // Spans, as a button can't hold a div
  return html`
    <button class="map map-zoom" data-map="${data}" title="Show a bigger map">
      <img src="/images/maps/${map.image}.webp" alt="Map of ${entry.zone}, marked at ${coordinates(map)}" width="1024" height="1024" loading="lazy">
      ${map.radius
    ? html`<span class="map-area" style="${at(map)}; width: ${size}; height: ${size}"></span>`
    : html`<span class="map-pin" style="${at(map)}"></span>`}
      ${entry.aetheryte ? html`<span class="map-aetheryte" style="${at(entry.aetheryte)}"></span>` : ""}
    </button>`
}

/**
 * The facts under a detail page's timer.
 * @param {[string, any][]} rows [label, value], rows without a value are left out
 * @returns {Html}
 */
export const facts = (rows) => html`
  <dl class="detail-facts">
    ${rows.filter(([, value]) => value).map(([label, value]) => html`<dt>${label}</dt><dd>${value}</dd>`)}
  </dl>`

/**
 * The location rows of a detail page's facts.
 * @param {{ zone: string, spot?: string, map?: { x: number, y: number }, aetheryte?: { name: string } }} entry
 * @returns {[string, any][]}
 */
export const locationFacts = (entry) => [
  ["Zone", entry.zone],
  ["Spot", entry.spot],
  ["Coordinates", entry.map && coordinates(entry.map)],
  ["Aetheryte", entry.aetheryte?.name]
]

/**
 * A countdown to the next window, filled in by js/utils/detail.js, with the ET times written out under it.
 * @param {string | null} data JSON for the page's script to work the windows out from, null when it's always up
 * @param {string} when The times as text, for search engines and before the script runs
 * @returns {Html}
 */
export const detailTimer = (data, when) => data
  ? html`
    <div class="detail-timer" data-window="${data}">
      <div class="detail-next"><span class="detail-state">Next window</span> <strong class="detail-countdown"></strong></div>
      <p class="detail-when">${when}</p>
      <ol class="detail-upcoming" aria-label="Upcoming windows, in your time"></ol>
    </div>`
  : html`
    <div class="detail-timer detail-always">
      <div class="detail-next"><strong class="detail-countdown">${when}</strong></div>
    </div>`
