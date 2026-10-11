import fs from "fs"
import path from "path"
import sharp from "sharp"
import { fileURLToPath } from "url"

const SHEETS = "https://raw.githubusercontent.com/xivapi/ffxiv-datamining/master/csv/en"

/**
 * @param {string} name Sheet name, like "TerritoryType"
 * @returns {Promise<Record<string, string>[]>} One object per row, keyed by column name
 */
export async function sheet(name) {
  const res = await fetch(`${SHEETS}/${name}.csv`)
  if (!res.ok) throw new Error(`${name}.csv: HTTP ${res.status}`)
  return parseCsv(await res.text())
}

/**
 * @param {string[]} names
 * @returns {Promise<Record<string, string>[][]>} In the same order as `names`
 */
export const sheets = (names) => Promise.all(names.map(sheet))

/**
 * @param {Record<string, string>[]} rows
 * @returns {Record<string, Record<string, string>>} Row id ("#" column) -> row
 */
export const byId = (rows) => Object.fromEntries(rows.map((r) => [r["#"], r]))

/**
 * @param {string} text CSV with a header row, quoted fields can hold commas, quotes and newlines
 * @returns {Record<string, string>[]}
 */
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

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..")
const DATA = path.join(ROOT, "src/js/data")
const MAPS = path.join(ROOT, "src/images/maps")

// XIVAPI puts the map texture and its parchment background together, 2048px square
const MAP_SOURCE = "https://v2.xivapi.com/api/asset/map"
const MAP_SIZE = 1024

const ICON_SOURCE = "https://v2.xivapi.com/api/asset"
const ICONS = path.join(ROOT, "src/images/items")

/**
 * @param {string} name
 * @returns {string} "A Realm Reborn" -> "a-realm-reborn"
 */
export const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")

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
 * Builds a lookup for the aetheryte closest to a spot, on the same map. Aethernet shards don't count, only the ones
 * you can teleport to. Their Level rows aren't in the sheets, so the position comes from the map's marker for it,
 * placed in pixels on the 2048px map texture.
 * @param {{ aetherytes: Record<string, string>[], markers: Record<string, string>[], map: object, place: object }} sheets
 * Aetheryte and MapMarker rows, and Map and PlaceName by id
 * @returns {(mapRowId: string, x: number, y: number) => { name: string, x: number, y: number } | null} x/y are map coordinates
 */
export function nearestAetheryte({ aetherytes, markers, map, place }) {
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

  return (mapRowId, x, y) => {
    const distance = (a) => Math.hypot(a.x - x, a.y - y)
    return byMap.get(mapRowId)?.reduce((best, a) => distance(a) < distance(best) ? a : best) ?? null
  }
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
 * Saves maps to src/images/maps/ as WebP, one at a time since XIVAPI renders each on request.
 * Maps already there are kept, delete one to fetch it again after a patch redraws it.
 * @param {string[]} ids Map.Id values like "r2f1/00", repeats are fine
 */
export async function saveMaps(ids) {
  fs.mkdirSync(MAPS, { recursive: true })
  let saved = 0
  for (const id of new Set(ids)) {
    const file = path.join(MAPS, `${id.replace("/", "-")}.webp`)
    if (fs.existsSync(file)) continue

    const res = await fetch(`${MAP_SOURCE}/${id}`)
    if (!res.ok) throw new Error(`map ${id}: HTTP ${res.status}`)
    await sharp(Buffer.from(await res.arrayBuffer())).resize(MAP_SIZE).webp({ quality: 70 }).toFile(file)
    saved++
  }
  console.log(`Maps: ${saved} saved, ${new Set(ids).size - saved} already there`)
}

/**
 * Saves item icons to src/images/items/<id>.webp, so the site serves its own copies. The game's 80px, compressed hard,
 * as the lists show hundreds of them. A few at a time, XIVAPI renders each on request. Icons already there are kept.
 * @param {number[]} ids Item.Icon values, repeats are fine
 */
export async function saveIcons(ids) {
  fs.mkdirSync(ICONS, { recursive: true })
  const queue = [...new Set(ids)].filter((id) => !fs.existsSync(path.join(ICONS, `${id}.webp`)))
  const saved = queue.length

  await Promise.all(Array.from({ length: 6 }, async () => {
    while (queue.length) {
      const id = queue.pop()
      // ui/icon/022000/022408_hr1.tex, a folder per thousand
      const folder = String(Math.floor(id / 1000) * 1000).padStart(6, "0")
      const res = await fetch(`${ICON_SOURCE}?path=ui/icon/${folder}/${String(id).padStart(6, "0")}_hr1.tex&format=png`)
      if (!res.ok) throw new Error(`icon ${id}: HTTP ${res.status}`)
      await sharp(Buffer.from(await res.arrayBuffer())).webp({ quality: 60, effort: 6 }).toFile(path.join(ICONS, `${id}.webp`))
    }
  }))
  console.log(`Icons: ${saved} saved, ${new Set(ids).size - saved} already there`)
}

/**
 * @returns {Map<string, Set<string>>} Zone name -> the weather that can happen there, from src/js/data/weather.json
 */
export const zoneWeather = () => new Map(JSON.parse(fs.readFileSync(path.join(DATA, "weather.json"), "utf8"))
  .map((z) => [z.name, new Set(z.weather.map(([name]) => name))]))

/**
 * Throws on times or weather the pages can't use, before anything is written.
 * @param {{ name: string, zone: string, times?: [number, number][], weather?: string[], previousWeather?: string[] }[]} list
 */
function validate(list) {
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
