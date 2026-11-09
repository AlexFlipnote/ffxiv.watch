import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { byId, sheets } from "./sources/game.js"

// What the builders in build/ share: names, map math, aetherytes, scrips, and writing and checking the data. Nothing
// here goes online, that's for the files in sources/, one per place the data comes from

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..")
const DATA = path.join(ROOT, "src/js/data")

/**
 * @param {string} name
 * @returns {string} "A Realm Reborn" -> "a-realm-reborn"
 */
export const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")

/**
 * Some spots are named after their zone, a town's docks are "Limsa Lominsa Upper Decks" in Limsa Lominsa Upper Decks.
 * @param {string | undefined} name The spot's PlaceName
 * @param {string} zone
 * @returns {{ spot?: string }} To spread into an entry, empty when it has no name of its own
 */
export const spotOf = (name, zone) => name && name !== zone ? { spot: name } : {}

/** @param {number} n */
export const round = (n) => Math.round(n * 10) / 10

/**
 * Times are stored as HHMM ET. Durations too, but with minutes past 59: 160 is 1h60m, so 2 hours.
 * @param {string} hhmm
 * @returns {number} ET minutes
 */
export const minutes = (hhmm) => Math.floor(+hhmm / 100) * 60 + (+hhmm % 100)

/**
 * A world position as the game's map coordinates. A map texture is 2048px, covering 2048 / scale world units
 * around the map's offset.
 * @param {Record<string, string>} map Map sheet row
 * @param {number | string} x World X
 * @param {number | string} z World Z, the ground plane's other axis (the game's Y is height)
 * @param {number | string} [radius] In world units
 * @returns {{ image: string, scale: number, x: number, y: number, radius: number }} What mapModal.js places the pin with
 */
export function mapPosition(map, x, z, radius = 0) {
  const scale = +map.SizeFactor / 100
  const coord = (value, offset) => (41 / scale) * (((+value + +offset) * scale + 1024) / 2048) + 1
  return {
    image: map.Id.replace("/", "-"),
    scale: +map.SizeFactor,
    x: round(coord(x, map.OffsetX)),
    y: round(coord(z, map.OffsetY)),
    radius: round(+radius * 41 / 2048)
  }
}

// MapMarker.DataType for an aetheryte, its DataKey is then the Aetheryte row
const AETHERYTE_MARKER = "3"

/**
 * The aetherytes on each map, in the sheet's order, which starts with the zone's main one. Aethernet shards don't
 * count, only the ones you can teleport to. Their Level rows aren't in the sheets, so the position comes from the map's
 * marker for it, placed in pixels on the 2048px map texture.
 * @param {{ aetherytes: Record<string, string>[], markers: Record<string, string>[], map: object, place: object }} sheets
 * Aetheryte and MapMarker rows, and Map and PlaceName by id
 * @returns {Map<string, { name: string, x: number, y: number }[]>} Map row id -> its aetherytes, x/y are map coordinates
 */
export function aetherytesByMap({ aetherytes, markers, map, place }) {
  // A MapMarker row id is "<Map.MapMarkerRange>.<n>"
  const marker = new Map(markers
    .filter((mm) => mm.DataType === AETHERYTE_MARKER)
    .map((mm) => [`${mm["#"].split(".")[0]}|${mm.DataKey}`, mm]))

  const byMap = new Map()
  for (const a of aetherytes) {
    const m = map[a.Map]
    const mm = m && marker.get(`${m.MapMarkerRange}|${a["#"]}`)
    const name = place[a.PlaceName]?.Name
    if (a.IsAetheryte !== "True" || a.Invisible === "True" || !mm || !name) continue

    const coord = (px) => round((41 / (+m.SizeFactor / 100)) * (+px / 2048) + 1)
    byMap.set(a.Map, [...byMap.get(a.Map) ?? [], { name, x: coord(mm.X), y: coord(mm.Y) }])
  }
  return byMap
}

/**
 * Builds a lookup for the aetheryte closest to a spot, on the same map, see aetherytesByMap.
 * @param {{ aetherytes: Record<string, string>[], markers: Record<string, string>[], map: object, place: object }} sheets
 * @returns {(mapRowId: string, x: number, y: number) => { name: string, x: number, y: number } | null} x/y are map coordinates
 */
export function nearestAetheryte(sheets) {
  const byMap = aetherytesByMap(sheets)
  return (mapRowId, x, y) => {
    const distance = (a) => Math.hypot(a.x - x, a.y - y)
    return byMap.get(mapRowId)?.reduce((best, a) => distance(a) < distance(best) ? a : best) ?? null
  }
}

// CollectablesShopRewardScrip.Currency, as the Item the scrip is: Purple and Orange, Crafters' then Gatherers'
export const SCRIP_ITEMS = { 2: 33913, 4: 33914, 6: 41784, 7: 41785 }
// CollectablesShop.RewardType of the shops paying in scrips, the rest pay in items
const SCRIP_SHOP = "1"
const TIERS = ["Low", "Mid", "High"]

/**
 * What the collectables are worth at the scrip exchange. The current exchange only, the retired one ("●収集品回収")
 * still has its rows but no quest unlocking it.
 * @param {Record<string, Record<string, string>>} item Item by id
 * @returns {Promise<Map<number, { name: string, icon: number, tiers: [number, number][] }>>} Item id -> the scrip
 * paid, its icon, and [collectability, scrips] per tier, lowest first
 */
export async function scripRewards(item) {
  const [shops, shopItems, refines, rewards] = await sheets([
    "CollectablesShop", "CollectablesShopItem", "CollectablesShopRefine", "CollectablesShopRewardScrip"
  ])
  const refine = byId(refines)
  const reward = byId(rewards)

  // A shop has a page per job, ShopItems[n], each a group of CollectablesShopItem rows ("<group>.<n>")
  const groups = new Set(shops
    .filter((s) => s.RewardType === SCRIP_SHOP && s.Quest !== "0")
    .flatMap((s) => Object.keys(s).filter((k) => k.startsWith("ShopItems[")).map((k) => s[k]))
    .filter((g) => g !== "0"))

  const worth = new Map()
  for (const row of shopItems) {
    const r = reward[row.CollectablesShopRewardScrip]
    const c = refine[row.CollectablesShopRefine]
    const scrip = r && item[SCRIP_ITEMS[r.Currency]]
    if (!groups.has(row["#"].split(".")[0]) || !scrip || !c || worth.has(+row.Item)) continue

    const tiers = TIERS.map((t) => [+c[`${t}Collectability`], +r[`${t}Reward`]]).filter(([at, scrips]) => at && scrips)
    if (tiers.length) worth.set(+row.Item, { name: scrip.Name, icon: +scrip.Icon, tiers })
  }
  return worth
}

// Each expansion's level cap, past the last is the newest
const LEVEL_CAPS = [50, 60, 70, 80, 90]

/**
 * @param {number} level
 * @param {Record<string, string>[]} exVersions
 * @returns {string} The expansion a level belongs to, 51 to 60 Heavensward
 */
export function expansionOf(level, exVersions) {
  const index = LEVEL_CAPS.findIndex((cap) => level <= cap)
  return exVersions[Math.min(index === -1 ? LEVEL_CAPS.length : index, exVersions.length - 1)].Name
}

/**
 * Writes src/js/data/<name>.json. For data only the build reads, like the text on the detail pages.
 * @param {string} name
 * @param {object} value
 */
export function writeData(name, value) {
  fs.writeFileSync(path.join(DATA, `${name}.json`), JSON.stringify(value, null, 2) + "\n")
  console.log(`Wrote ${Object.keys(value).length} to src/js/data/${name}.json`)
}

/**
 * @returns {Map<string, Set<string>>} Zone name -> the weather that can happen there, from src/js/data/weather.json
 */
export const zoneWeather = () => new Map(JSON.parse(fs.readFileSync(path.join(DATA, "weather.json"), "utf8"))
  .map((z) => [z.name, new Set(z.weather.map(([name]) => name))]))

// The fish pages draw these from a fixed set, an icon per hookset and lure and marks per tug, so a new value upstream
// would show up broken
const CHOICES = {
  hookset: ["Powerful", "Precision"],
  lure: ["Ambitious", "Modest"],
  tug: ["light", "medium", "heavy"],
  gig: ["Small", "Normal", "Large"]
}

/**
 * Throws on times, weather or fish details the pages can't use, before anything is written.
 * @param {{ name: string, zone: string, times?: [number, number][], weather?: string[], previousWeather?: string[] }[]} list
 */
export function validate(list) {
  const zones = zoneWeather()
  const problems = []

  for (const entry of list) {
    const problem = (text) => problems.push(`${entry.name ?? entry.id} (${entry.zone}): ${text}`)
    if (entry.times) {
      if (!entry.times.length) problem("empty times, leave it out for any time")
      for (const [start, duration] of entry.times) {
        if (!(start >= 0 && start < 1440 && duration > 0 && duration <= 1440)) problem(`bad time [${start}, ${duration}]`)
      }
    }
    for (const key of ["weather", "previousWeather"]) {
      if (!entry[key]) continue
      if (!entry[key].length) problem(`empty ${key}, leave it out for any weather`)
      if (!zones.has(entry.zone)) problem(`${key} set, but the zone isn't in weather.json`)
      else for (const w of entry[key]) if (!zones.get(entry.zone).has(w)) problem(`${key} "${w}" never happens there`)
    }
    for (const [key, allowed] of Object.entries(CHOICES)) {
      if (entry[key] !== undefined && !allowed.includes(entry[key])) problem(`unknown ${key} "${entry[key]}"`)
    }
    if (entry.bait && (!entry.bait.length || entry.bait.some((step) => !step.length || step.some((b) => !(b.id > 0) || !b.name)))) {
      problem("bait with an empty step, or one without an id and name")
    }
    if (entry.predators && (!entry.predators.length || entry.predators.some((p) => !(p.id > 0) || !(p.count > 0) || !p.name))) {
      problem("intuition fish without an id, count or name")
    }
  }

  if (problems.length) throw new Error(`${problems.length} bad entries:\n${problems.join("\n")}`)
}

/**
 * Writes src/js/data/<name>/<expansion>.json per expansion (the page loads each when picked),
 * and src/js/data/<name>.json listing them.
 * @param {string} name "gathering", "sightseeing"
 * @param {Record<string, string>[]} exVersions ExVersion sheet rows, sets the expansion order
 * @param {{ expansion: string, entry: object }[]} entries In the order to write them
 */
export function writeExpansions(name, exVersions, entries) {
  validate(entries.map((e) => e.entry))
  const dir = path.join(DATA, name)
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(dir, { recursive: true })

  const index = exVersions.map((e) => e.Name)
    .map((expansion) => ({ expansion, list: entries.filter((e) => e.expansion === expansion).map((e) => e.entry) }))
    .filter(({ list }) => list.length)
    .map(({ expansion, list }) => {
      fs.writeFileSync(path.join(dir, `${slug(expansion)}.json`), JSON.stringify(list, null, 2) + "\n")
      return { name: expansion, file: slug(expansion), count: list.length }
    })

  fs.writeFileSync(path.join(DATA, `${name}.json`), JSON.stringify(index, null, 2) + "\n")
  for (const e of index) console.log(`${e.name}: ${e.count}`)
  console.log(`Wrote ${entries.length} to ${path.relative(process.cwd(), dir)}`)
}
