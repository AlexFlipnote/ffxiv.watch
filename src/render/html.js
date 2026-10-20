import crypto from "crypto"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { ET_DAY_EARTH_MS } from "../js/utils/eorzea.js"
import { coordinates, mapPercent, mapSize } from "../js/utils/map.js"
import { windowsBetween } from "../js/utils/windows.js"
import { escapeHtml, html, Html, raw, slug, unescapeHtml } from "mothwing/html"

export { escapeHtml, html, Html, raw, slug, unescapeHtml }

/*
  Builds HTML for the pages at build time, imported by the pages' .data.js files.
  html`...`, from mothwing, escapes what goes into it, unless it's HTML already: another html`...`, raw(), or a list of those.
*/

const DATA = path.join(path.dirname(fileURLToPath(import.meta.url)), "../js/data")

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

const WEATHER_ZONES = new Set(readData("weather.json").map((z) => z.name))

/**
 * @param {string} zone
 * @returns {string | null} "/weather/middle-la-noscea/", null for a zone without a forecast, like The Diadem
 */
export const weatherUrl = (zone) => WEATHER_ZONES.has(zone) ? `/weather/${slug(zone)}/` : null

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

// The game's own icons, in fonts/ffxiv-icons.woff2
const XIV_ICONS = { collectable: "\ue03d" }

/**
 * @param {keyof XIV_ICONS} name
 * @param {string} [label] What a screen reader says, left out when the text next to it says it already
 * @returns {Html}
 */
export const xivIcon = (name, label = null) => label
  ? html`<span class="xiv" role="img" aria-label="${label}">${XIV_ICONS[name]}</span>`
  : html`<span class="xiv" aria-hidden="true">${XIV_ICONS[name]}</span>`

/**
 * @param {{ collectable?: boolean, scrip?: string }} entry An item or fish
 * @returns {Html | undefined} The game's collectable mark, in the colour of the name it follows
 */
export const collectableChip = (entry) => entry.collectable && html`<span class="gathering-collectable" title="${entry.scrip ? `Collectable, for ${entry.scrip}s` : "Collectable"}">${xivIcon("collectable", "Collectable")}</span>`

/**
 * What a collectable is worth at the scrip exchange, under the header's tags: in the facts next to it, it made them
 * taller than the header and left a gap under it.
 * @param {{ name: string, icon: number, tiers: [number, number][] } | undefined} scrips Its entry's in
 * gathering-items.json or fishing-items.json, [collectability, scrips] per tier
 * @returns {Html | undefined} Nothing when it isn't taken there
 */
export const scripCard = (scrips) => scrips && html`
    <div class="scrip-card">
      <img class="bait-icon" src="/images/game/${scrips.icon}.webp" alt="" width="24" height="24">
      <strong>${scrips.name}s</strong>${scrips.tiers.map(([at, count]) => html`
      <span class="scrip-tier" title="${count} scrips at ${at} collectability"><strong>${count}</strong> at ${at}</span>`)}
    </div>`

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

// A year of weather from a fixed day, so the numbers only change with the data
const ODDS_FROM = Date.UTC(2026, 0, 1)
const ODDS_YEAR = 365 * 24 * 60 * 60 * 1000
// Enough for one that only needs a time, it's the same every ET day
const ODDS_DAYS = 20

/**
 * @param {number} ms
 * @returns {[number, string]} Rounded to what's worth knowing at that length: [85, "second"], [6, "minute"], [1.5, "hour"]
 */
function roughly(ms) {
  const minutes = ms / 60000
  if (minutes < 2) return [Math.round(minutes * 12) * 5, "second"]
  if (minutes < 90) return [Math.round(minutes), "minute"]
  if (minutes < 10 * 60) return [Math.round(minutes / 30) / 2, "hour"]
  if (minutes < 36 * 60) return [Math.round(minutes / 60), "hour"]
  return [Math.round(minutes / 1440), "day"]
}

/** @returns {string} "6 minutes" */
const spanText = (ms) => {
  const [n, unit] = roughly(ms)
  return `${n} ${unit}${n === 1 ? "" : "s"}`
}

/** @returns {string} "a 6-minute", "an 8-minute" */
const lengthText = (ms) => {
  const [n, unit] = roughly(ms)
  return `${/^(8|1[18](\D|$))/.test(n) ? "an" : "a"} ${n}-${unit}`
}

/** @returns {number} The mean, of a list that isn't empty */
const mean = (list) => list.reduce((a, b) => a + b, 0) / list.length

/** @returns {boolean} All within a second of each other */
const even = (list) => Math.max(...list) - Math.min(...list) < 1000

/**
 * How often it's up, in Earth time, which only the timer shows otherwise. Worked out from a year of its windows when it
 * needs a weather, the forecast is the same for everyone.
 * @param {import("../js/utils/windows.js").Timed} entry Up only at some times or in some weather
 * @param {string} verb "Up", "Bites"
 * @returns {string | null} "Up 8.3% of the time: a 6-minute window every 35 minutes.", null when it never comes up
 */
export function howOften(entry, verb) {
  const weather = Boolean(entry.weather || entry.previousWeather)
  const from = weather ? ODDS_FROM : Math.ceil(ODDS_FROM / ET_DAY_EARTH_MS) * ET_DAY_EARTH_MS
  const to = from + (weather ? ODDS_YEAR : ODDS_DAYS * ET_DAY_EARTH_MS)
  const windows = windowsBetween(entry, from, to)
  if (!windows.length) return null

  const up = windows.reduce((sum, w) => sum + Math.min(w.end, to) - w.start, 0) / (to - from)
  const percent = up < .01 ? "under 1%" : `${weather ? "about " : ""}${up < .1 ? Math.round(up * 1000) / 10 : Math.round(up * 100)}%`
  if (windows.length < 3) return `${verb} ${percent} of the time, only ${windows.length === 1 ? "once" : "twice"} in a year of weather.`

  const lengths = windows.map((w) => w.end - w.start)
  const intervals = windows.slice(1).map((w, i) => w.start - windows[i].start)
  const average = even(lengths) && even(intervals) ? "" : "on average "
  const text = `${verb} ${percent} of the time: ${average}${lengthText(mean(lengths))} window every ${spanText(mean(intervals))}.`
  if (!weather) return text

  const longest = Math.max(...windows.slice(1).map((w, i) => w.start - windows[i].end))
  return `${text} The longest wait in a year of weather is ${spanText(longest)}.`
}

/**
 * Zone and spot, written once: against the map icon on a computer, a line under the chips on a phone (see _listing.scss).
 * @param {{ zone: string, spot?: string }} entry
 * @returns {Html}
 */
const place = (entry) =>
  html`<div class="place"><span class="zone">${entry.zone}</span>${entry.spot ? html`<span class="spot">${entry.spot}</span>` : ""}</div>`

/**
 * What a detail page's alarm is for, by the same id as its list row's.
 * @param {string} id "fish:4869", "node:974", "vista:112"
 * @param {string} name
 * @param {{ zone: string, spot?: string }} entry
 * @param {number} icon Its game icon
 * @returns {{ id: string, name: string, place: string, icon: number }}
 */
export const alarmFor = (id, name, entry, icon) => ({ id, name, place: [entry.zone, entry.spot].filter(Boolean).join(", "), icon })

/**
 * The alarm bell, off until the script knows what it's for.
 * @param {{ id: string, name: string, place: string, icon: number } | null} [alarm] On a detail page, what it's for
 * @param {number | null} [icon] In a list's row, its game icon
 * @returns {Html}
 */
export const alarmButton = (alarm = null, icon = null) =>
  html`<button class="alarm-bell" disabled${alarm && html` data-alarm="${JSON.stringify(alarm)}"`}${icon && html` data-icon="${icon}"`}></button>`

/**
 * The last column, the alarm bell and the map. The map links to its image, listing.js opens it in the map dialog
 * instead.
 * @param {{ zone: string, map?: { image: string } }} entry
 * @param {number | null} icon See alarmButton
 * @returns {Html}
 */
const locationCell = (entry, icon) => html`
  <td class="location-cell"><div class="row-actions">${alarmButton(null, icon)}${entry.map ? html`<a class="location" href="/images/maps/${entry.map.image}.webp" aria-label="Show ${entry.zone} on map" title="Show on map"></a>` : ""}</div></td>`

/**
 * A table row, matched up with its entry by data-key when listing.js loads the data. Lists have thousands, so each
 * says things once.
 * @param {string} key "dawntrail:974", see listRows
 * @param {{ zone: string, spot?: string, map?: object }} entry
 * @param {Html} content The first column, the place is added next to it
 * @returns {Html}
 */
export const listRow = (key, entry, content, icon = null) => html`
<tr data-key="${key}">
  <td><div class="row-body"><div class="row-main">${content}</div>${place(entry)}</div></td>${locationCell(entry, icon)}
</tr>`

/**
 * Every entry's row, keyed by the expansion's file and the entry's id, not its place in the list: a page cached from
 * before a deploy still finds the right rows in the newer data. listing.js keys the data with the same `idOf`.
 *
 * Only the expansion a first visit shows has its rows in the page, all of fishing's came to over a megabyte, past what
 * Bing reads of a page. The others are a file each in /rows/, which listing.js fetches with that expansion's data.
 * Search engines get a plain link to every entry instead.
 * @param {string} list "fishing", the rows' folder in /rows/
 * @param {{ file: string, entries: object[] }[]} expansions From readExpansions
 * @param {string} shown The file of the expansion whose rows are in the page
 * @param {(entry: object) => number} idOf
 * @param {(key: string, entry: object) => Html} row
 * @param {(entry: object) => { url: string, name: string }[]} linksOf The pages an entry's row links to
 * @returns {{ rows: Html, rowFiles: string, links: Html, files: Record<string, string> }} The page's rows, the other
 * expansions' files for the tbody's data-rows, as JSON, the links, and the files to write, by their path in dist/
 */
export function listRows(list, expansions, shown, idOf, row, linksOf) {
  const seen = new Set()
  const rowsOf = (e) => html`${e.entries.map((entry) => {
    const key = `${e.file}:${idOf(entry)}`
    if (seen.has(key)) throw new Error(`js/data: two entries are both "${key}"`)
    seen.add(key)
    return row(key, entry)
  })}`

  const files = {}
  const rowFiles = {}
  let rows = null
  for (const e of expansions) {
    if (e.file === shown) {
      rows = rowsOf(e)
      continue
    }
    const content = String(rowsOf(e)).trim() + "\n"
    files[`rows/${list}/${e.file}.html`] = content
    // A new deploy's rows are fetched fresh, like the scripts' ?v=hash
    rowFiles[e.file] = `/rows/${list}/${e.file}.html?v=${crypto.createHash("md5").update(content).digest("hex").slice(0, 8)}`
  }

  // An item at several nodes is linked once
  const links = new Map(expansions.flatMap((e) => e.entries.flatMap(linksOf)).map((link) => [link.url, link.name]))
  return {
    rows,
    rowFiles: JSON.stringify(rowFiles),
    links: html`${[...links].map(([url, name]) => html`<a href="${url}">${name}</a>\n`)}`,
    files
  }
}

/**
 * The map with a circle when it's an area or a pin when it's an exact spot, and the nearest aetheryte, placed like
 * js/utils/mapModal.js does.
 * It links to the map image, js/utils/detail.js opens it bigger in the map dialog instead, with what data-map holds.
 * @param {{ zone: string, spot?: string, map: import("../js/utils/map.js").MapSpot, aetheryte?: { name: string, x: number, y: number } }} entry
 * @param {string} [note] Shown under the coordinates in the dialog
 * @param {boolean} [lazy] Further down the page, loaded once it's scrolled near. An item at many nodes has a map each
 * @returns {Html}
 */
export function mapFigure(entry, note, lazy) {
  const { map } = entry
  const at = (spot) => `left: ${mapPercent(map, spot.x).toFixed(2)}%; top: ${mapPercent(map, spot.y).toFixed(2)}%`
  const size = `${(2 * mapSize(map, map.radius)).toFixed(2)}%`
  const data = JSON.stringify({ zone: entry.zone, spot: entry.spot, map, aetheryte: entry.aetheryte, note })

  return html`
    <a class="map map-zoom" href="/images/maps/${map.image}.webp" data-map="${data}" title="Show a bigger map">
      <img src="/images/maps/${map.image}.webp" alt="Map of ${entry.zone}, marked at ${coordinates(map)}" width="1024" height="1024"${lazy && html` loading="lazy"`}>
      ${map.radius ? html`<span class="map-area" style="${at(map)}; width: ${size}; height: ${size}"></span>` : ""}
      ${entry.aetheryte ? html`<span class="map-aetheryte" style="${at(entry.aetheryte)}"></span>` : ""}
      ${map.radius ? "" : html`<span class="map-pin" style="${at(map)}"></span>`}
    </a>`
}

/**
 * A check to mark an entry complete, js/utils/done.js hooks it up.
 * @param {number} id
 * @param {string} [name] What it's for, for the toast and its label. Left out in a list's row, which has the name
 * next to it already (a list has thousands). The label, title and pressed state are set by the script, the check is
 * hidden without it anyway. The tick is drawn by the CSS for the same reason
 * @returns {Html}
 */
export const doneButton = (id, name = null) =>
  html`<button class="done-check" data-done-id="${id}"${name && html` data-name="${name}"`}></button>`

/**
 * Links to the entries before and after this one, at the bottom of a detail page.
 * @param {{ url: string, text: string } | null} prev
 * @param {{ url: string, text: string } | null} next
 * @param {string} label "Previous and next vista"
 * @returns {Html}
 */
export const pager = (prev, next, label) => html`
<nav class="detail-pager" aria-label="${label}">
  ${[[prev, "prev"], [next, "next"]].map(([to, direction]) => to
    ? html`<a class="detail-${direction}-link" href="${to.url}" rel="${direction}">${to.text}</a>`
    : html`<span></span>`)}
</nav>`

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
  ["Zone", weatherUrl(entry.zone) ? html`<a href="${weatherUrl(entry.zone)}">${entry.zone}</a>` : entry.zone],
  ["Spot", entry.spot],
  ["Coordinates", entry.map && coordinates(entry.map)],
  ["Aetheryte", entry.aetheryte?.name]
]

// How many windows the list under the countdown shows, the current one included. js/utils/detail.js counts the rows
const UPCOMING = 5

/**
 * A countdown to the next window, filled in by js/utils/detail.js, with the ET times written out under it.
 * @param {string | null} data JSON for the page's script to work the windows out from, null when it's always up
 * @param {string} when The times as text, for search engines and before the script runs
 * @param {string | null} [often] How often it's up, see howOften, under the windows
 * @param {{ id: string, name: string, place: string }} [alarm] What its alarm is for, see alarmFor
 * @returns {Html}
 */
export const detailTimer = (data, when, often, alarm = null) => data
  ? html`
    <div class="detail-timer detail-pending" data-window="${data}">
      <div class="detail-next"><span class="detail-state">Next window</span> <strong class="detail-countdown"></strong>${alarm && alarmButton(alarm)}</div>
      <p class="detail-when">${when}</p>
      <ol class="detail-upcoming" aria-label="Upcoming windows, in your time">${Array.from({ length: UPCOMING }, () => html`<li>&nbsp;</li>`)}</ol>${often && html`
      <p class="detail-often">${often}</p>`}
    </div>`
  : html`
    <div class="detail-timer detail-always">
      <div class="detail-next"><strong class="detail-countdown">${when}</strong></div>
    </div>`
