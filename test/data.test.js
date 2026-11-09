import assert from "node:assert/strict"
import fs from "node:fs"
import { describe, it } from "node:test"
import { validate } from "../scripts/datamining.js"
import { FACT_ICONS } from "../src/render/fishing.js"

/**
 * @param {"crafting" | "fishing" | "gathering" | "sightseeing"} kind
 * @returns {object[]} Every entry of the lists' data
 */
const entries = (kind) => fs.readdirSync(`src/js/data/${kind}`)
  .flatMap((file) => JSON.parse(fs.readFileSync(`src/js/data/${kind}/${file}`, "utf8")))

describe("Data", () => {
  for (const kind of ["fishing", "gathering", "sightseeing"]) {
    it(`has ${kind} the pages can use`, () => validate(entries(kind)))
  }

  it("has crafting recipes whose items are all known", () => {
    const read = (file) => JSON.parse(fs.readFileSync(`src/js/data/${file}`, "utf8"))
    const recipes = Object.assign({}, ...fs.readdirSync("src/js/data/crafting-recipes").map((file) => read(`crafting-recipes/${file}`)))
    const items = read("crafting-items.json")
    const listed = entries("crafting")

    assert.deepEqual(listed.filter((e) => !recipes[e.id]).map((e) => e.id), [], "listed without its recipe")
    const unknown = Object.values(recipes)
      .flatMap((r) => [r.item, ...r.ingredients.map(([id]) => id), ...r.crystals.map(([id]) => id)])
      .filter((id) => !items[id])
    assert.deepEqual([...new Set(unknown)], [], "items missing from crafting-items.json")
    const lost = Object.values(items).flatMap((i) => i.recipes ?? []).filter((id) => !recipes[id])
    assert.deepEqual(lost, [], "recipe ids without a recipe")
  })

  it("turns down what the pages can't draw", () => {
    const bad = { name: "Test", zone: "South Shroud", hookset: "Double", tug: "huge", bait: [[]], predators: [{ id: 1, count: 0, name: "A" }] }
    assert.throws(() => validate([bad]), (err) => ["hookset", "tug", "bait", "intuition"].every((word) => err.message.includes(word)))
  })

  it("has every game icon the pages link to", () => {
    const saved = new Set(fs.readdirSync("src/images/game").map((file) => Number.parseInt(file)))
    const read = (file) => Object.values(JSON.parse(fs.readFileSync(`src/js/data/${file}`, "utf8")))
    const used = [
      ...read("fishing-items.json").map((info) => info.icon),
      ...read("gathering-items.json").map((info) => info.icon),
      ...read("crafting-items.json").map((info) => info.icon),
      ...read("sightseeing-text.json").map((text) => text.emoteIcon).filter(Boolean),
      ...Object.values(FACT_ICONS)
    ]
    assert.deepEqual([...new Set(used)].filter((icon) => !saved.has(icon)), [])
  })
})
