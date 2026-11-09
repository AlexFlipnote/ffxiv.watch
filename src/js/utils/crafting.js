// What a craft comes to, pure so the build and the planner work it out the same. An intermediate several items need is
// crafted once for all of them, so its yield is rounded up once

/**
 * @typedef {object} Recipe
 * @property {number} item
 * @property {number} yield How many one craft makes
 * @property {[number, number][]} ingredients [item id, amount] per craft
 * @property {[number, number][]} crystals [item id, amount] per craft
 */

/**
 * @typedef {object} Materials
 * @property {{ recipe: Recipe, crafts: number, made: number, needed: number }[]} crafts In the order to craft them
 * @property {Map<number, number>} materials Item id -> how many to get
 * @property {Map<number, number>} crystals Item id -> how many
 */

/**
 * @param {[number, number][]} wants [item id, amount]
 * @param {(item: number) => Recipe | null | undefined} recipeOf None to get it rather than craft it
 * @returns {Materials}
 */
export function materials(wants, recipeOf) {
  // Each item after what it's made from. In a loop (A from B from A), the item that leads back is gotten instead
  const order = []
  const state = new Map()
  const loops = new Set()
  const visit = (id) => {
    state.set(id, "open")
    for (const [ingredient] of recipeOf(id)?.ingredients ?? []) {
      if (state.get(ingredient) === "open") loops.add(id)
      else if (!state.has(ingredient)) visit(ingredient)
    }
    state.set(id, "done")
    order.push(id)
  }
  for (const [id] of wants) if (!state.has(id)) visit(id)

  const demand = new Map()
  const add = (map, id, amount) => map.set(id, (map.get(id) ?? 0) + amount)
  for (const [id, amount] of wants) add(demand, id, amount)

  const crafts = []
  const out = new Map()
  const crystals = new Map()
  // Reversed, all of an item's demand is in by the time it's reached
  for (const id of order.reverse()) {
    const needed = demand.get(id) ?? 0
    const recipe = loops.has(id) ? null : recipeOf(id)
    if (!needed) continue
    if (!recipe) {
      add(out, id, needed)
      continue
    }

    const times = Math.ceil(needed / recipe.yield)
    crafts.push({ recipe, crafts: times, made: times * recipe.yield, needed })
    for (const [ingredient, amount] of recipe.ingredients) add(demand, ingredient, amount * times)
    for (const [crystal, amount] of recipe.crystals) add(crystals, crystal, amount * times)
  }

  return { crafts: crafts.reverse(), materials: out, crystals }
}

// Item.Icon of a master recipe book, the first few share it, and of the folklore tomes, which all share one
export const UNLOCK_ICONS = { book: 26155, folklore: 26164 }

// The preferred crafter in the settings, none for the first listed
export const CRAFTER_KEY = "crafting-crafter"

/**
 * @param {string | null} picked
 * @param {Record<string, any> | undefined} crafters Job -> its recipe
 * @returns {string | null} The picked crafter, when they can make it
 */
export const preferredCrafter = (picked, crafters) => picked && crafters?.[picked] ? picked : null

/**
 * The lowest level of an item's recipes.
 * @param {number[]} ids
 * @param {Record<string, { level: number }>} recipes
 * @returns {number | undefined}
 */
export const defaultRecipe = (ids, recipes) => ids?.reduce((best, id) => recipes[id].level < recipes[best].level ? id : best)
