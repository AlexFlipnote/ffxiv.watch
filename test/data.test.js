import assert from "node:assert/strict"
import fs from "node:fs"
import { describe, it } from "node:test"
import { validate } from "../scripts/datamining.js"
import { FACT_ICONS } from "../src/render/fishing.js"

/**
 * @param {"fishing" | "gathering" | "sightseeing"} kind
 * @returns {object[]} Every entry of the lists' data
 */
const entries = (kind) => fs.readdirSync(`src/js/data/${kind}`)
  .flatMap((file) => JSON.parse(fs.readFileSync(`src/js/data/${kind}/${file}`, "utf8")))

describe("Data", () => {
  for (const kind of ["fishing", "gathering", "sightseeing"]) {
    it(`has ${kind} the pages can use`, () => validate(entries(kind)))
  }

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
      ...read("sightseeing-text.json").map((text) => text.emoteIcon).filter(Boolean),
      ...Object.values(FACT_ICONS)
    ]
    assert.deepEqual([...new Set(used)].filter((icon) => !saved.has(icon)), [])
  })
})
