import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { entriesOf, eventName, leadOf, patchNumber, patchOf, periodOf, windowOf } from "../scripts/lodestone-data.js"

/**
 * @param {number | null} ms
 * @returns {string | null} Like "2026-10-12T10:00"
 */
const iso = (ms) => ms === null ? null : new Date(ms).toISOString().slice(0, 16)

/**
 * @param {{ start: number, end: number | null, until?: string } | null} period
 * @returns {object | null} Its times as ISO strings, for readable failures
 */
const readable = (period) => period && { ...period, start: iso(period.start), end: iso(period.end) }

describe("maintenance windows", () => {
  const cases = [
    ["Oct. 12, 2026 10:00 to Oct. 13, 2026 10:00 (GMT)", "2026-10-12T10:00", "2026-10-13T10:00"],
    ["Oct. 9, 2026 10:35 to 11:55 (GMT)", "2026-10-09T10:35", "2026-10-09T11:55"],
    ["From Oct. 8, 2026 22:10 to Oct.9, 2026 02:30 (GMT)", "2026-10-08T22:10", "2026-10-09T02:30"],
    ["Oct. 6, 2026 from 16:26 to 16:52 (GMT)", "2026-10-06T16:26", "2026-10-06T16:52"],
    ["Dec. 31, 2026 23:00 to 2:00 (GMT)", "2026-12-31T23:00", "2027-01-01T02:00"],
    ["Sept. 1, 2026 1:00 to 2:00 (GMT)", "2026-09-01T01:00", "2026-09-01T02:00"]
  ]
  for (const [line, start, end] of cases) {
    it(line, () => {
      assert.deepEqual(readable(windowOf(`[Date & Time]\n${line}\nOct. 12, 2026 11:00 to 12:00 (BST)`)), { start, end })
    })
  }

  it("only reads the window under [Date & Time]", () => {
    const text = "Resumed at Oct. 9, 2026 9:00 to 9:30 (GMT).\n[Date & Time]\nOct. 9, 2026 10:35 to 11:55 (GMT)"
    assert.equal(iso(windowOf(text).start), "2026-10-09T10:35")
  })

  it("is null without one", () => {
    assert.equal(windowOf("Oct. 9, 2026 10:35 to 11:55 (GMT)"), null)
    assert.equal(windowOf("[Date & Time]\nTo be announced"), null)
  })

  it("finds the patch a maintenance brings", () => {
    assert.equal(patchOf("In order to implement Patch 7.5, maintenance will take place on all Worlds"), "7.5")
    assert.equal(patchOf("Maintenance will take place on all Worlds"), null)
  })
})

describe("event periods", () => {
  it("reads an Event Period", () => {
    const text = "Event Period\nWednesday, 7 October 2026 at 8:00 (GMT) / 9:00 (BST) / 19:00 (AEDT)\n"
      + "until Tuesday, 27 October 2026 at 14:59 (GMT) / 28 October at 1:59 (AEDT)"
    assert.deepEqual(readable(periodOf(text)), { start: "2026-10-07T08:00", end: "2026-10-27T14:59" })
  })

  it("reads a special page's, without brackets around GMT", () => {
    const text = "From Thursday, 15 October 2026 at 8:00 GMT (19:00 AEDT)\nto Monday, 2 November 2026 at 14:59 GMT (3 Nov at 1:59 AEDT)"
    assert.deepEqual(readable(periodOf(text)), { start: "2026-10-15T08:00", end: "2026-11-02T14:59" })
  })

  it("reads short months", () => {
    const text = "From Wednesday, 9 Sept. 2026 at 8:00 (GMT) / 18:00 (AEST)\nto Monday, 19 Oct. 2026 at 14:59 (GMT) / 20 Oct. at 1:59 (AEDT)"
    assert.deepEqual(readable(periodOf(text)), { start: "2026-09-09T08:00", end: "2026-10-19T14:59" })
  })

  it("reads one that runs until a patch", () => {
    const text = "From Tuesday, 31 March 2026 at 8:00 GMT (19:00 AEDT)\nto the release of Patch 7.5"
    assert.deepEqual(readable(periodOf(text)), { start: "2026-03-31T08:00", end: null, until: "7.5" })
  })

  it("leaves out a sale with no start time", () => {
    assert.equal(periodOf("Monday, 14 September to Wednesday, 30 September 2026 at 7:00 (GMT) / 8:00 (BST)"), null)
  })

  it("names events without the announcement", () => {
    assert.equal(eventName("All Saints' Wake Begins 15 October"), "All Saints' Wake")
    assert.equal(eventName("Fall Guys Collaboration Event Returns 7 October!"), "Fall Guys Collaboration Event")
    assert.equal(eventName("Valentione's Day Comes to Eorzea on 2 February"), "Valentione's Day")
    assert.equal(eventName("Breaking Brick Mountains"), "Breaking Brick Mountains")
  })

  it("compares patches by number", () => {
    assert.ok(patchNumber("7.56x1") > patchNumber("7.5"))
    assert.ok(patchNumber("7.1") > patchNumber("7.05"))
  })
})

describe("feeds", () => {
  it("reads an Atom entry and undoes its escaping", () => {
    const xml = `<feed><entry>
      <title>All Saints&#39; Wake</title>
      <link rel="enclosure" href="https://img.finalfantasyxiv.com/t/abc.jpg?1791446596" type="image/jpeg" />
      <link rel="alternate" type="text/html" href="https://eu.finalfantasyxiv.com/lodestone/topics/detail/abc" />
      <updated>2026-10-08T08:00:00Z</updated>
      <category term="Maintenance" />
      <content type="html">[Date &amp; Time]&lt;br&gt;</content>
    </entry></feed>`
    assert.deepEqual(entriesOf(xml), [{
      title: "All Saints' Wake",
      url: "https://eu.finalfantasyxiv.com/lodestone/topics/detail/abc",
      category: "Maintenance",
      html: "[Date & Time]<br>",
      image: "https://img.finalfantasyxiv.com/t/abc.jpg?1791446596",
      updated: "2026-10-08T08:00:00Z"
    }])
  })

  it("takes a topic's first paragraph as its lead", () => {
    const html = "<img src=\"banner.png\"><p>We are delighted to announce that the Fall Guys collaboration will be "
      + "blundering back to a realm near you very soon!<br><br>Join a Blunderville show&apos;s prizes</p>"
    assert.equal(leadOf(html), "We are delighted to announce that the Fall Guys collaboration will be blundering back to a realm near you very soon!")
  })
})
