import assert from "node:assert/strict"
import fs from "node:fs"
import { describe, it } from "node:test"
import { ET_DAY_EARTH_MS, ET_MINUTE_EARTH_MS, nextWindow, toEorzea } from "../src/js/utils/eorzea.js"
import { crystallineConflictAt, frontlineAt } from "../src/js/utils/pvp.js"
import { FASHION_REPORT, gatesAfter, openTournaments, phaseAt, tournaments } from "../src/js/utils/saucer.js"
import { getAllTimerStates } from "../src/js/utils/timers.js"
import { BOARDING, CYCLE, nextVoyageTo, voyageAt } from "../src/js/utils/voyages.js"
import { nextWeatherWindow } from "../src/js/utils/windows.js"
import ZONES from "../src/js/data/weather.json" with { type: "json" }

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const WEATHER_PERIOD = 8 * 175 * 1000
// Sunday 11 October 2026, 12:00 UTC
const NOW = Date.UTC(2026, 9, 11, 12)

/** @returns {number[]} Times spread over a few Earth days from NOW, off any boundary */
const samples = (count = 60) => Array.from({ length: count }, (_, i) => NOW + i * 3_217_123)

/**
 * @param {"fishing" | "sightseeing"} kind
 * @returns {object[]} Every entry of the lists' data
 */
const entries = (kind) => fs.readdirSync(`src/js/data/${kind}`)
  .flatMap((file) => JSON.parse(fs.readFileSync(`src/js/data/${kind}/${file}`, "utf8")))

describe("Eorzea time", () => {
  it("starts at midnight on the 1st sun of the 1st Astral Moon at Unix time 0", () => {
    assert.deepEqual(toEorzea(0), { hours: 0, minutes: 0, sun: 1, moon: 1, moonName: "1st Astral Moon" })
  })

  it("runs an ET hour in 175 seconds and an ET day in 70 minutes", () => {
    assert.equal(toEorzea(175_000).hours, 1)
    assert.equal(ET_DAY_EARTH_MS, 70 * 60 * 1000)
    assert.deepEqual(toEorzea(ET_DAY_EARTH_MS + 30 * ET_MINUTE_EARTH_MS), { hours: 0, minutes: 30, sun: 2, moon: 1, moonName: "1st Astral Moon" })
  })
})

describe("Gathering windows", () => {
  const day = Math.floor(NOW / ET_DAY_EARTH_MS) * ET_DAY_EARTH_MS
  const at = (etMinutes) => day + etMinutes * ET_MINUTE_EARTH_MS

  it("is open inside its window and points to the next one after", () => {
    const node = { times: [[120, 120]] }
    assert.deepEqual(nextWindow(node, at(150)), { start: at(120), end: at(240), open: true })
    assert.deepEqual(nextWindow(node, at(240)), { start: at(1560), end: at(1680), open: false })
  })

  it("keeps a window running past ET midnight open on the other side", () => {
    const node = { times: [[1320, 180]] }
    assert.deepEqual(nextWindow(node, at(30)), { start: at(-120), end: at(60), open: true })
  })
})

describe("Weather windows", () => {
  it("has exactly one of a zone's weathers at any time", () => {
    for (const zone of ZONES) {
      const names = [...new Set(zone.weather.map(([name]) => name))]
      for (const now of samples(20)) {
        const open = names.filter((name) => nextWeatherWindow({ zone: zone.name, weather: [name] }, now)?.open)
        assert.equal(open.length, 1, `${zone.name} at ${new Date(now).toISOString()}: ${open.join(", ") || "none"}`)
      }
    }
  })

  it("starts and ends weather-only windows on weather periods", () => {
    for (const now of samples()) {
      const w = nextWeatherWindow({ zone: "South Shroud", weather: ["Fog"] }, now)
      assert.equal(w.start % WEATHER_PERIOD, 0)
      assert.equal(w.end % WEATHER_PERIOD, 0)
      assert.ok(w.end > now)
    }
  })

  it("only opens after the weather it needs before", () => {
    const entry = { zone: "Central Shroud", weather: ["Rain"], previousWeather: ["Clouds"] }
    for (const now of samples(10)) {
      const w = nextWeatherWindow(entry, now)
      assert.ok(nextWeatherWindow({ zone: entry.zone, weather: ["Rain"] }, w.start).open)
      assert.ok(nextWeatherWindow({ zone: entry.zone, weather: ["Clouds"] }, w.start - 1).open)
    }
  })

  it("keeps a timed window inside its ET hours", () => {
    for (const now of samples()) {
      const w = nextWeatherWindow({ zone: "South Shroud", times: [[1080, 360]], weather: ["Clear Skies", "Fair Skies"] }, now)
      const { hours } = toEorzea(w.start)
      assert.ok(hours >= 18, `starts at ${hours}:00 ET`)
      assert.ok(w.end - w.start <= 360 * ET_MINUTE_EARTH_MS)
    }
  })

  it("gives an open window the start it opened at, not the period it's in now", () => {
    const entry = { zone: "South Shroud", weather: ["Clear Skies", "Fair Skies"] }
    let open = 0
    for (const now of samples()) {
      const w = nextWeatherWindow(entry, now)
      if (!w.open) continue
      open++
      assert.ok(!nextWeatherWindow(entry, w.start - 1).open, `opened before ${new Date(w.start).toISOString()}`)
    }
    assert.ok(open > 10)
  })

  it("joins a window across weather periods and ET midnight", () => {
    const w = nextWeatherWindow({ zone: "South Shroud", times: [[1320, 180]] }, NOW)
    assert.equal(w.end - w.start, 180 * ET_MINUTE_EARTH_MS)
    assert.equal(toEorzea(w.start).hours, 22)
  })

  // Worked out by this code on 11 Oct 2026, so a change to the weather math shows up here first
  it("matches pinned windows", () => {
    assert.deepEqual(nextWeatherWindow({ zone: "South Shroud", weather: ["Thunder", "Thunderstorms"] }, NOW),
      { start: Date.parse("2026-10-11T12:00:00Z"), end: Date.parse("2026-10-11T12:23:20Z"), open: true })
    assert.deepEqual(nextWeatherWindow({ zone: "Yak T'el", times: [[0, 120]], weather: ["Fog"] }, NOW),
      { start: Date.parse("2026-10-11T13:10:00Z"), end: Date.parse("2026-10-11T13:15:50Z"), open: false })
  })

  it("finds a window within 30 days for every timed fish and vista", () => {
    for (const entry of [...entries("fishing"), ...entries("sightseeing")]) {
      if (!entry.times && !entry.weather && !entry.previousWeather) continue
      assert.ok(nextWeatherWindow(entry, NOW), `${entry.name} in ${entry.zone}`)
    }
  })
})

describe("Timers", () => {
  const timer = (id, now) => getAllTimerStates(now).find((t) => t.id === id)

  it("resets daily at 15:00 UTC", () => {
    assert.equal(timer("daily", NOW).target, Date.UTC(2026, 9, 11, 15))
    assert.equal(timer("daily", Date.UTC(2026, 9, 11, 15)).target, Date.UTC(2026, 9, 12, 15))
  })

  it("resets weekly on Tuesday at 08:00 UTC", () => {
    assert.equal(timer("weekly", NOW).target, Date.UTC(2026, 9, 13, 8))
    assert.equal(timer("weekly", Date.UTC(2026, 9, 13, 8)).target, Date.UTC(2026, 9, 20, 8))
  })

  it("runs the housing lottery in 5 days of entries, then 4 of results", () => {
    const start = 1653577200000
    assert.equal(timer("housing", start).title, "Housing: Application Period")
    assert.equal(timer("housing", start).target, start + 5 * DAY)
    assert.equal(timer("housing", start + 5 * DAY).title, "Housing: Results Period")
    assert.equal(timer("housing", start + 9 * DAY).target, start + 14 * DAY)
  })

  it("always counts down to a time ahead", () => {
    for (const now of samples()) {
      for (const state of getAllTimerStates(now)) assert.ok(state.target > now, `${state.id} at ${new Date(now).toISOString()}`)
    }
  })
})

describe("PvP maps", () => {
  it("rotates Frontline at the daily reset, like PvP Calendar's", () => {
    assert.equal(frontlineAt(Date.UTC(2026, 9, 11, 14)).map, "Onsal Hakair (Danshig Naadam)")
    assert.equal(frontlineAt(Date.UTC(2026, 9, 11, 15)).map, "Worqor Chirteh (Triumph)")
    assert.equal(frontlineAt(Date.UTC(2026, 9, 13, 16)).map, "Borderland Ruins (Secure)")
    assert.equal(frontlineAt(Date.UTC(2026, 9, 17, 16)).map, "Fields of Glory (Shatter)")
  })

  it("rotates Crystalline Conflict on the hour", () => {
    assert.equal(crystallineConflictAt(Date.UTC(2026, 9, 11, 21, 30)).map, "The Bayside Battleground")
    assert.equal(crystallineConflictAt(Date.UTC(2026, 9, 12, 2, 10)).map, "The Palaistra")
  })

  it("is always on a map that ends after now", () => {
    for (const now of samples()) {
      for (const on of [frontlineAt(now), crystallineConflictAt(now)]) assert.ok(on.map && on.start <= now && on.end > now)
    }
  })
})

describe("Ocean fish voyages", () => {
  const ocean = entries("fishing").filter((fish) => fish.ocean)

  it("finds a voyage to every ocean fish's stop, at its time of day, within the 12-day schedule", () => {
    for (const fish of ocean) {
      const w = nextVoyageTo(fish.ocean, NOW)
      assert.ok(w && w.start < NOW + CYCLE, fish.name)
      const stops = ["indigo", "ruby"].flatMap((route) => voyageAt(route, w.start).stops)
      assert.ok(stops.some((s) => s.place === fish.ocean.stop && (!fish.ocean.time || s.time === fish.ocean.time)), fish.name)
    }
  })

  it("counts the voyage boarding now, and moves on once boarding closes", () => {
    const sothis = ocean.find((fish) => fish.name === "Sothis").ocean
    const next = nextVoyageTo(sothis, NOW)
    assert.deepEqual(nextVoyageTo(sothis, next.start + 60_000), { start: next.start, end: next.start + BOARDING, open: true })
    assert.ok(nextVoyageTo(sothis, next.end).start > next.start)
  })
})

describe("Gold Saucer", () => {
  it("picks the GATE pool by the minute past the hour it starts at", () => {
    const [first, second, third, fourth] = gatesAfter(Date.UTC(2026, 9, 18, 12, 5), 4)
    assert.equal(first.start, Date.UTC(2026, 9, 18, 12, 20))
    assert.ok(first.pool.some((g) => g.name === "Any Way the Wind Blows"))
    assert.ok(second.pool.some((g) => g.name === "Leap of Faith") && second.pool.some((g) => g.name === "The Slice Is Right"))
    assert.ok(third.pool.some((g) => g.name === "Cliffhanger"))
    assert.equal(fourth.pool, first.pool)
  })

  it("opens tournament registration on odd hours UTC, as the game's schedule showed on 18 October 2026", () => {
    // 12:18 UTC, the official said the next one begins in 41 minutes
    const [next, after, third] = openTournaments(Date.UTC(2026, 9, 18, 12, 18), 3)
    assert.deepEqual([next.start, next.open, next.ruleset], [Date.UTC(2026, 9, 18, 13), false, "Advanced"])
    assert.equal(after.ruleset, "Basic")
    assert.equal(third.ruleset, "Advanced")
    assert.equal(openTournaments(Date.UTC(2026, 9, 18, 23), 1)[0].ruleset, "Basic")

    const [current] = openTournaments(Date.UTC(2026, 9, 18, 13, 29), 1)
    assert.deepEqual([current.start, current.open], [Date.UTC(2026, 9, 18, 13), true])
    assert.equal(openTournaments(Date.UTC(2026, 9, 18, 13, 30), 1)[0].start, Date.UTC(2026, 9, 18, 15))
  })

  it("runs the tournament every other week from the weekly reset", () => {
    assert.deepEqual(tournaments(Date.UTC(2026, 9, 18, 12), 1)[0], { start: Date.UTC(2026, 9, 13, 8), end: Date.UTC(2026, 9, 20, 8) })
    assert.equal(tournaments(Date.UTC(2026, 9, 20, 8), 1)[0].start, Date.UTC(2026, 9, 27, 8))
    assert.equal(tournaments(Date.UTC(2026, 9, 1), 1)[0].start, Date.UTC(2026, 8, 29, 8))
  })

  it("judges the Fashion Report from Friday until the weekly reset", () => {
    assert.equal(phaseAt(FASHION_REPORT, Date.UTC(2026, 9, 15, 12)).name, "Theme revealed")
    const judging = phaseAt(FASHION_REPORT, Date.UTC(2026, 9, 18, 12))
    assert.deepEqual([judging.name, judging.start, judging.end], ["Judging", Date.UTC(2026, 9, 16, 8), Date.UTC(2026, 9, 20, 8)])
  })
})
