// Builds src/js/data/weather.json from the game's datamined sheets (xivapi/ffxiv-datamining).
// Run with "npm run weather-data" after a patch adds zones, the site itself never calls out for weather.
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(__dirname, "../src/js/data/weather.json")
const SHEETS = "https://raw.githubusercontent.com/xivapi/ffxiv-datamining/master/csv/en"

// TerritoryIntendedUse values worth forecasting, everything else is instances, inns and cutscenes
const TOWN = 0
const OVERWORLD = 1
const HOUSING = 13
const ISLAND_SANCTUARY = 49
const FIELD_OPERATIONS = [41, 48, 61] // Eureka, Bozja and Zadnor, Occult Crescent

// The same place shows up as several territories (e.g. Mist the town and Mist the housing ward),
// keep the one with the most specific weather
const USE_PRIORITY = [OVERWORLD, HOUSING, ...FIELD_OPERATIONS, ISLAND_SANCTUARY, TOWN]

async function sheet(name) {
  const res = await fetch(`${SHEETS}/${name}.csv`)
  if (!res.ok) throw new Error(`${name}.csv: HTTP ${res.status}`)
  return parseCsv(await res.text())
}

function parseCsv(text) {
  const rows = []
  let row = []
  let field = ""
  let quoted = false

  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c !== "\"") field += c
      else if (text[i + 1] === "\"") field += text[++i]
      else quoted = false
    } else if (c === "\"") {
      quoted = true
    } else if (c === ",") {
      row.push(field)
      field = ""
    } else if (c === "\n") {
      row.push(field.replace(/\r$/, ""))
      rows.push(row)
      row = []
      field = ""
    } else {
      field += c
    }
  }
  if (field || row.length) rows.push([...row, field])

  const [header, ...data] = rows
  return data
    .filter((r) => r.length === header.length)
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])))
}

function groupOf(territory, expansions) {
  const use = +territory.TerritoryIntendedUse
  if (use === HOUSING) return "Housing"
  if (FIELD_OPERATIONS.includes(use) || use === ISLAND_SANCTUARY) return "Field Operations"
  return expansions[territory.ExVersion]
}

async function main() {
  const [territories, rates, weathers, places, exVersions] = await Promise.all(
    ["TerritoryType", "WeatherRate", "Weather", "PlaceName", "ExVersion"].map(sheet)
  )

  const byId = (rows, key = "Name") => Object.fromEntries(rows.map((r) => [r["#"], r[key]]))
  const placeName = byId(places)
  const weatherName = byId(weathers)
  const expansions = byId(exVersions)
  const rateById = Object.fromEntries(rates.map((r) => [r["#"], r]))
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
      if (chance > 0) weather.push([weatherName[rate[`Weather[${i}]`]], chance])
    }

    zones.set(name, { use, id: +t["#"], name, group: groupOf(t, expansions), weather })
  }

  const sorted = [...zones.values()]
    .sort((a, b) => groups.indexOf(a.group) - groups.indexOf(b.group) || a.id - b.id)
    .map(({ name, group, weather }) => ({ name, group, weather }))

  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.writeFileSync(OUT, JSON.stringify(sorted, null, 2) + "\n")
  console.log(`Wrote ${sorted.length} zones to ${path.relative(process.cwd(), OUT)}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
