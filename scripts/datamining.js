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

/**
 * @param {string} name
 * @returns {string} "A Realm Reborn" -> "a-realm-reborn"
 */
export const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")

const round = (n) => Math.round(n * 10) / 10

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
 * Writes src/js/data/<name>/<expansion>.json per expansion (the page loads each when picked),
 * and src/js/data/<name>.json listing them.
 * @param {string} name "gathering", "sightseeing"
 * @param {Record<string, string>[]} exVersions ExVersion sheet rows, sets the expansion order
 * @param {{ expansion: string, entry: object }[]} entries In the order to write them
 */
export function writeExpansions(name, exVersions, entries) {
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
