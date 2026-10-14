import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { aetherytesByMap, saveIcons, saveMaps, saveZoneArt, sheets, writeData } from "./datamining.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(__dirname, "../src/js/data/weather.json")

const TOWN = 0
const OVERWORLD = 1
const HOUSING = 13
const ISLAND_SANCTUARY = 49
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

async function main() {
  const [territories, rates, weathers, places, exVersions, maps, aetherytes, markers, loadingImages] = await sheets(
    ["TerritoryType", "WeatherRate", "Weather", "PlaceName", "ExVersion", "Map", "Aetheryte", "MapMarker", "LoadingImage"]
  )

  const byId = (rows, key = "Name") => Object.fromEntries(rows.map((r) => [r["#"], r[key]]))
  const placeName = byId(places)
  const weatherName = byId(weathers)
  const weatherIcon = byId(weathers, "Icon")
  // Weather name -> its icon, for the forecast page
  const icons = {}
  const expansions = byId(exVersions)
  const loadingFile = byId(loadingImages, "FileName")
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

    const art = loadingFile[t.LoadingImage] && +t.PlaceNameIcon ? { loading: loadingFile[t.LoadingImage], name: +t.PlaceNameIcon } : null
    zones.set(name, { use, id: +t["#"], name, group: groupOf(t, expansions), weather, mapRowId: mapRow[t.Map]?.Id ? t.Map : null, art })
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

  // Each zone's loading screen and name, for its link preview
  const withArt = [...zones.values()].filter((z) => z.art)
  writeData("weather-art", Object.fromEntries(withArt.map((z) => [z.name, { loading: z.art.loading.replace(/^-/, ""), name: z.art.name }])))
  await saveZoneArt(withArt.map((z) => z.art))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
