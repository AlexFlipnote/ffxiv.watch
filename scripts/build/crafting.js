import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { expansionOf, slug, writeData, writeExpansions } from "../common.js"
import { byId, saveIcons, sheets } from "../sources/game.js"
import { UNLOCK_ICONS } from "../../src/js/utils/crafting.js"

// Runs after gathering.js and fishing.js, it reads what they wrote
const DATA = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../src/js/data")

// By Recipe.CraftType, the CraftType sheet names the craft rather than the job
const CRAFTERS = ["Carpenter", "Blacksmith", "Armorer", "Goldsmith", "Leatherworker", "Weaver", "Alchemist", "Culinarian"]
// Item ids 2-19 are the shards, crystals and clusters
const LAST_CRYSTAL = 19

/**
 * @param {string} name "gathering" or "fishing"
 * @returns {object[]}
 */
const readList = (name) => fs.readdirSync(path.join(DATA, name))
  .flatMap((file) => JSON.parse(fs.readFileSync(path.join(DATA, name, file), "utf8")))

/**
 * @param {Record<string, string>} recipe
 * @returns {{ ingredients: [number, number][], crystals: [number, number][] }} [item id, amount]
 */
function ingredientsOf(recipe) {
  const ingredients = []
  const crystals = []
  for (let i = 0; recipe[`Ingredient[${i}]`] !== undefined; i++) {
    const id = +recipe[`Ingredient[${i}]`]
    const amount = +recipe[`AmountIngredient[${i}]`]
    if (id > 0 && amount > 0) (id <= LAST_CRYSTAL ? crystals : ingredients).push([id, amount])
  }
  return { ingredients, crystals }
}

/**
 * Groups the per-job recipes that differ only in crystals and book, like furnishings any crafter can make.
 * @param {{ entry: object, recipe: object }[]} kept
 * @returns {{ entry: object, recipe: object, expansion: string }[][]}
 */
function sameRecipes(kept) {
  const groups = new Map()
  for (const k of kept) {
    const { item, level, stars, yield: made, ingredients, expert, specialist } = k.recipe
    const key = JSON.stringify([item, level, stars, made, ingredients, expert, specialist])
    groups.set(key, [...groups.get(key) ?? [], k])
  }
  return [...groups.values()]
}

/**
 * @param {{ entry: object }[]} group
 * @returns {object} `recipes` lists every id when there are several
 */
function listEntry(group) {
  const { job, book, ...entry } = group[0].entry
  const books = [...new Set(group.map((k) => k.entry.book).filter(Boolean))]
  return {
    ...entry,
    jobs: group.map((k) => k.entry.job),
    ...(books.length ? { books } : {}),
    ...(group.length > 1 ? { recipes: group.map((k) => k.entry.id) } : {})
  }
}

/**
 * Recipe id -> its facts, per expansion so a patch only rewrites the newest file.
 * @param {{ expansion: string, entry: { id: number }, recipe: object }[]} kept
 */
function writeRecipes(kept) {
  const dir = path.join(DATA, "crafting-recipes")
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(dir, { recursive: true })

  const byExpansion = Map.groupBy(kept, (k) => k.expansion)
  for (const [expansion, list] of byExpansion) {
    const recipes = Object.fromEntries(list.map((k) => [k.entry.id, k.recipe]))
    fs.writeFileSync(path.join(dir, `${slug(expansion)}.json`), JSON.stringify(recipes, null, 2) + "\n")
  }
  console.log(`Wrote ${kept.length} to src/js/data/crafting-recipes`)
}

async function main() {
  const [recipes, recipeLevels, items, gilShopItems, exVersions, books, uiCategories] = await sheets([
    "Recipe", "RecipeLevelTable", "Item", "GilShopItem", "ExVersion", "SecretRecipeBook", "ItemUICategory"
  ])
  const uiCategory = byId(uiCategories)
  const item = byId(items)
  const level = byId(recipeLevels)
  const book = byId(books)

  const gathered = new Set(readList("gathering").flatMap((node) => node.items.map((i) => i.id)))
  const fished = new Set(readList("fishing").map((fish) => fish.id))
  const sold = new Set(gilShopItems.map((row) => +row.Item).filter((id) => id > 0))

  // `entry` is the list's row, `recipe` the pages' facts
  const kept = []
  for (const r of recipes) {
    const result = item[r.ItemResult]
    const job = CRAFTERS[r.CraftType]
    const lv = level[r.RecipeLevelTable]
    const { ingredients, crystals } = ingredientsOf(r)
    if (!result?.Name || !job || !lv || !ingredients.length) continue

    const stars = +lv.Stars
    const bookName = r.SecretRecipeBook !== "0" ? book[r.SecretRecipeBook]?.Name : null
    kept.push({
      expansion: expansionOf(+lv.ClassJobLevel, exVersions),
      entry: {
        id: +r["#"],
        item: +r.ItemResult,
        name: result.Name,
        job,
        level: +lv.ClassJobLevel,
        ...(stars ? { stars } : {}),
        ...(bookName ? { book: bookName } : {}),
        ...(r.IsExpert === "True" ? { expert: true } : {})
      },
      recipe: {
        item: +r.ItemResult,
        job,
        level: +lv.ClassJobLevel,
        ...(stars ? { stars } : {}),
        yield: +r.AmountResult || 1,
        ingredients,
        crystals,
        ...(bookName ? { book: bookName } : {}),
        ...(r.IsExpert === "True" ? { expert: true } : {}),
        ...(r.IsSpecializationRequired === "True" ? { specialist: true } : {}),
        ...(r.CanQuickSynth === "True" ? { quickSynth: true } : {}),
        ...(r.CanHq === "True" ? { hq: true } : {})
      }
    })
  }
  kept.sort((a, b) => a.entry.level - b.entry.level || a.entry.job.localeCompare(b.entry.job) || a.entry.name.localeCompare(b.entry.name))

  writeExpansions("crafting", exVersions, sameRecipes(kept).map((group) => ({ expansion: group[0].expansion, entry: listEntry(group) })))
  writeRecipes(kept)

  // Every item a recipe makes or takes
  const recipesOf = new Map()
  for (const { entry } of kept) recipesOf.set(entry.item, [...recipesOf.get(entry.item) ?? [], entry.id])
  const ids = new Set(kept.flatMap(({ recipe }) => [recipe.item, ...recipe.ingredients.map(([id]) => id), ...recipe.crystals.map(([id]) => id)]))

  const info = {}
  for (const id of [...ids].sort((a, b) => a - b)) {
    const it = item[id]
    info[id] = {
      name: it.Name,
      icon: +it.Icon,
      ...(recipesOf.has(id) ? {
        ...(uiCategory[it.ItemUICategory]?.Name ? { category: uiCategory[it.ItemUICategory].Name } : {}),
        level: +it.LevelItem,
        ...(it.Description ? { description: it.Description } : {})
      } : {}),
      marketable: it.ItemSearchCategory !== "0",
      ...(recipesOf.has(id) ? { recipes: recipesOf.get(id) } : {}),
      ...(gathered.has(id) ? { gathered: true } : {}),
      ...(fished.has(id) ? { fished: true } : {}),
      ...(sold.has(id) && +it.PriceMid > 0 ? { vendor: +it.PriceMid } : {})
    }
  }
  writeData("crafting-items", info)

  await saveIcons([...Object.values(info).map((i) => i.icon), ...Object.values(UNLOCK_ICONS)])
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
