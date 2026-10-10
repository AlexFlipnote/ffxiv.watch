import {
  chip, detailTimer, etWindows, expansionOptions, facts, gameText, html, listRow, listRows, locationFacts, mapFigure, pager, readData,
  readExpansions, slug
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
 * @param {{ quest: string, after: string[], vistas?: number }} unlock
 * @returns {string} "Sights of the First, which needs A and B first"
 */
function unlockText(unlock) {
  const needs = [...unlock.after, unlock.vistas && `vistas #001 to ${vistaNumber({ number: unlock.vistas })}`].filter(Boolean)
  return `${unlock.quest}${needs.length ? `, which needs ${needs.join(" and ")} first` : ""}`
}

/**
 * @param {object} vista
 * @returns {import("./html.js").Html[]}
 */
const vistaTags = (vista) => [
  chip(vista.emote),
  ...(vista.weather ?? []).map((w) => chip(w, "chip-accent")),
  vista.level && chip(`Lv. ${vista.level}`),
  vista.unlock && chip(`Quest: ${vista.unlock.quest}`, "chip-warning", `Unlocked by the quest ${unlockText(vista.unlock)}`)
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
 * /sightseeing/, and the expansion a first visit shows, its data is preloaded
 */
export function vistaList() {
  const expansions = readExpansions("sightseeing")
  const rows = listRows(expansions, (vista) => vista.number, vistaRow)
  // A Realm Reborn's are the only ones with times and weather
  const defaultExpansion = expansions[0].file
  return {
    rows,
    defaultExpansion,
    expansionOptions: expansionOptions(expansions, defaultExpansion),
    sources: ["js/data/sightseeing.json", "js/data/sightseeing"]
  }
}

/**
 * @param {{ vista: object, expansion: { name: string } } | undefined} entry
 * @param {{ name: string }} current The page's expansion
 * @returns {{ url: string, text: string } | null} Where the pager links to, the expansion's name when it's another one's
 */
const pagerTo = (entry, current) => entry && {
  url: vistaUrl(entry.vista),
  text: `${entry.expansion === current ? "" : `${entry.expansion.name} `}${vistaNumber(entry.vista)} ${vistaName(entry.vista)}`
}

/** @returns {object[]} A page per vista, see [vista].data.js */
export function vistaPages() {
  const text = readData("sightseeing-text.json")

  // One list, so the pager carries on into the next expansion
  const all = readExpansions("sightseeing").flatMap((expansion) => expansion.entries.map((vista) => ({ vista, expansion })))

  return all.map(({ vista, expansion }, i) => {
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
${pager(pagerTo(all[i - 1], expansion), pagerTo(all[i + 1], expansion), "Previous and next vista")}`,
      sources: ["js/data/sightseeing-text.json", ...new Set([all[i - 1], all[i], all[i + 1]].filter(Boolean).map((e) => `js/data/sightseeing/${e.expansion.file}.json`))]
    }
  })
}
