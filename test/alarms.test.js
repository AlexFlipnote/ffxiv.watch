import assert from "node:assert/strict"
import fs from "node:fs"
import { describe, it } from "node:test"
import { ET_DAY_EARTH_MS, ET_MINUTE_EARTH_MS } from "../src/js/utils/eorzea.js"
import { alarmsDue, alarmWindow, ringDue } from "../src/js/utils/forecast.js"
import { nextVoyageTo } from "../src/js/utils/voyages.js"
import { alarmTiming, nextWeatherWindow } from "../src/js/utils/windows.js"

const ET_HOUR = 60 * ET_MINUTE_EARTH_MS
// An ET midnight in October 2026
const DAY = Math.ceil(Date.UTC(2026, 9, 20) / ET_DAY_EARTH_MS) * ET_DAY_EARTH_MS
// Up 10:00 to 11:00 ET every day
const alarm = (extra = {}) => ({ id: "node:1", name: "Test Ore", url: "/", place: "Here", times: [[600, 60]], ...extra })
const START = DAY + 10 * ET_HOUR
const TOMORROW = START + ET_DAY_EARTH_MS

describe("Alarms", () => {
  it("waits for the window when it rings as it opens", () => {
    assert.deepEqual(alarmsDue([alarm()], START - 1000, 0), { due: [], next: START })
  })

  it("rings for a window that has just opened", () => {
    const { due } = alarmsDue([alarm()], START + 5000, 0)
    assert.equal(due.length, 1)
    assert.equal(due[0][1].start, START)
  })

  it("rings once per window, then waits for the next", () => {
    assert.deepEqual(alarmsDue([alarm({ rung: START })], START + 5000, 0), { due: [], next: TOMORROW })
  })

  it("skips a window that opened too long ago to still ring", () => {
    assert.deepEqual(alarmsDue([alarm()], START + 5 * 60 * 1000, 0), { due: [], next: TOMORROW })
  })

  it("rings an ocean fish's alarm as boarding opens for the voyage to its stop", () => {
    const sothis = alarm({ id: "fish:29788", ocean: { stop: "Galadion Bay", time: "Night" } })
    const voyages = (a, now) => nextVoyageTo(a.ocean, now)
    const boarding = nextVoyageTo(sothis.ocean, START)
    assert.deepEqual(alarmsDue([sothis], boarding.start - 1000, 0, voyages), { due: [], next: boarding.start })
    assert.equal(alarmsDue([sothis], boarding.start + 5000, 0, voyages).due[0][1].start, boarding.start)
    const later = alarmsDue([{ ...sothis, rung: boarding.start }], boarding.start + 5000, 0, voyages).next
    assert.equal(later, nextVoyageTo(sothis.ocean, boarding.end).start)
  })

  it("rings the lead time before the window", () => {
    const lead = 2 * ET_HOUR
    assert.deepEqual(alarmsDue([alarm()], START - 3 * ET_HOUR, lead), { due: [], next: START - lead })
    assert.equal(alarmsDue([alarm()], START - ET_HOUR, lead).due.length, 1)
  })

  it("rings alarms due together in one go", () => {
    const { due } = alarmsDue([alarm(), alarm({ id: "node:2" })], START + 1000, 0)
    assert.deepEqual(due.map(([a]) => a.id), ["node:1", "node:2"])
  })

  it("plays the sound once and first, however many ring", () => {
    const calls = []
    ringDue([[alarm(), {}], [alarm({ id: "node:2" }), {}]], () => calls.push("sound"), (a) => calls.push(a.id))
    assert.deepEqual(calls, ["sound", "node:1", "node:2"])
  })

  it("rings the rest when one's notification throws, like on Android", (t) => {
    t.mock.method(console, "error", () => {})
    const rung = []
    ringDue([[alarm(), {}], [alarm({ id: "node:2" }), {}]], () => {}, (a) => {
      if (a.id === "node:1") throw new TypeError("Illegal constructor")
      rung.push(a.id)
    })
    assert.deepEqual(rung, ["node:2"])
  })

  it("works out a weather fish's windows from what it keeps, the same as the list does", () => {
    const fish = fs.readdirSync("src/js/data/fishing")
      .flatMap((file) => JSON.parse(fs.readFileSync(`src/js/data/fishing/${file}`, "utf8")))
      .filter((f) => f.weather || f.previousWeather)
      .filter((_, i) => i % 10 === 0)
    assert.ok(fish.length > 10)
    for (const f of fish) {
      const kept = JSON.parse(JSON.stringify(alarmTiming(f)))
      assert.deepEqual(alarmWindow(kept, START), nextWeatherWindow(f, START), f.name)
    }
  })
})
