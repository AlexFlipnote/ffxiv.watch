import crypto from "crypto"
import { defaultRecipe, materials } from "../js/utils/crafting.js"
import { fishUrl } from "./fishing.js"
import { itemUrl as gatheringUrl } from "./gathering.js"
import { chip, expansionOptions, facts, gameText, html, listRows, pager, raw, readData, readExpansions, slug } from "./html.js"
import { gameIcon } from "../js/utils/images.js"
import { ogIcon } from "./og.js"

// The recipe list and a page per crafted item's name. A list entry is one recipe for all its `jobs`, see sameRecipes
// in scripts/build/crafting.js

const DATA_SOURCES = ["js/data/crafting.json", "js/data/crafting", "js/data/vendors.json"]
// Item ids 2-19 are the crystals
const LAST_CRYSTAL = 19
const USES_SHOWN = 6
const CRAFTER_COUNT = 8
// The Item gil is, in vendors.json
const GIL = 1

/**
 * @returns {{ expansions: object[], items: Record<string, object>, recipes: Record<string, object> }}
 */
const data = (() => {
  let cached = null
  return () => {
    if (cached) return cached
    const expansions = readExpansions("crafting")
    const recipes = Object.assign({}, ...expansions.map((e) => readData(`crafting-recipes/${e.file}.json`)))
    cached = { expansions, items: readData("crafting-items.json"), recipes }
    return cached
  }
})()

/**
 * The vendors, fetched by the planner when one is tapped rather than in every page that has something to buy.
 * @returns {{ path: string, url: string, content: string, sold: Set<number>, costs: Map<number, [number, string, number]> }}
 * `sold` has the items with a vendor, `costs` what the ones sold for something other than gil cost: [amount, currency,
 * its icon]
 */
const vendorFile = (() => {
  let cached = null
  return () => {
    if (cached) return cached
    const vendors = readData("vendors.json")
    const content = JSON.stringify(vendors)
    const path = "rows/crafting/vendors.json"
    const hash = crypto.createHash("md5").update(content).digest("hex").slice(0, 10)
    const costs = new Map()
    for (const [id, offers] of Object.entries(vendors.items)) {
      // Gil comes first when it's sold for gil anywhere
      const [, currency, amount] = offers[0]
      if (currency !== GIL) costs.set(+id, [amount, ...vendors.currencies[currency]])
    }
    cached = { path, url: `/${path}?v=${hash}`, content, sold: new Set(Object.keys(vendors.items).map(Number)), costs }
    return cached
  }
})()

/**
 * @param {string} name
 * @returns {string} "/crafting/bronze-ingot/"
 */
export const craftingUrl = (name) => `/crafting/${slug(name)}/`

/**
 * @param {{ id: number, recipes?: number[] }} entry
 * @returns {number[]}
 */
const recipeIds = (entry) => entry.recipes ?? [entry.id]

/**
 * @param {string[]} jobs
 * @returns {string} "Weaver", "Alchemist or Armorer", "Any crafter"
 */
const crafterText = (jobs) => jobs.length === CRAFTER_COUNT ? "Any crafter"
  : jobs.length > 1 ? `${jobs.slice(0, -1).join(", ")} or ${jobs.at(-1)}` : jobs[0]

/**
 * An item's recipe, node or fish page.
 * @param {number} id
 * @returns {string | null}
 */
function linkOf(id) {
  const info = data().items[id]
  if (id <= LAST_CRYSTAL) return null
  if (info.recipes) return craftingUrl(info.name)
  if (info.gathered) return gatheringUrl({ id, name: info.name })
  if (info.fished) return fishUrl(info)
  return null
}

/**
 * @param {number} id
 * @returns {import("./html.js").Html}
 */
function itemName(id) {
  const { name } = data().items[id]
  const url = linkOf(id)
  return url ? html`<a href="${url}">${name}</a>` : html`${name}`
}

/**
 * @param {number} icon
 * @returns {import("./html.js").Html}
 */
const smallIcon = (icon) => html`<img class="bait-icon" src="${gameIcon(icon)}" alt="" width="24" height="24" loading="lazy">`

/**
 * @param {[number, string, number]} cost [amount, currency, its icon]
 * @returns {import("./html.js").Html} "Vendor 2 [gemstone]", the currency named on hover
 */
const currencyChip = ([amount, currency, icon]) => html`<span class="chip chip-gold chip-currency" title="${amount.toLocaleString("en-US")} ${currency}">Vendor ${amount.toLocaleString("en-US")}<img src="${gameIcon(icon)}" alt="${currency}" width="16" height="16" loading="lazy"></span>`

/**
 * @param {number} id
 * @returns {import("./html.js").Html[]}
 */
function sourceChips(id) {
  const info = data().items[id]
  return [
    info.gathered && chip("Gathered"),
    info.fished && chip("Fished"),
    info.vendor && chip(`Vendor ${info.vendor.toLocaleString("en-US")} gil`, "chip-gold"),
    !info.vendor && vendorFile().costs.has(id) && currencyChip(vendorFile().costs.get(id)),
    !info.recipes && !info.gathered && !info.fished && !info.vendor && !vendorFile().costs.has(id) && id > LAST_CRYSTAL && chip("Drop, market or other", "", "Not crafted, gathered, fished or sold by a vendor")
  ]
}

const stars = (recipe) => recipe.stars && html`<span class="gathering-stars">${"★".repeat(recipe.stars)}</span>`

/**
 * @param {object} recipe A recipe, or a list entry with each crafter's book
 * @returns {import("./html.js").Html[]}
 */
const recipeChips = (recipe) => {
  const books = recipe.books ?? (recipe.book ? [recipe.book] : [])
  return [
    books.length === 1 && chip(books[0], "chip-gold", "Needs this master recipe book"),
    books.length > 1 && chip("Master recipe book", "chip-gold", `Needs one of: ${books.join(", ")}`),
    recipe.expert && chip("Expert", "chip-accent"),
    recipe.specialist && chip("Specialist", "", "Only a specialist can craft it")
  ]
}

/**
 * @param {string} key See listRows
 * @param {object} entry
 * @returns {import("./html.js").Html}
 */
function recipeRow(key, entry) {
  const tags = recipeChips(entry).filter(Boolean)
  const crafters = entry.jobs.length > 1 ? html`<span class="zone" title="${entry.jobs.join(", ")}">${entry.jobs.length === CRAFTER_COUNT ? "Any crafter" : `${entry.jobs[0]} +${entry.jobs.length - 1}`}</span>`
    : html`<span class="zone">${entry.jobs[0]}</span>`
  return html`
<tr data-key="${key}">
  <td colspan="2"><div class="row-body"><div class="row-main"><a class="crafting-name" href="${craftingUrl(entry.name)}"><strong>${entry.name}</strong>${stars(entry)}</a>${tags.length > 0 && html`<div class="tags">${tags}</div>`}</div><div class="place">${crafters}<span class="spot">Lv.${entry.level}</span></div></div></td>
</tr>`
}

/** @returns {object} The rows for /crafting/, all from /rows/ as one expansion has thousands */
export function recipeList() {
  const { expansions } = data()
  const defaultExpansion = expansions.at(-1).file
  const { rowFiles, files } = listRows("crafting", expansions, null, (entry) => entry.id, recipeRow, () => [])
  return {
    rowFiles,
    files: { ...files, [vendorFile().path]: vendorFile().content },
    defaultExpansion,
    defaultRows: JSON.parse(rowFiles)[defaultExpansion],
    expansionOptions: expansionOptions(expansions, defaultExpansion),
    sources: DATA_SOURCES
  }
}

/**
 * @param {[number, number][]} list [item id, amount]
 * @returns {import("./html.js").Html}
 */
const ingredientList = (list) => html`
    <ul class="crafting-ingredients">${list.map(([id, amount]) => html`
      <li>${smallIcon(data().items[id].icon)}<span class="crafting-amount">${amount}x</span><span class="crafting-ingredient">${itemName(id)}</span>${sourceChips(id)}</li>`)}
    </ul>`

/**
 * @param {Map<number, number> | [number, number][]} crystals
 * @returns {import("./html.js").Html}
 */
const crystalItems = (crystals) => html`${[...crystals].map(([id, amount]) => html`
      <span class="bait-step">${smallIcon(data().items[id].icon)}${amount}x ${data().items[id].name}</span>`)}`

/**
 * Each crafter's own part, recipe.js shows the picked one's.
 * @param {object[]} recipes
 * @param {(recipe: object) => import("./html.js").Html | string} content
 * @param {string} [tag]
 * @param {string} [className]
 * @returns {import("./html.js").Html}
 */
const perCrafter = (recipes, content, tag = "span", className = "") => html`${recipes.map((r, i) => html`
      <${raw(tag)}${className && html` class="${className}"`} data-job="${r.job}"${i > 0 && html` hidden`}>${content(r)}</${raw(tag)}>`)}`

/**
 * @param {object} entry
 * @param {boolean} named One of several different recipes
 * @returns {import("./html.js").Html}
 */
function recipeCard(entry, named) {
  const recipes = recipeIds(entry).map((id) => data().recipes[id])
  const [recipe] = recipes
  const crafter = recipes.length > 1
    ? html`<select class="select crafting-job" aria-label="Crafter">${recipes.map((r) => html`<option>${r.job}</option>`)}</select>`
    : recipe.job
  return html`
<section class="crafting-recipe">${named && html`
  <h2 class="detail-subtitle">${crafterText(entry.jobs)}, Lv.${recipe.level}${stars(recipe)}</h2>`}
  <div class="crafting-recipe-body">
    <div>
      <h3 class="crafting-heading">Ingredients</h3>
      ${ingredientList(recipe.ingredients)}
      ${perCrafter(recipes, (r) => crystalItems(r.crystals), "p", "crafting-crystals")}
    </div>
    ${facts([
    ["Crafter", crafter],
    ["Level", html`Lv.${recipe.level}${stars(recipe)}`],
    ["Makes", recipe.yield > 1 ? `${recipe.yield} per craft` : "1 per craft"],
    ["Recipe book", recipes.some((r) => r.book) && perCrafter(recipes, (r) => r.book ?? "None needed")],
    ["Expert", recipe.expert && "Expert recipe, with its own conditions"],
    ["Specialist", recipe.specialist && "Specialists only"],
    ["Quick Synthesis", recipe.quickSynth ? "Yes" : "No"],
    ["High quality", recipe.hq ? "Can be HQ" : "No HQ version"]
  ])}
  </div>
</section>`
}

/**
 * @param {number} item
 * @returns {number | undefined}
 */
const recipeIdOf = (item) => defaultRecipe(data().items[item]?.recipes, data().recipes)

/**
 * Where and when each item that's only up at times can be gotten, `alarm` being the id its page's bell sets.
 * @returns {Map<number, { alarm: string, zone: string, spot?: string, times?: [number, number][], weather?: string[], previousWeather?: string[] }[]>}
 */
const timingOf = (() => {
  let cached = null
  return () => {
    if (cached) return cached
    cached = new Map()
    const always = new Set()
    for (const e of readExpansions("gathering")) {
      for (const node of e.entries) {
        for (const item of node.items) {
          if (!node.times) always.add(item.id)
          else cached.set(item.id, [...cached.get(item.id) ?? [], { alarm: `node:${node.id}`, zone: node.zone, spot: node.spot, times: node.times }])
        }
      }
    }
    for (const id of always) cached.delete(id)
    for (const e of readExpansions("fishing")) {
      for (const fish of e.entries) {
        if (!fish.times && !fish.weather && !fish.previousWeather) continue
        const { zone, spot, times, weather, previousWeather } = fish
        cached.set(fish.id, [{ alarm: `fish:${fish.id}`, zone, spot, ...(times ? { times } : {}), ...(weather ? { weather } : {}), ...(previousWeather ? { previousWeather } : {}) }])
      }
    }
    return cached
  }
})()

/**
 * What has to be unlocked first to gather or fish each item, only when every node or fish of it needs something.
 * @returns {Map<number, [string, string][]>} Item id -> ["folklore" | "quest", name], several when any one will do
 */
const unlocksOf = (() => {
  let cached = null
  return () => {
    if (cached) return cached
    const sources = new Map()
    const add = (id, source) => sources.set(id, [...sources.get(id) ?? [], source])
    // The node's quest only unlocks buying its book, when it has both
    const unlockOf = (source) => source.folklore ? ["folklore", source.folklore] : source.quest ? ["quest", source.quest] : null
    for (const e of readExpansions("gathering")) {
      for (const node of e.entries) for (const item of node.items) add(item.id, unlockOf(node))
    }
    for (const e of readExpansions("fishing")) for (const fish of e.entries) add(fish.id, unlockOf(fish))
    cached = new Map()
    for (const [id, list] of sources) {
      if (list.some((u) => !u)) continue
      cached.set(id, [...new Map(list.map((u) => [u.join(), u])).values()])
    }
    return cached
  }
})()

/**
 * @param {number} id
 * @param {object} r
 * @returns {any[]} [recipe id, yield, job, level, ingredients, crystals, { book?, specialist? }]
 */
function plannerRecipe(id, r) {
  const unlock = { ...(r.book ? { book: r.book } : {}), ...(r.specialist ? { specialist: true } : {}) }
  return [id, r.yield, r.job, r.level, r.ingredients, r.crystals, ...(Object.keys(unlock).length ? [unlock] : [])]
}

/**
 * The items and recipes under one craft, for js/utils/planner.js.
 * @param {number} rootRecipe
 * @param {number[]} [others] Its other crafters' recipes, as `crafters`
 * @returns {string} JSON
 */
function plannerData(rootRecipe, others = []) {
  const { items, recipes } = data()
  const root = recipes[rootRecipe]
  const usedRecipes = {}
  const usedItems = {}
  const unlocks = {}
  const costs = {}

  const addItem = (id) => {
    if (usedItems[id]) return
    const info = items[id]
    // Crystals are at nodes too
    const bought = info.vendor || vendorFile().costs.has(id)
    const source = id <= LAST_CRYSTAL ? "crystal" : info.gathered ? "gathered" : info.fished ? "fished" : bought ? "vendor" : "other"
    if (source === "vendor" && !info.vendor) costs[id] = vendorFile().costs.get(id)
    usedItems[id] = [info.name, info.icon, linkOf(id) ?? "", source, info.vendor ?? 0, ...(timingOf().has(id) ? [timingOf().get(id)] : [])]
    if ((source === "gathered" || source === "fished") && unlocksOf().has(id)) unlocks[id] = unlocksOf().get(id)
    const recipeId = id === root.item ? rootRecipe : recipeIdOf(id)
    if (recipeId === undefined || usedRecipes[id]) return
    const r = recipes[recipeId]
    usedRecipes[id] = plannerRecipe(recipeId, r)
    for (const [ingredient] of [...r.ingredients, ...r.crystals]) addItem(ingredient)
  }
  addItem(root.item)

  const crafters = {}
  for (const id of [rootRecipe, ...others]) {
    const r = recipes[id]
    crafters[r.job] = plannerRecipe(id, r)
    for (const [crystal] of r.crystals) addItem(crystal)
  }

  const sold = Object.keys(usedItems).map(Number).filter((id) => usedItems[id][3] === "vendor" && vendorFile().sold.has(id))

  return JSON.stringify({
    root: root.item,
    slug: slug(items[root.item].name),
    recipes: usedRecipes,
    items: usedItems,
    ...(Object.keys(unlocks).length ? { unlocks } : {}),
    ...(sold.length ? { vendors: { url: vendorFile().url, items: sold } } : {}),
    ...(Object.keys(costs).length ? { costs } : {}),
    ...(others.length ? { crafters } : {})
  })
}

/**
 * Every material for one craft from scratch. Hidden when that's just its ingredients, the lists still read its data.
 * @param {object} entry
 * @returns {import("./html.js").Html}
 */
function fullCraft(entry) {
  const [recipeId, ...others] = recipeIds(entry)
  const recipe = data().recipes[recipeId]
  const recipeOf = (item) => {
    if (item === recipe.item) return recipe
    const id = recipeIdOf(item)
    return id === undefined ? null : data().recipes[id]
  }
  const { crafts, materials: needed, crystals } = materials([[recipe.item, recipe.yield]], recipeOf)
  if (crafts.length < 2) return html`
<section class="crafting-full" data-planner="${plannerData(recipeId, others)}" hidden></section>`

  return html`
<section class="crafting-full" data-planner="${plannerData(recipeId, others)}">
  <h2 class="detail-subtitle">Everything it takes</h2>
  <div class="planner-body">
    <p class="crafting-note">For one craft, every ingredient made from scratch.</p>
    ${ingredientList([...needed])}
    <details class="planner-crystals">
      <summary>Crystals needed</summary>
      ${ingredientList([...crystals])}
    </details>
  </div>
</section>`
}

/**
 * Every recipe each item is an ingredient of.
 * @returns {Map<number, { jobs: string[], level: number, item: number, amount: number }[]>} Lowest level first
 */
const usesOf = (() => {
  let cached = null
  return () => {
    if (cached) return cached
    cached = new Map()
    for (const expansion of data().expansions) {
      for (const entry of expansion.entries) {
        for (const [id, amount] of data().recipes[entry.id].ingredients) {
          cached.set(id, [...cached.get(id) ?? [], { jobs: entry.jobs, level: entry.level, item: entry.item, amount }])
        }
      }
    }
    for (const list of cached.values()) list.sort((a, b) => a.level - b.level || data().items[a.item].name.localeCompare(data().items[b.item].name))
    return cached
  }
})()

/**
 * @param {number[]} ids
 * @returns {import("./html.js").Html}
 */
function itemUses(ids) {
  const uses = ids.flatMap((id) => usesOf().get(id) ?? [])
  const byJob = Map.groupBy(uses, (u) => u.jobs.length > 1 ? crafterText(u.jobs) : u.jobs[0])
  const jobs = [...byJob].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
  return html`
<section class="item-uses">
  <h2 class="item-uses-title">${uses.length ? `Used in ${uses.length} other recipe${uses.length === 1 ? "" : "s"}` : "Not used in any other recipe"}</h2>${uses.length > 0 && html`
  <div class="detail-recipes">${jobs.map(([job, list]) => html`
    <div>
      <h3 class="detail-recipe-job">${job}</h3>
      <ul>${list.slice(0, USES_SHOWN).map((u) => html`
        <li><span class="detail-recipe-level">Lv.${u.level}</span> ${u.amount > 1 && html`<span class="detail-recipe-amount">${u.amount}x</span> `}<a href="${craftingUrl(data().items[u.item].name)}">${data().items[u.item].name}</a></li>`)}${list.length > USES_SHOWN && html`
        <li class="detail-recipe-more">and ${list.length - USES_SHOWN} more</li>`}
      </ul>
    </div>`)}
  </div>`}
</section>`
}

/**
 * @param {object} info
 * @param {object[]} entries
 * @returns {import("./html.js").Html}
 */
function itemIntro(info, entries) {
  return html`
<div class="item-intro">
  <header class="detail-header">
    <div class="item-heading">
      <img class="item-icon" src="${gameIcon(info.icon)}" alt="${info.name} icon" width="44" height="44">
      <div>
        <p class="detail-kicker">${[info.category, info.level && `Item level ${info.level}`].filter(Boolean).join(" · ")}</p>
        <div class="detail-title-row"><h1 class="detail-title">${info.name}</h1><button class="icon-button title-list-add" type="button" title="Add to a list" aria-label="Add ${info.name} to a list" hidden></button></div>
      </div>
    </div>${info.description && html`
    <div class="detail-text">${gameText(info.description)}</div>`}
    <div class="tags">${entries.map((e) => chip(html`${crafterText(e.jobs)} Lv.${e.level}${stars(e)}`))}${entries.flatMap(recipeChips)}</div>
  </header>
  <section class="item-about">
    <h2 class="detail-subtitle">About ${info.name}</h2>
    ${facts([
    ["Market board", info.marketable ? "Can be sold" : "Can't be sold"],
    ["Vendors", info.vendor ? `Sold for ${info.vendor.toLocaleString("en-US")} gil` : null],
    ["Also", [info.gathered && "Gathered", info.fished && "Fished"].filter(Boolean).join(", ")]
  ])}
  </section>
</div>`
}

/**
 * @param {string} name
 * @param {object[]} entries
 * @returns {{ title: string, description: string }}
 */
function itemSeo(name, entries) {
  const jobs = [...new Set(entries.flatMap((e) => e.jobs))]
  const [first] = entries
  const ingredients = data().recipes[first.id].ingredients.map(([id, amount]) => `${amount} ${data().items[id].name}`)
  const who = first.jobs.length === CRAFTER_COUNT ? "recipe any crafter can make" : `${first.jobs.length > 1 ? crafterText(first.jobs) : first.jobs[0]} recipe`
  let description = `How to craft ${name} in FFXIV: a Lv.${first.level} ${who}, from `
  // As many as fit in a search result
  for (const [i, text] of ingredients.entries()) {
    const next = `${description}${i ? ", " : ""}${text}`
    if (i && next.length > 150) {
      description += " and more"
      break
    }
    description = next
  }
  return { title: `${name}: FFXIV ${jobs.length === 1 ? jobs[0] : "Crafting"} Recipe & Materials`, description: `${description}.` }
}

/** @returns {object[]} A page per crafted item's name, in the list's order */
export function itemPages() {
  const { expansions, items } = data()
  const pages = new Map()
  for (const expansion of expansions) {
    for (const entry of expansion.entries) {
      const key = slug(entry.name)
      if (!pages.has(key)) pages.set(key, { name: entry.name, items: new Set(), entries: [], files: new Set() })
      const page = pages.get(key)
      page.items.add(entry.item)
      page.entries.push(entry)
      page.files.add(expansion.file)
    }
  }

  const all = [...pages]
  const pagerTo = (page) => page && { url: craftingUrl(page[1].name), text: page[1].name }

  return all.map(([key, page], i) => {
    const ids = [...page.items]
    return {
      slug: key,
      name: page.name,
      ...itemSeo(page.name, page.entries),
      ...ogIcon(items[ids[0]].icon, page.name),
      content: html`${itemIntro(items[ids[0]], page.entries)}${page.entries.map((e) => recipeCard(e, page.entries.length > 1))}${fullCraft(page.entries[0])}${itemUses(ids)}
${pager(pagerTo(all[i - 1]), pagerTo(all[i + 1]), "Previous and next recipe")}`,
      sources: ["js/data/crafting-items.json", ...[...page.files].flatMap((file) => [`js/data/crafting/${file}.json`, `js/data/crafting-recipes/${file}.json`])]
    }
  })
}

/** @returns {[string, number][]} [name, icon] for the navbar's search, one per page */
export function searchRecipes() {
  const { expansions, items } = data()
  const seen = new Map()
  for (const e of expansions) {
    for (const entry of e.entries) if (!seen.has(slug(entry.name))) seen.set(slug(entry.name), [entry.name, items[entry.item].icon])
  }
  return [...seen.values()]
}
