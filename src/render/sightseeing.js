import {
  chip, detailTimer, etWindows, expansionOptions, facts, gameText, html, listRow, locationFacts, mapFigure, readData, readExpansions, slug
} from "./html.js"
import { ogImage } from "./og.js"
import { coordinates } from "../js/utils/map.js"

/**
 * @param {{ name: string }} vista
 * @returns {string} The name without the game's *italics* marks
 */
const vistaName = (vista) => vista.name.replaceAll("*", "")

const vistaUrl = (vista) => `/sightseeing/${slug(vistaName(vista))}/`

const vistaNumber = (vista) => `#${String(vista.number).padStart(3, "0")}`

/**
 * @param {{ quest: string, after: string[] }} unlock
 * @returns {string} "Sights of the First, which needs A and B first"
 */
const unlockText = (unlock) => `${unlock.quest}${unlock.after.length ? `, which needs ${unlock.after.join(" and ")} first` : ""}`

/**
 * @param {object} vista
 * @returns {import("./html.js").Html[]}
 */
const vistaTags = (vista) => [
  chip(vista.emote),
  ...(vista.weather ?? []).map((w) => chip(w, "chip-accent")),
  vista.level && chip(`Lv. ${vista.level}`),
  vista.unlock && chip(`Needs ${vista.unlock.quest}`, "chip-warning", `Unlocked by the quest ${unlockText(vista.unlock)}`)
]

/**
 * @param {object} vista
 * @returns {string} When it can be logged: "08:00 - 12:00 ET, in Fair Skies"
 */
function vistaWhen(vista) {
  const weather = vista.weather && `in ${vista.weather.join(" or ")}`
  if (vista.times) return [etWindows(vista.times), weather].filter(Boolean).join(", ")
  return weather ? `Any time, ${weather}` : "Any time, any weather"
}

/**
 * @param {string} key See listRow
 * @param {object} vista
 * @returns {import("./html.js").Html}
 */
const vistaRow = (key, vista) => listRow(key, vista, html`
    <div class="vista-name"><span class="vista-number">${vistaNumber(vista)}</span><strong><a href="${vistaUrl(vista)}">${vistaName(vista)}</a></strong></div>
    <div class="tags">${vistaTags(vista)}</div>`)

/**
 * @returns {{ rows: import("./html.js").Html, defaultExpansion: string, sources: string[] }} Every vista's row, for
 * /sightseeing/, and the expansion a first visit shows (see js/sightseeing.js), its data is preloaded
 */
export function vistaList() {
  const expansions = readExpansions("sightseeing")
  const rows = expansions.flatMap((e) => e.entries.map((vista, i) => vistaRow(`${e.file}:${i}`, vista)))
  const defaultExpansion = expansions[0].file
  return {
    rows: html`${rows}`,
    defaultExpansion,
    expansionOptions: expansionOptions(expansions, defaultExpansion),
    sources: ["js/data/sightseeing.json", "js/data/sightseeing"]
  }
}

/**
 * @param {object} vista
 * @param {string} direction "prev", "next"
 * @returns {import("./html.js").Html}
 */
const pagerLink = (vista, direction) => vista
  ? html`<a class="detail-${direction}-link" href="${vistaUrl(vista)}" rel="${direction}">${vistaNumber(vista)} ${vistaName(vista)}</a>`
  : html`<span></span>`

/** @returns {object[]} A page per vista, see [vista].data.js */
export function vistaPages() {
  const text = readData("sightseeing-text.json")

  return readExpansions("sightseeing").flatMap((expansion) => expansion.entries.map((vista, i, all) => {
    const name = vistaName(vista)
    const timed = vista.times || vista.weather
    const when = vistaWhen(vista)

    return {
      slug: slug(name),
      name,
      ...ogImage(vista),
      title: `${name}: FFXIV Sightseeing Log ${vistaNumber(vista)} - ffxiv.watch`,
      description: `FFXIV ${expansion.name} sightseeing log ${vistaNumber(vista)}, ${name}: use the ${vista.emote} emote in ${vista.zone}${vista.map ? ` at ${coordinates(vista.map)}` : ""}${timed ? `, ${when}` : ""}.`,
      content: html`
<section class="detail-card vista-card">
  <div class="detail-top">
    <header class="detail-header">
      <p class="detail-kicker">${expansion.name} sightseeing log ${vistaNumber(vista)}</p>
      <h1 class="detail-title">${name}</h1>
      <blockquote class="detail-quote">${gameText(text[vista.name].impression)}</blockquote>
      <div class="detail-text">${gameText(text[vista.name].description)}</div>
    </header>
    <div class="tags">${vistaTags(vista)}</div>
  </div>
  ${vista.map && mapFigure(vista, `${name}: use the ${vista.emote} emote here`)}
  ${detailTimer(timed ? JSON.stringify({ zone: vista.zone, times: vista.times, weather: vista.weather }) : null, when)}
  ${facts([["Emote", vista.emote], ...locationFacts(vista), ["Level", vista.level], ["Unlocked by", vista.unlock && unlockText(vista.unlock)]])}
</section>
<nav class="detail-pager" aria-label="Previous and next vista">
  ${pagerLink(all[i - 1], "prev")}
  ${pagerLink(all[i + 1], "next")}
</nav>`,
      sources: ["js/data/sightseeing-text.json", `js/data/sightseeing/${expansion.file}.json`]
    }
  }))
}
