import assert from "node:assert/strict"
import { describe, it } from "node:test"

globalThis.location ??= { origin: "https://ffxiv.watch" }
const { findList, freeName, listUrl, newList, renameList, sharedList, shareUrl } = await import("../src/js/utils/lists.js")

const codeOf = (url) => new URL(url).searchParams.get("share")

describe("Shared lists", () => {
  it("comes back from its link as it went in, without what's in hand", () => {
    const list = {
      ...newList("Raid food ✨"),
      items: [{ slug: "grade-8-tincture-of-strength", name: "Grade 8 Tincture of Strength", icon: 20701, item: 49234, amount: 12 }],
      gotten: [44058],
      have: { 44058: 3 }
    }
    const url = shareUrl(list)
    assert.ok(url.startsWith("https://ffxiv.watch/lists/?share="))
    const back = sharedList(codeOf(url))
    assert.equal(back.name, "Raid food ✨")
    assert.deepEqual(back.items, list.items)
    assert.deepEqual(back.gotten, [44058])
    assert.deepEqual(back.have, {})
    assert.equal(back.id, "Raid food ✨", "it goes by its name, like any list")
  })

  it("turns down a link that's broken or made up", () => {
    assert.equal(sharedList(null), null)
    assert.equal(sharedList("not base64 at all!"), null)
    assert.equal(sharedList(btoa(JSON.stringify({ hello: "there" }))), null)
  })

  it("keeps amounts in range and drops items that aren't a page", () => {
    const code = btoa(JSON.stringify([1, "x", [["ok-item", 100000, 1, 1, "Ok"], ["../evil", 1, 2, 2, "Evil"], "junk"], []]))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
    const list = sharedList(code)
    assert.deepEqual(list.items.map((i) => [i.slug, i.amount]), [["ok-item", 9999]])
  })
})

describe("Lists by name", () => {
  const lists = [newList("Raid prep"), newList("My list")]

  it("finds a list by its name, whatever the case", () => {
    assert.equal(findList(lists, "raid PREP"), lists[0])
    assert.equal(findList(lists, "Nope"), null)
    assert.equal(findList(lists, null), null)
  })

  it("never gives two the same name, their case aside", () => {
    assert.equal(freeName(lists), "My list 2")
    assert.equal(freeName(lists, "my LIST"), "my LIST 2")
    assert.equal(freeName(lists, "Housing"), "Housing")
  })

  it("renames to a free name, and its id along", () => {
    const list = newList("Housing")
    const all = [...lists, list]
    assert.equal(renameList(all, list, "raid prep"), "raid prep 2")
    assert.equal(list.id, "raid prep 2")
    assert.equal(renameList(all, list, "  "), "raid prep 2", "an empty name keeps the one it had")
  })

  it("has its name in its address, back and forth", () => {
    const url = listUrl(newList("Tea & cake ✨"))
    assert.equal(new URL(url, "https://ffxiv.watch").searchParams.get("name"), "Tea & cake ✨")
  })
})
