import assert from "node:assert/strict"
import { describe, it } from "node:test"

// search.js listens for Ctrl+K on the document when it loads
globalThis.document ??= { addEventListener() {} }
const { entriesOf, rank } = await import("../src/js/utils/search.js")
const { default: searchData } = await import("../src/data/search.js")
const entries = entriesOf(JSON.parse(searchData().index.content))

/** @param {string} query @returns {string[]} The names it finds, best first */
const names = (query) => rank(entries, query).map((e) => e.name)

describe("Search", () => {
  it("gives every entry its own page", () => {
    const urls = entries.map((e) => e.url)
    assert.equal(new Set(urls).size, urls.length)
  })

  it("puts the exact name first, with or without \"The\"", () => {
    assert.equal(names("ruby sea")[0], "The Ruby Sea")
    assert.equal(names("azim steppe")[0], "The Azim Steppe")
  })

  it("puts whole words before part of one", () => {
    assert.ok(names("la noscea").slice(0, 6).every((name) => name.endsWith("La Noscea")))
  })

  it("leaves out what's hard to type", () => {
    assert.equal(names("raktika greatwood")[0], "The Rak'tika Greatwood")
  })

  it("finds words in any order, and shortened names", () => {
    assert.equal(names("greatwood raktika")[0], "The Rak'tika Greatwood")
    assert.equal(names("dufi")[0], "Durdina Fish")
    assert.equal(names("mosqito")[0], "Mosquito Fish")
  })

  it("puts the pages first, found by their keywords too", () => {
    assert.equal(names("fish")[0], "Fishing")
    assert.equal(names("cactpot")[0], "Gold Saucer")
  })

  it("puts a kind named in the query first", () => {
    assert.equal(rank(entries, "weather kugane")[0].kind, "Weather")
    assert.ok(rank(entries, "fish ruby").slice(0, 5).every((e) => e.kind === "Fish"))
  })

  it("finds nothing for nothing", () => {
    assert.deepEqual(names(""), [])
    assert.deepEqual(names("xqzv"), [])
  })
})
