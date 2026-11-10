import fs from "fs"
import path from "path"
import sharp from "sharp"
import { fileURLToPath } from "url"
import { slug, writeData } from "../common.js"
import { readTexture, sheets } from "../sources/game.js"

// The PvP maps' rotations, as the duty finder opens them. A duty's ContentCloseCycle splits time into slots from a start,
// its own slot count and length, and says in which slots it's open. Frontline's maps share a daily one, Crystalline
// Conflict's an hourly one, each map open in its own slots
const ROTATIONS = { frontline: 86400, crystallineConflict: 3600 }
// ContentCloseCycle's columns past its start and slot length have no names: the slot count, then a flag a slot
const MOST_SLOTS = 10

const BANNERS = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../src/images/pvp")
// The duty finder's banners are 1128x360 with a feathered clear edge this wide
const BANNER_EDGE = 20

/** @param {string} name */
const capitalized = (name) => name[0].toUpperCase() + name.slice(1)

/**
 * The map a duty is on. Crystalline Conflict's custom matches name theirs, "Crystalline Conflict (Custom Match - The
 * Palaistra)".
 * @param {Record<string, string>} duty
 * @returns {string}
 */
const mapOf = (duty) => capitalized(duty.Name.match(/\(Custom Match - (.+)\)$/)?.[1] ?? duty.Name)

/**
 * Each map's own duty finder banner. Casual and ranked share a generic one across the maps, the one used by no other map
 * is that map's.
 * @param {Record<string, string>[]} pvp
 * @param {string[]} maps
 * @returns {Record<string, number>} Map name to its banner's icon id
 */
function bannersOf(pvp, maps) {
  const usedBy = new Map()
  for (const d of pvp) {
    if (!+d.Image) continue
    if (!usedBy.has(d.Image)) usedBy.set(d.Image, new Set())
    usedBy.get(d.Image).add(mapOf(d))
  }
  return Object.fromEntries(maps.map((map) => {
    const own = [...new Set(pvp.filter((d) => mapOf(d) === map && usedBy.get(d.Image)?.size === 1).map((d) => d.Image))]
    if (own.length !== 1) throw new Error(`${map} has ${own.length} banners of its own`)
    return [map, +own[0]]
  }))
}

/**
 * Saves a map's banner to src/images/pvp/<slug>.webp, its edge trimmed. The rows and tiles crop it with CSS.
 * @param {number} icon
 * @param {string} name File name, without .webp
 */
async function saveBanner(icon, name) {
  const folder = String(Math.floor(icon / 1000) * 1000).padStart(6, "0")
  const texture = readTexture(`ui/icon/${folder}/${String(icon).padStart(6, "0")}_hr1.tex`)
  if (!texture) throw new Error(`No banner ${icon} in the game's files`)
  const { width, height, rgba } = texture
  const trimmed = { left: BANNER_EDGE, top: BANNER_EDGE, width: width - BANNER_EDGE * 2, height: height - BANNER_EDGE * 2 }
  await sharp(rgba, { raw: { width, height, channels: 4 } }).extract(trimmed).webp({ quality: 60, effort: 6 })
    .toFile(path.join(BANNERS, `${name}.webp`))
}

async function main() {
  const [duties, cycles] = await sheets(["ContentFinderCondition", "ContentCloseCycle"])
  const cycle = Object.fromEntries(cycles.map((c) => [c["#"], {
    start: +c.Unixtime,
    every: +c.TimeSeconds,
    slots: +c.Unknown0,
    open: Array.from({ length: MOST_SLOTS }, (_, i) => c[`Unknown${i + 1}`] === "True")
  }]))
  const pvp = duties.filter((d) => d.PvP === "True" && d.Name)

  const out = {}
  for (const [rotation, every] of Object.entries(ROTATIONS)) {
    const rotating = pvp.filter((d) => cycle[d.ContentCloseCycle]?.every === every && cycle[d.ContentCloseCycle].slots > 1)
    const first = cycle[rotating[0]?.ContentCloseCycle]
    if (!first) throw new Error(`No PvP duty rotates every ${every}s, has the sheet changed?`)
    if (rotating.some((d) => cycle[d.ContentCloseCycle].start !== first.start || cycle[d.ContentCloseCycle].slots !== first.slots)) {
      throw new Error(`${rotation}'s maps don't share one cycle anymore`)
    }
    // The ranked, casual and custom matches are each a duty of their own, on the same map
    const maps = Array.from({ length: first.slots }, (_, slot) => {
      const names = [...new Set(rotating.filter((d) => cycle[d.ContentCloseCycle].open[slot]).map(mapOf))]
      if (names.length !== 1) throw new Error(`${rotation} slot ${slot} has ${names.length} maps: ${names.join(", ")}`)
      return names[0]
    })
    out[rotation] = { start: first.start * 1000, every: every * 1000, maps }
  }

  const maps = [...new Set(Object.values(out).flatMap((r) => r.maps))]
  const banners = bannersOf(pvp, maps)

  // Frontline's duties name their mode, "Seal Rock (Seize)": the page shows the map and the mode apart
  const modes = {}
  const split = (full) => {
    const [, map, mode] = full.match(/^(.+) \((.+)\)$/) ?? []
    if (!mode) throw new Error(`Frontline's ${full} names no mode`)
    modes[map] = mode
    return map
  }
  const short = Object.fromEntries(maps.map((full) => [full, out.frontline.maps.includes(full) ? split(full) : full]))
  out.frontline.maps = out.frontline.maps.map((full) => short[full])

  fs.mkdirSync(BANNERS, { recursive: true })
  for (const full of maps) await saveBanner(banners[full], slug(short[full]))
  console.log(`Banners: ${maps.length} saved`)
  out.modes = modes
  out.banners = Object.fromEntries(maps.map((full) => [short[full], slug(short[full])]))
  writeData("pvp", out)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
