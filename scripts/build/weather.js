import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { aetherytesByMap, writeData } from "../common.js"
import { saveIcons, saveMaps, sheets } from "../sources/game.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(__dirname, "../../src/js/data/weather.json")

const TOWN = 0
const OVERWORLD = 1
const HOUSING = 13
const ISLAND_SANCTUARY = 49
// No weather of its own, only its icon for the Gold Saucer page's link preview
const GOLD_SAUCER = 23
const FIELD_OPERATIONS = [41, 48, 61, 60] // Eureka, Bozja and Zadnor, Occult Crescent, Cosmic Exploration

const USE_PRIORITY = [OVERWORLD, HOUSING, ...FIELD_OPERATIONS, ISLAND_SANCTUARY, TOWN]

/**
 * @param {Record<string, string>} territory TerritoryType row
 * @param {Record<string, string>} expansions ExVersion id -> name
 * @returns {string} The zone picker group: an expansion, "Housing" or "Field Operations"
 */
function groupOf(territory, expansions) {
  const use = +territory.TerritoryIntendedUse
  if (use === HOUSING) return "Housing"
  if (FIELD_OPERATIONS.includes(use) || use === ISLAND_SANCTUARY) return "Field Operations"
  return expansions[territory.ExVersion]
}

/**
 * A zone's icon as the teleport list shows it: its town's crest when its region has a town, the aetheryte otherwise. A
 * town's own zones are named after it ("The Crystarium" for Crystarium), which says what region is the town's.
 * @param {Record<string, string>[]} territories TerritoryType rows
 * @param {Record<string, string>[]} towns Town rows
 * @param {Record<string, string>[]} symbols MapSymbol rows
 * @param {Record<string, string>} placeName PlaceName id -> name
 * @returns {(territory: Record<string, string>) => number} Its icon
 */
function iconsOf(territories, towns, symbols, placeName) {
  const crest = new Map()
  for (const town of towns) {
    if (!(+town.Icon > 0)) continue
    const home = territories.find((t) => [town.Name, `The ${town.Name}`].includes(placeName[t.PlaceNameZone]))
    if (home) crest.set(home.PlaceNameRegion, +town.Icon)
  }
  const aetheryte = symbols.find((s) => placeName[s.PlaceName] === "Aetheryte")
  if (!aetheryte) throw new Error("No aetheryte in MapSymbol, has it changed?")
  return (t) => crest.get(t.PlaceNameRegion) ?? +aetheryte.Icon
}

async function main() {
  const [territories, rates, weathers, places, exVersions, maps, aetherytes, markers, towns, symbols] = await sheets(
    ["TerritoryType", "WeatherRate", "Weather", "PlaceName", "ExVersion", "Map", "Aetheryte", "MapMarker", "Town", "MapSymbol"]
  )

  const byId = (rows, key = "Name") => Object.fromEntries(rows.map((r) => [r["#"], r[key]]))
  const placeName = byId(places)
  const weatherName = byId(weathers)
  const weatherIcon = byId(weathers, "Icon")
  // Weather name -> its icon, for the forecast page
  const icons = {}
  const expansions = byId(exVersions)
  const iconOf = iconsOf(territories, towns, symbols, placeName)
  const rateById = Object.fromEntries(rates.map((r) => [r["#"], r]))
  const rows = (list) => Object.fromEntries(list.map((r) => [r["#"], r]))
  const mapRow = rows(maps)
  const aetherytesOn = aetherytesByMap({ aetherytes, markers, map: mapRow, place: rows(places) })
  const groups = [...exVersions.map((e) => e.Name), "Housing", "Field Operations"]

  const zones = new Map()
  for (const t of territories) {
    const use = +t.TerritoryIntendedUse
    if (!USE_PRIORITY.includes(use) || t.WeatherRate === "0" || t.PlaceName === "0") continue

    const name = use === ISLAND_SANCTUARY ? "Island Sanctuary" : placeName[t.PlaceName]
    const existing = zones.get(name)
    if (existing && USE_PRIORITY.indexOf(existing.use) <= USE_PRIORITY.indexOf(use)) continue

    // Weather[i] happens Rate[i]% of the time, rolled in order
    const rate = rateById[t.WeatherRate]
    const weather = []
    for (let i = 0; rate[`Rate[${i}]`] !== undefined; i++) {
      const chance = +rate[`Rate[${i}]`]
      if (chance <= 0) continue
      const id = rate[`Weather[${i}]`]
      weather.push([weatherName[id], chance])
      icons[weatherName[id]] ??= +weatherIcon[id]
    }

    zones.set(name, { use, id: +t["#"], name, group: groupOf(t, expansions), weather, mapRowId: mapRow[t.Map]?.Id ? t.Map : null, icon: iconOf(t) })
  }

  // Field operations by content, as their ids interleave (Cosmic Exploration's planets land between Occult Crescent's horns)
  const contentOrder = (z) => z.group === "Field Operations" ? USE_PRIORITY.indexOf(z.use) : 0
  const sorted = [...zones.values()]
    .sort((a, b) => groups.indexOf(a.group) - groups.indexOf(b.group) || contentOrder(a) - contentOrder(b) || a.id - b.id)
    .map(({ name, group, weather }) => ({ name, group, weather }))

  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.writeFileSync(OUT, JSON.stringify(sorted, null, 2) + "\n")
  console.log(`Wrote ${sorted.length} zones to ${path.relative(process.cwd(), OUT)}`)

  writeData("weather-icons", icons)
  await saveIcons(Object.values(icons))

  // Each zone's map and aetherytes, for its page. Apart from weather.json, which the pages' scripts load
  const withMap = [...zones.values()].filter((z) => z.mapRowId)
  writeData("weather-maps", Object.fromEntries(withMap.map((z) => [z.name, {
    image: mapRow[z.mapRowId].Id.replace("/", "-"),
    scale: +mapRow[z.mapRowId].SizeFactor,
    aetherytes: aetherytesOn.get(z.mapRowId) ?? []
  }])))
  await saveMaps(withMap.map((z) => mapRow[z.mapRowId].Id))

  // Each zone's icon, for its link preview
  const saucer = territories.find((t) => +t.TerritoryIntendedUse === GOLD_SAUCER)
  const zoneIcons = Object.fromEntries([...zones.values()].map((z) => [z.name, z.icon]))
  zoneIcons[placeName[saucer.PlaceName]] = iconOf(saucer)
  writeData("zone-icons", zoneIcons)
  await saveIcons(Object.values(zoneIcons))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
