import {
  chip, detailTimer, etWindows, expansionOptions, facts, gameText,
  html, listRow, listRows, locationFacts, mapFigure, readData, readExpansions, slug
} from "./html.js"
import { ogIcon } from "./og.js"
import { coordinates } from "../js/utils/map.js"

// Item ids below this are the shards, crystals and clusters, found at hundreds of nodes, so they get no page
const FIRST_PAGED_ITEM = 20
const TYPE_COLORS = { Legendary: "chip-gold", Ephemeral: "chip-accent" }
const DATA_SOURCES = ["js/data/gathering.json", "js/data/gathering"]

/**
 * @param {{ id: number, name: string }} item
 * @returns {string | null} "/gathering/cedar-log/", null for the crystals
 */
const itemUrl = (item) => item.id >= FIRST_PAGED_ITEM ? `/gathering/${slug(item.name)}/` : null

const itemLink = (item) => itemUrl(item) ? html`<a href="${itemUrl(item)}">${item.name}</a>` : item.name

/**
 * Only on the item's own page, hundreds of them would slow the list down.
 * @param {object} item
 * @param {{ icon: number }} info The item's entry in gathering-items.json
 * @returns {import("./html.js").Html} Its icon, saved by scripts/datamining.js
 */
const itemIcon = (item, info) => html`<img class="item-icon" src="/images/items/${info.icon}.webp" alt="${item.name} icon" width="44" height="44">`

const stars = (item) => item.stars && html`<span class="gathering-stars">${"★".repeat(item.stars)}</span>`

const collectable = (item) => item.collectable && chip("C", "gathering-collectable", "Collectable")

/**
 * @param {object} node
 * @returns {import("./html.js").Html[]}
 */
const nodeTags = (node) => [
  chip(node.type, TYPE_COLORS[node.type]),
  chip(`${node.job} Lv. ${node.level}`),
  node.folklore && chip(node.folklore),
  node.quest && chip(`Quest: ${node.quest}`, "", "Unlocked by this quest")
]

/**
 * Shown on the row as well as each item's hover title, which a phone can't show.
 * @param {object} node
 * @returns {import("./html.js").Html | undefined} "4480 Perception", "4480-4540 Perception" when its items differ
 */
function perceptionChip(node) {
  const values = node.items.map((i) => i.perception).filter(Boolean)
  if (!values.length) return
  const [low, high] = [Math.min(...values), Math.max(...values)]
  return chip(`${low === high ? low : `${low}-${high}`} Perception`)
}

/**
 * @param {string} key See listRow
 * @param {object} node
 * @returns {import("./html.js").Html}
 */
function nodeRow(key, node) {
  const items = node.items.map((item) => html`
    <span class="gathering-item"${item.perception && html` title="Needs ${item.perception} Perception"`}><strong>${itemLink(item)}</strong>${stars(item)}${collectable(item)}</span>`)

  return listRow(key, node, html`
    <div class="gathering-items">${items}</div>
    <div class="tags">${nodeTags(node)}${perceptionChip(node)}</div>`)
}

/**
 * @returns {{ rows: import("./html.js").Html, defaultExpansion: string, sources: string[] }} Every node's row,
 * for /gathering/, and the expansion a first visit shows (see js/gathering.js), its data is preloaded
 */
export function nodeList() {
  const expansions = readExpansions("gathering")
  const rows = listRows(expansions, (node) => node.id, nodeRow)
  const defaultExpansion = expansions.at(-1).file
  return { rows, defaultExpansion, expansionOptions: expansionOptions(expansions, defaultExpansion), sources: DATA_SOURCES }
}

/**
 * @param {string[]} values
 * @returns {string | null} The value when they're all the same
 */
const same = (values) => new Set(values).size === 1 ? values[0] : null

/**
 * @param {string} word
 * @returns {string} "a Miner", "an Unspoiled"
 */
const article = (word) => `${/^[aeiou]/i.test(word) ? "an" : "a"} ${word}`

/**
 * Three at most, so the description fits in a search result.
 * @param {{ zone: string }[]} nodes
 * @returns {string} "Kholusia, Il Mheg, Lakeland and 2 more"
 */
function zoneList(nodes) {
  const zones = [...new Set(nodes.map((n) => n.zone))]
  if (zones.length <= 3) return zones.join(", ")
  return `${zones.slice(0, 3).join(", ")} and ${zones.length - 3} more`
}

/**
 * @param {object} item
 * @param {{ node: object }[]} spots
 * @param {{ recipes: object[] }} info Its entry in gathering-items.json
 * @returns {{ title: string, description: string }}
 */
function itemSeo(item, spots, info) {
  return { title: itemTitle(item, spots), description: fitted(whereText(item, spots), [usedIn(info), aetheryteText(spots)]) }
}

/**
 * @param {string} text Ends without a full stop
 * @param {string[]} extras Each added in turn while the whole still fits in a search result, "" for none
 * @returns {string}
 */
function fitted(text, extras) {
  const fits = extras.reduce((out, extra) => (out + extra).length < 160 ? out + extra : out, text)
  return `${fits}.`
}

/** @returns {string} ", used in 12 crafting recipes", "" for none */
const usedIn = ({ recipes }) => recipes.length ? `, used in ${recipes.length} crafting recipe${recipes.length === 1 ? "" : "s"}` : ""

/** @returns {string} ", nearest aetheryte Helix", only for an item at one node */
const aetheryteText = (spots) => spots.length === 1 && spots[0].node.aetheryte ? `, nearest aetheryte ${spots[0].node.aetheryte.name}` : ""

/**
 * @param {object} item
 * @param {{ node: object }[]} spots
 * @returns {string}
 */
function itemTitle(item, spots) {
  const nodes = spots.map((s) => s.node)
  const timed = nodes.some((n) => n.times)
  const type = same(nodes.map((n) => n.type))
  const job = same(nodes.map((n) => n.job))
  const kind = type && type !== "Regular" ? type : job ?? "Gathering"
  return `${item.name}: FFXIV ${kind} Node${timed ? " & Times" : ""} - ffxiv.watch`
}

/**
 * Where the description starts, what people search for. What it's used for and the aetheryte follow when they fit.
 * @param {object} item
 * @param {{ node: object }[]} spots
 * @returns {string} Without a full stop
 */
function whereText(item, spots) {
  const nodes = spots.map((s) => s.node)
  const timed = nodes.some((n) => n.times)
  const type = same(nodes.map((n) => n.type))
  const job = same(nodes.map((n) => n.job))

  if (nodes.length > 1) {
    return `Where to gather ${item.name} in FFXIV: ${nodes.length} ${job ? `${job} ` : ""}nodes, in ${zoneList(nodes)}, with their maps${timed ? " and spawn times" : ""}`
  }

  const [node] = nodes
  const what = `${article([type === "Regular" ? "" : type.toLowerCase(), node.job].filter(Boolean).join(" "))} node, Lv. ${node.level}`
  const where = `, in ${node.zone}${node.map ? ` (${coordinates(node.map)})` : ""}`
  const when = node.times ? `, up ${etWindows(node.times)}` : ""
  return `Where to gather ${item.name} in FFXIV: ${what}${where}${when}`
}

/**
 * @param {{ node: object, item: object, expansion: string }} spot
 * @returns {import("./html.js").Html}
 */
const spotTags = ({ node, item, expansion }) => html`
  <div class="tags">${nodeTags(node)}${item.collectable && chip("Collectable", "chip-accent")}${item.perception && chip(`${item.perception} Perception`)}${chip(expansion)}</div>`

/**
 * One node an item is at: its timer and where it is, next to the map.
 * @param {{ node: object, item: object, expansion: string }} spot
 * @param {boolean} named One of several nodes: it gets the zone as its heading, and its own tags. A single node's tags
 * are in the item's header
 * @returns {import("./html.js").Html}
 */
function nodeCard(spot, named) {
  const { node, item } = spot
  const others = node.items.filter((i) => i.id !== item.id)

  return html`
<section class="detail-card gathering-node">${named && html`
  <div class="detail-top">
    <h2 class="detail-node">${node.zone}</h2>${spotTags(spot)}
  </div>`}
  ${node.map && mapFigure(node, node.items.map((i) => i.name).join(", "))}
  ${detailTimer(node.times ? JSON.stringify({ times: node.times }) : null, node.times ? `Up ${etWindows(node.times)}` : "Always up")}
  ${facts([
    ...locationFacts(node),
    ["Folklore", node.folklore],
    ["Unlocked by", node.quest],
    ["Also here", others.length && html`<span class="detail-list">${others.map((i) => html`<span>${itemLink(i)}</span>`)}</span>`]
  ])}
</section>`
}

// The recipes shown per crafter, the rest are counted
const RECIPES_SHOWN = 6

/**
 * @param {object[]} recipes From gathering-items.json, lowest level first
 * @returns {import("./html.js").Html} Grouped by crafter, the one with the most first
 */
function recipeList(recipes) {
  const byJob = Map.groupBy(recipes, (r) => r.job)
  const jobs = [...byJob].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))

  return html`
    <div class="detail-recipes">${jobs.map(([job, list]) => html`
      <div>
        <h3 class="detail-recipe-job">${job}</h3>
        <ul>${list.slice(0, RECIPES_SHOWN).map((r) => html`
          <li><span class="detail-recipe-level">Lv. ${r.level}</span> ${r.item}${r.amount > 1 && html` <span class="detail-recipe-amount">×${r.amount}</span>`}</li>`)}${list.length > RECIPES_SHOWN && html`
          <li class="detail-recipe-more">and ${list.length - RECIPES_SHOWN} more</li>`}
        </ul>
      </div>`)}
    </div>`
}

/**
 * The item's header, with what it's worth next to it. Its category and level are over its title.
 * @param {object} item
 * @param {object} info Its entry in gathering-items.json
 * @param {object[]} spots
 * @returns {import("./html.js").Html}
 */
const itemIntro = (item, info, spots) => html`
<div class="item-intro">
  <header class="detail-header">
    <div class="item-heading">
      ${itemIcon(item, info)}
      <div>
        <p class="detail-kicker">${info.category} · Item level ${info.level}</p>
        <h1 class="detail-title">${item.name}${stars(item)}</h1>
      </div>
    </div>
    <div class="detail-text">${gameText(info.description)}</div>${spots.length === 1 && spotTags(spots[0])}
  </header>
  <section class="item-about">
    <h2 class="detail-subtitle">About ${item.name}</h2>
    ${facts([
    ["Market board", info.marketable ? "Can be sold" : "Can't be sold"],
    ["Vendors buy it for", info.price ? `${info.price.toLocaleString("en-US")} gil` : "Can't be sold to vendors"],
    ["High quality", info.hq ? "Can be HQ" : "No HQ version"],
    ["Trading", info.tradable ? "Tradable" : "Untradable"]
  ])}
  </section>
</div>`

/**
 * The recipes the item is used in.
 * @param {object} info Its entry in gathering-items.json
 * @returns {import("./html.js").Html}
 */
function itemUses(info) {
  const count = info.recipes.length
  return html`
<section class="item-uses">
  <h2 class="item-uses-title">${count ? `Used in ${count} crafting recipe${count === 1 ? "" : "s"}` : "Not used in any crafting recipe"}</h2>
  ${count > 0 && recipeList(info.recipes)}
</section>`
}

/** @returns {object[]} A page per item, see [item].data.js */
export function itemPages() {
  const info = readData("gathering-items.json")
  const items = new Map()

  for (const expansion of readExpansions("gathering")) {
    for (const node of expansion.entries) {
      for (const item of node.items) {
        if (!itemUrl(item)) continue
        if (!items.has(item.id)) items.set(item.id, { item, spots: [] })
        items.get(item.id).spots.push({ node, item, expansion: expansion.name, file: expansion.file })
      }
    }
  }

  return [...items.values()].sort((a, b) => a.item.name.localeCompare(b.item.name)).map(({ item, spots }) => ({
    slug: slug(item.name),
    name: item.name,
    ...itemSeo(item, spots, info[item.id]),
    ...ogIcon(info[item.id].icon, item.name),
    content: html`${itemIntro(item, info[item.id], spots)}${itemUses(info[item.id])}${spots.map((spot) => nodeCard(spot, spots.length > 1))}`,
    // Only the expansions it's in, so a patch's new nodes don't change every item's lastmod
    sources: ["js/data/gathering-items.json", ...new Set(spots.map((s) => `js/data/gathering/${s.file}.json`))]
  }))
}
