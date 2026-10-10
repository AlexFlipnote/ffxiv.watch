import {
  chip, collectableChip, detailTimer, doneButton, etWindows, expansionOptions, facts, gameText, html, listRow, listRows, locationFacts,
  mapFigure, pager, readData, readExpansions, slug, xivIcon
} from "./html.js"
import { ogIcon } from "./og.js"
import { coordinates } from "../js/utils/map.js"

const DATA_SOURCES = ["js/data/fishing.json", "js/data/fishing"]

/**
 * @param {{ name: string }} fish
 * @returns {string} "/fishing/cinder-surprise/"
 */
const fishUrl = (fish) => `/fishing/${slug(fish.name)}/`

/**
 * @param {number} id
 * @param {object} info fishing-items.json
 * @returns {import("./html.js").Html} Its icon, small, for the bait
 */
const baitIcon = (id, info) => html`<img class="bait-icon" src="/images/items/${info[id].icon}.webp" alt="" width="24" height="24">`

/** @returns {boolean} Bites only at some times or in some weather */
const isTimed = (fish) => Boolean(fish.times || fish.weather || fish.previousWeather)

/** @returns {string} "Rain or Showers" */
const either = (list) => list.join(" or ")

/**
 * @param {object} fish
 * @returns {string | null} "Fog", "Fog after Clouds" when it needs a weather before, null when any weather works
 */
function weatherText(fish) {
  if (!fish.weather && !fish.previousWeather) return null
  if (!fish.previousWeather) return either(fish.weather)
  return `${fish.weather ? either(fish.weather) : "Any weather"} after ${either(fish.previousWeather)}`
}

/**
 * @param {object} fish
 * @returns {string} When it bites, after "Bites": "08:00 - 10:00 ET, in Fog after Clouds", "any time"
 */
function whenText(fish) {
  const weather = fish.weather && `in ${either(fish.weather)}`
  const previous = fish.previousWeather && `after ${either(fish.previousWeather)}`
  const conditions = [weather, previous].filter(Boolean).join(" ")
  if (fish.times) return [etWindows(fish.times), conditions].filter(Boolean).join(", ")
  return conditions ? `any time, ${conditions}` : "any time"
}

/**
 * @param {number} patch
 * @returns {string} "Patch 5.0", "Patch 6.55"
 */
const patchText = (patch) => `Patch ${Number.isInteger(patch) ? patch.toFixed(1) : patch}`

/** @returns {string} "Glowworm > Wahoo", a step that can be one of several as "A/B" */
const baitText = (fish) => fish.bait.map((step) => step.map((b) => b.name).join("/")).join(" > ")

/** @returns {string} "3x Little Thalaos and 2x Wahoo" */
const predatorText = (fish) => fish.predators.map((p) => `${p.count}x ${p.name}`).join(" and ")

/**
 * @param {number} seconds
 * @returns {string} "5 minutes 50 seconds"
 */
function duration(seconds) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return [m && `${m} minute${m === 1 ? "" : "s"}`, s && `${s} second${s === 1 ? "" : "s"}`].filter(Boolean).join(" ")
}

/**
 * @param {object} fish
 * @returns {import("./html.js").Html[]}
 */
const fishTags = (fish) => [
  fish.big && chip("Big fish", "chip-gold"),
  chip(`${fish.method === "Spearfishing" ? "Spearfishing" : "Fisher"} Lv. ${fish.level}`),
  weatherText(fish) && chip(weatherText(fish), "chip-accent", `Bites ${whenText(fish)}`),
  fish.predators && chip(`Intuition: ${predatorText(fish)}`, "chip-warning", `Catch ${predatorText(fish)} first`),
  fish.folklore && chip(fish.folklore)
]

/**
 * @param {string} key See listRow
 * @param {object} fish
 * @returns {import("./html.js").Html}
 */
const fishRow = (key, fish) => listRow(key, fish, html`
    <div class="gathering-items"><span class="done-entry">${doneButton(fish.id, fish.name)}<a class="gathering-item" href="${fishUrl(fish)}"><strong>${fish.name}</strong>${collectableChip(fish)}</a></span></div>
    <div class="tags">${fishTags(fish)}</div>`)

/**
 * @returns {{ rows: import("./html.js").Html, defaultExpansion: string, sources: string[] }} Every fish's row, for
 * /fishing/, and the expansion a first visit shows, its data is preloaded
 */
export function fishList() {
  const expansions = readExpansions("fishing")
  const rows = listRows(expansions, (fish) => fish.id, fishRow)
  const defaultExpansion = expansions.at(-1).file
  return { rows, defaultExpansion, expansionOptions: expansionOptions(expansions, defaultExpansion), sources: DATA_SOURCES }
}

/**
 * @param {object} fish
 * @returns {{ title: string, description: string }}
 */
function fishSeo(fish) {
  const timed = isTimed(fish)
  const where = `${fish.spot ? `${fish.spot}, ` : ""}${fish.zone}${fish.map ? ` (${coordinates(fish.map)})` : ""}`
  const extras = [fish.bait ? `, with ${baitText(fish)}` : "", timed ? `, bites ${whenText(fish)}` : ""]
  const text = extras.reduce((out, extra) => (out + extra).length < 159 ? out + extra : out, `Where to catch ${fish.name} in FFXIV: ${where}`)
  return {
    title: `${fish.name}: FFXIV ${fish.big ? "Big Fish" : "Fish"} Location${timed ? " & Times" : ""} - ffxiv.watch`,
    description: `${text}.`
  }
}

/**
 * @param {object} fish
 * @param {Set<number>} paged Fish with a page of their own
 * @param {object} info fishing-items.json
 * @returns {import("./html.js").Html} The catch path, each step with its icon, a fish with a page linked
 */
const baitPath = (fish, paged, info) => html`<span class="bait-path">${fish.bait.map((step, i) => html`${i > 0 && html`<span class="bait-arrow" role="img" aria-label="then">›</span>`}${step.map((b, j) => html`${j > 0 && " or "}<span class="bait-step">${baitIcon(b.id, info)}${paged.has(b.id) ? html`<a href="${fishUrl(b)}">${b.name}</a>` : b.name}</span>`)}`)}</span>`

/**
 * @param {object} fish
 * @param {Set<number>} paged
 * @param {object} info
 * @param {string} expansion
 * @returns {import("./html.js").Html} The header, with how to catch it next to it
 */
const fishIntro = (fish, paged, info, expansion) => html`
<div class="item-intro">
  <header class="detail-header">
    <div class="item-heading">
      <img class="item-icon" src="/images/items/${info[fish.id].icon}.webp" alt="${fish.name} icon" width="44" height="44">
      <div>
        <p class="detail-kicker">${[
    fish.big ? "Big fish" : fish.method === "Spearfishing" ? "Spearfishing" : "Fish",
    info[fish.id].category,
    `Item level ${info[fish.id].level}`,
    fish.patch && patchText(fish.patch)
  ].filter(Boolean).join(" · ")}</p>
        <div class="detail-title-row"><h1 class="detail-title">${fish.name}</h1>${doneButton(fish.id, fish.name)}</div>
      </div>
    </div>
    <div class="detail-text">${gameText(info[fish.id].description ?? "")}</div>
    <div class="tags">${fishTags(fish)}${fish.collectable && chip(html`${xivIcon("collectable")} Collectable`, "chip-accent")}${chip(expansion)}</div>
  </header>
  <section class="item-about">
    <h2 class="detail-subtitle">How to catch it</h2>
    ${facts([
    ["Bait", fish.bait && baitPath(fish, paged, info)],
    ["Gig", fish.gig],
    ["Hookset", fish.hookset],
    ["Tug", fish.tug && fish.tug[0].toUpperCase() + fish.tug.slice(1)],
    ["Lure", fish.lure],
    ["Intuition", fish.predators && html`Catch ${fish.predators.map((p, i) => html`${i > 0 && " and "}${p.count}x ${paged.has(p.id) ? html`<a href="${fishUrl(p)}">${p.name}</a>` : p.name}`)} first${fish.intuition && `, it lasts ${duration(fish.intuition)}`}`],
    ["Fish Eyes", fish.fishEyes && "Lets it bite outside its times"],
    ["Snagging", fish.snagging && "Needed"],
    ["Folklore", fish.folklore]
  ])}
  </section>
</div>`

/**
 * Where it bites: its timer and spot, next to the map.
 * @param {object} fish
 * @param {object} info fishing-items.json
 * @param {object[]} others The other fish at its spot
 * @returns {import("./html.js").Html}
 */
function spotCard(fish, info, others) {
  const timed = isTimed(fish)
  const data = timed ? JSON.stringify({ zone: fish.zone, times: fish.times, weather: fish.weather, previousWeather: fish.previousWeather }) : null
  return html`
<section class="detail-card gathering-node">
  ${fish.map && mapFigure(fish, fish.name)}
  ${detailTimer(data, timed ? `Bites ${whenText(fish)}` : "Bites any time")}
  ${facts([
    ...locationFacts(fish),
    ["Also bites at", info[fish.id].alsoAt && html`<span class="detail-list">${info[fish.id].alsoAt.map((s) => html`<span>${s}</span>`)}</span>`],
    ["Also here", others.length && html`<span class="detail-list">${others.map((f) => html`<span><a href="${fishUrl(f)}">${f.name}</a></span>`)}</span>`]
  ])}
</section>`
}

/** @returns {object[]} A page per fish, see [fish].data.js */
export function fishPages() {
  const info = readData("fishing-items.json")
  const expansions = readExpansions("fishing")
  const paged = new Set(expansions.flatMap((e) => e.entries.map((f) => f.id)))
  // In the list's order, by zone, so the pager goes to the fish nearby
  const all = expansions.flatMap((expansion) => expansion.entries.map((fish) => ({ fish, expansion })))
  const atSpot = Map.groupBy(all.filter((e) => e.fish.spot), (e) => `${e.fish.zone}|${e.fish.spot}`)
  const pagerTo = (entry) => entry && { url: fishUrl(entry.fish), text: entry.fish.name }

  return all.map(({ fish, expansion }, i) => ({
    slug: slug(fish.name),
    name: fish.name,
    ...fishSeo(fish),
    ...ogIcon(info[fish.id].icon, fish.name),
    content: html`${fishIntro(fish, paged, info, expansion.name)}${spotCard(fish, info, (atSpot.get(`${fish.zone}|${fish.spot}`) ?? []).map((e) => e.fish).filter((f) => f !== fish))}
${pager(pagerTo(all[i - 1]), pagerTo(all[i + 1]), "Previous and next fish")}`,
    sources: ["js/data/fishing-items.json", ...new Set([all[i - 1], all[i], all[i + 1]].filter(Boolean).map((e) => `js/data/fishing/${e.expansion.file}.json`))]
  }))
}
