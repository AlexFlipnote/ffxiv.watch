import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { defaultRecipe, materials } from "../src/js/utils/crafting.js"

const FIRE = 2
const recipe = (item, ingredients, { yield: made = 1, crystals = [[FIRE, 1]] } = {}) => ({ item, yield: made, ingredients, crystals })

/**
 * @param {ReturnType<typeof recipe>[]} recipes
 * @returns {(item: number) => object | undefined}
 */
const book = (recipes) => (item) => recipes.find((r) => r.item === item)

const asObject = (map) => Object.fromEntries(map)

describe("Crafting materials", () => {
  it("gets what isn't crafted, times what's asked for", () => {
    const m = materials([[100, 3]], book([recipe(100, [[1, 2], [3, 1]])]))
    assert.deepEqual(asObject(m.materials), { 1: 6, 3: 3 })
    assert.deepEqual(asObject(m.crystals), { [FIRE]: 3 })
    assert.equal(m.crafts.length, 1)
    assert.equal(m.crafts[0].crafts, 3)
  })

  it("rounds a craft up to its yield, and keeps what's left over", () => {
    // 5 bolts, 3 to a craft: 2 crafts, 6 made
    const m = materials([[100, 1]], book([recipe(100, [[50, 5]]), recipe(50, [[1, 1]], { yield: 3 })]))
    const bolts = m.crafts.find((c) => c.recipe.item === 50)
    assert.deepEqual({ crafts: bolts.crafts, made: bolts.made, needed: bolts.needed }, { crafts: 2, made: 6, needed: 5 })
    assert.deepEqual(asObject(m.materials), { 1: 2 })
  })

  it("crafts an intermediate two items share once, rounding its yield once", () => {
    // 2 + 2 ingots, 3 to a craft: 2 crafts together, not 1 + 1 rounded up apart (which would be the same here) or 3
    const recipes = [recipe(100, [[50, 2]]), recipe(101, [[50, 2]]), recipe(50, [[1, 1]], { yield: 3 })]
    const m = materials([[100, 1], [101, 1]], book(recipes))
    const ingots = m.crafts.find((c) => c.recipe.item === 50)
    assert.equal(ingots.needed, 4)
    assert.equal(ingots.crafts, 2)
    assert.deepEqual(asObject(m.materials), { 1: 2 })
  })

  it("adds up an intermediate needed at different depths before crafting it", () => {
    // 100 takes 60 and 50, 60 takes 50 too: 50 is reached first through 100, but its demand from 60 has to be in
    const recipes = [recipe(100, [[50, 1], [60, 1]]), recipe(60, [[50, 2]]), recipe(50, [[1, 1]], { yield: 2 })]
    const m = materials([[100, 1]], book(recipes))
    const ingots = m.crafts.find((c) => c.recipe.item === 50)
    assert.equal(ingots.needed, 3)
    assert.equal(ingots.crafts, 2)
  })

  it("puts each craft after the ones it needs", () => {
    const recipes = [recipe(100, [[60, 1], [50, 1]]), recipe(60, [[50, 1]]), recipe(50, [[1, 1]])]
    const order = materials([[100, 1]], book(recipes)).crafts.map((c) => c.recipe.item)
    assert.deepEqual(order, [50, 60, 100])
  })

  it("gets an item instead when its recipe leads back to what's being made", () => {
    // 100 from 50, 50 from 100: 100 is still crafted, 50 is gotten
    const m = materials([[100, 1]], book([recipe(100, [[50, 1]]), recipe(50, [[100, 1]])]))
    assert.deepEqual(m.crafts.map((c) => c.recipe.item), [100])
    assert.deepEqual(asObject(m.materials), { 50: 1 })
  })

  it("leaves out what a list says not to craft", () => {
    const recipes = book([recipe(100, [[50, 2]]), recipe(50, [[1, 1]])])
    const m = materials([[100, 1]], (item) => item === 50 ? null : recipes(item))
    assert.deepEqual(asObject(m.materials), { 50: 2 })
  })

  it("picks the lowest level recipe by default", () => {
    assert.equal(defaultRecipe([7, 8, 9], { 7: { level: 20 }, 8: { level: 5 }, 9: { level: 5 } }), 8)
    assert.equal(defaultRecipe(undefined, {}), undefined)
  })
})
