import { writeData } from "../common.js"
import { sheets } from "../sources/game.js"

// The PvP maps' rotations, as the duty finder opens them. A duty's ContentCloseCycle splits time into slots from a start,
// its own slot count and length, and says in which slots it's open. Frontline's maps share a daily one, Crystalline
// Conflict's an hourly one, each map open in its own slots
const ROTATIONS = { frontline: 86400, crystallineConflict: 3600 }
// ContentCloseCycle's columns past its start and slot length have no names: the slot count, then a flag a slot
const MOST_SLOTS = 10

async function main() {
  const [duties, cycles] = await sheets(["ContentFinderCondition", "ContentCloseCycle"])
  const cycle = Object.fromEntries(cycles.map((c) => [c["#"], {
    start: +c.Unixtime,
    every: +c.TimeSeconds,
    slots: +c.Unknown0,
    open: Array.from({ length: MOST_SLOTS }, (_, i) => c[`Unknown${i + 1}`] === "True")
  }]))

  const out = {}
  for (const [rotation, every] of Object.entries(ROTATIONS)) {
    const pvp = duties.filter((d) => d.PvP === "True" && d.Name && cycle[d.ContentCloseCycle]?.every === every && cycle[d.ContentCloseCycle].slots > 1)
    const first = cycle[pvp[0]?.ContentCloseCycle]
    if (!first) throw new Error(`No PvP duty rotates every ${every}s, has the sheet changed?`)
    if (pvp.some((d) => cycle[d.ContentCloseCycle].start !== first.start || cycle[d.ContentCloseCycle].slots !== first.slots)) {
      throw new Error(`${rotation}'s maps don't share one cycle anymore`)
    }
    // The ranked, casual and custom matches are each a duty of their own, on the same map
    const maps = Array.from({ length: first.slots }, (_, slot) => {
      const names = [...new Set(pvp.filter((d) => cycle[d.ContentCloseCycle].open[slot]).map((d) => d.Name))]
      if (names.length !== 1) throw new Error(`${rotation} slot ${slot} has ${names.length} maps: ${names.join(", ")}`)
      return names[0][0].toUpperCase() + names[0].slice(1)
    })
    out[rotation] = { start: first.start * 1000, every: every * 1000, maps }
  }
  writeData("pvp", out)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
